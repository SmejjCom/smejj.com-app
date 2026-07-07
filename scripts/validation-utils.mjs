import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const rootDir = process.cwd();

export function repoPath(file) {
  return path.join(rootDir, file);
}

export function readText(file) {
  return fs.readFileSync(repoPath(file), "utf8");
}

export function readJson(file) {
  return JSON.parse(readText(file));
}

export function exists(file) {
  return fs.existsSync(repoPath(file));
}

export function listRepoFiles() {
  try {
    const output = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
      cwd: rootDir,
      encoding: "utf8"
    });
    return output
      .split(/\r?\n/)
      .filter(Boolean)
      .filter((file) => fs.existsSync(repoPath(file)));
  } catch {
    return walkFiles(".").filter((file) => !file.startsWith(".git/") && !file.startsWith("node_modules/"));
  }
}

export function walkFiles(dir) {
  const start = repoPath(dir);
  if (!fs.existsSync(start)) return [];
  const files = [];
  function walk(currentAbs, currentRel) {
    for (const entry of fs.readdirSync(currentAbs, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const childAbs = path.join(currentAbs, entry.name);
      const childRel = currentRel === "." ? entry.name : `${currentRel}/${entry.name}`;
      if (entry.isDirectory()) walk(childAbs, childRel);
      else files.push(childRel);
    }
  }
  walk(start, dir);
  return files;
}

export function stripJsonComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

export function parseJsonOrJsonc(file) {
  const text = readText(file);
  return JSON.parse(file.endsWith(".jsonc") ? stripJsonComments(text) : text);
}

export function failAndExit(title, failures) {
  if (!failures.length) {
    console.log(`${title} OK`);
    return;
  }
  console.error(`${title} failed:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

export function walkValue(value, visit, pathParts = []) {
  visit(value, pathParts);
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((child, index) => walkValue(child, visit, [...pathParts, String(index)]));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    walkValue(child, visit, [...pathParts, key]);
  }
}

export function validateSchema(value, schema, label, pathParts = []) {
  const failures = [];
  const at = pathParts.length ? pathParts.join(".") : "$";

  if (schema.const !== undefined && value !== schema.const) {
    failures.push(`${label} ${at} must equal ${JSON.stringify(schema.const)}.`);
    return failures;
  }

  if (schema.enum && !schema.enum.includes(value)) {
    failures.push(`${label} ${at} must be one of ${schema.enum.map((item) => JSON.stringify(item)).join(", ")}.`);
    return failures;
  }

  if (schema.type && !matchesType(value, schema.type)) {
    failures.push(`${label} ${at} must be ${schema.type}.`);
    return failures;
  }

  if (typeof value === "number" && schema.minimum !== undefined && value < schema.minimum) {
    failures.push(`${label} ${at} must be >= ${schema.minimum}.`);
  }

  if (typeof value === "string" && schema.pattern && !new RegExp(schema.pattern).test(value)) {
    failures.push(`${label} ${at} must match /${schema.pattern}/.`);
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      failures.push(`${label} ${at} must have at least ${schema.minItems} item(s).`);
    }
    if (schema.items) {
      value.forEach((item, index) => {
        failures.push(...validateSchema(item, schema.items, label, [...pathParts, String(index)]));
      });
    }
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const required = schema.required || [];
    for (const key of required) {
      if (!(key in value)) failures.push(`${label} ${at} is missing required property ${key}.`);
    }

    const properties = schema.properties || {};
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) failures.push(`${label} ${at} has unexpected property ${key}.`);
      }
    }

    for (const [key, childSchema] of Object.entries(properties)) {
      if (key in value) failures.push(...validateSchema(value[key], childSchema, label, [...pathParts, key]));
    }
  }

  return failures;
}

function matchesType(value, type) {
  if (type === "array") return Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "object") return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  return typeof value === type;
}

export function isTextFile(file) {
  return /\.(cjs|css|html|js|json|jsonc|md|mjs|sh|svg|txt|webmanifest|xml|yml|yaml)$/i.test(file) ||
    file === ".env.example" ||
    file.endsWith(".gitkeep");
}

