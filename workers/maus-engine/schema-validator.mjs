// smejj.com Maus-Engine — minimaler JSON-Schema-Validator (fail-closed).
// Single Responsibility: genau die in schemas/maus-action-plan.schema.json
// verwendete Keyword-Teilmenge von Draft 2020-12 validieren. Unbekannte
// Keywords fuehren zum Fehler (fail-closed), nie zum stillen Ignorieren.
// Kein Modell, keine Abhaengigkeiten.

const IGNORED_KEYWORDS = new Set([
  "$schema", "$id", "title", "description", "default", "examples", "$defs"
]);
const SUPPORTED_KEYWORDS = new Set([
  "$ref", "type", "const", "enum", "required", "properties",
  "additionalProperties", "unevaluatedProperties", "minProperties",
  "maxProperties", "items", "minItems", "maxItems", "minLength", "maxLength",
  "pattern", "minimum", "maximum", "allOf", "oneOf", "propertyNames"
]);

function typeOf(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function matchesType(value, type) {
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "array") return Array.isArray(value);
  if (type === "object") return typeOf(value) === "object";
  return typeof value === type;
}

function resolveRef(ref, rootSchema) {
  if (typeof ref !== "string" || !ref.startsWith("#/")) {
    throw new Error(`schema_ref_unsupported: ${ref}`);
  }
  let node = rootSchema;
  for (const part of ref.slice(2).split("/")) {
    node = node?.[part.replace(/~1/g, "/").replace(/~0/g, "~")];
    if (node === undefined) throw new Error(`schema_ref_unresolved: ${ref}`);
  }
  return node;
}

function assertKnownKeywords(schema, path) {
  for (const key of Object.keys(schema)) {
    if (!IGNORED_KEYWORDS.has(key) && !SUPPORTED_KEYWORDS.has(key)) {
      throw new Error(`schema_keyword_unsupported: ${key} at ${path}`);
    }
  }
}

// Validiert data gegen schema. Rueckgabe: { ok, evaluated } — evaluated ist
// die Menge der durch dieses Schema (inkl. allOf/oneOf/$ref) ausgewerteten
// Objekt-Properties, benoetigt fuer unevaluatedProperties:false.
function validateNode(schema, data, path, root, errors) {
  const evaluated = new Set();
  if (schema === true) return { ok: true, evaluated };
  if (schema === false) {
    errors.push(`${path}: schema false`);
    return { ok: false, evaluated };
  }
  assertKnownKeywords(schema, path);
  let ok = true;
  const fail = (message) => { errors.push(`${path}: ${message}`); ok = false; };

  if (schema.$ref !== undefined) {
    const sub = validateNode(resolveRef(schema.$ref, root), data, path, root, errors);
    if (!sub.ok) ok = false;
    for (const p of sub.evaluated) evaluated.add(p);
  }
  if (schema.type !== undefined && !matchesType(data, schema.type)) {
    fail(`erwartet ${schema.type}, erhalten ${typeOf(data)}`);
    return { ok: false, evaluated };
  }
  if (schema.const !== undefined && data !== schema.const) fail(`erwartet const ${JSON.stringify(schema.const)}`);
  if (schema.enum !== undefined && !schema.enum.includes(data)) fail(`nicht in enum ${JSON.stringify(schema.enum)}`);

  if (typeof data === "string") {
    if (schema.minLength !== undefined && data.length < schema.minLength) fail(`minLength ${schema.minLength}`);
    if (schema.maxLength !== undefined && data.length > schema.maxLength) fail(`maxLength ${schema.maxLength}`);
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(data)) fail(`pattern ${schema.pattern}`);
  }
  if (typeof data === "number") {
    if (schema.minimum !== undefined && data < schema.minimum) fail(`minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && data > schema.maximum) fail(`maximum ${schema.maximum}`);
  }
  if (Array.isArray(data)) {
    if (schema.minItems !== undefined && data.length < schema.minItems) fail(`minItems ${schema.minItems}`);
    if (schema.maxItems !== undefined && data.length > schema.maxItems) fail(`maxItems ${schema.maxItems}`);
    if (schema.items !== undefined) {
      data.forEach((item, index) => {
        if (!validateNode(schema.items, item, `${path}[${index}]`, root, errors).ok) ok = false;
      });
    }
  }
  if (typeOf(data) === "object") {
    const keys = Object.keys(data);
    if (schema.required) {
      for (const name of schema.required) {
        if (!(name in data)) fail(`Pflichtfeld fehlt: ${name}`);
      }
    }
    if (schema.minProperties !== undefined && keys.length < schema.minProperties) fail(`minProperties ${schema.minProperties}`);
    if (schema.maxProperties !== undefined && keys.length > schema.maxProperties) fail(`maxProperties ${schema.maxProperties}`);
    if (schema.propertyNames) {
      for (const name of keys) {
        if (!validateNode(schema.propertyNames, name, `${path}.${name}(name)`, root, errors).ok) ok = false;
      }
    }
    if (schema.properties) {
      for (const [name, propSchema] of Object.entries(schema.properties)) {
        if (name in data) {
          evaluated.add(name);
          if (!validateNode(propSchema, data[name], `${path}.${name}`, root, errors).ok) ok = false;
        }
      }
    }
    if (schema.additionalProperties !== undefined) {
      const declared = new Set(Object.keys(schema.properties || {}));
      for (const name of keys) {
        if (declared.has(name)) continue;
        if (schema.additionalProperties === false) {
          fail(`unzulaessiges Feld: ${name}`);
        } else {
          evaluated.add(name);
          if (!validateNode(schema.additionalProperties, data[name], `${path}.${name}`, root, errors).ok) ok = false;
        }
      }
    }
  }
  if (schema.allOf) {
    for (const branch of schema.allOf) {
      const sub = validateNode(branch, data, path, root, errors);
      if (!sub.ok) ok = false;
      for (const p of sub.evaluated) evaluated.add(p);
    }
  }
  if (schema.oneOf) {
    let matches = 0;
    let matchedEvaluated = null;
    const branchErrors = [];
    for (const branch of schema.oneOf) {
      const localErrors = [];
      const sub = validateNode(branch, data, path, root, localErrors);
      if (sub.ok) {
        matches += 1;
        matchedEvaluated = sub.evaluated;
      } else {
        branchErrors.push(localErrors[0] || "unbekannt");
      }
    }
    if (matches !== 1) {
      fail(matches === 0
        ? `keine oneOf-Variante passt (${branchErrors.slice(0, 3).join(" | ")})`
        : `mehrdeutig: ${matches} oneOf-Varianten passen`);
    } else {
      for (const p of matchedEvaluated) evaluated.add(p);
    }
  }
  if (schema.unevaluatedProperties === false && typeOf(data) === "object" && ok) {
    for (const name of Object.keys(data)) {
      if (!evaluated.has(name)) fail(`unausgewertetes Feld: ${name}`);
    }
  }
  return { ok, evaluated };
}

// Oeffentliche Schnittstelle. Input: geparstes Schema-Objekt. Output:
// Validator-Funktion data -> { ok, errors } (fail-closed bei jedem Fehler).
export function createValidator(rootSchema) {
  if (typeOf(rootSchema) !== "object") throw new Error("schema_invalid_root");
  return function validate(data) {
    const errors = [];
    const { ok } = validateNode(rootSchema, data, "$", rootSchema, errors);
    return { ok: ok && errors.length === 0, errors };
  };
}
