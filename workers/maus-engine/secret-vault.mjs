// smejj.com Maus-Engine — secretRef-Aufloesung und Maskierung (fail-closed).
// Single Responsibility: sensible Werte NIE im Plan, NIE im Modellkontext,
// NIE in Logs. Plaene referenzieren nur secretRef; die Aufloesung passiert
// ausschliesslich zur Laufzeit aus der Worker-Umgebung (Salad-Secrets)
// oder einem injizierten Vault (Tests). BYOK-/Secret-Policy beachten.

const ENV_PREFIX = "SMEJJ_MAUS_SECRET_";

function envKeyFor(ref) {
  const normalized = String(ref || "").trim();
  if (!/^[a-zA-Z0-9._-]{1,200}$/.test(normalized)) {
    throw new Error("secret_ref_ungueltig");
  }
  return ENV_PREFIX + normalized.toUpperCase().replace(/[.-]/g, "_");
}

// Vault erstellen. Ohne injizierte Werte liest er nur SMEJJ_MAUS_SECRET_*.
// Fehlender Eintrag => Fehler (fail-closed), niemals leerer String.
export function createSecretVault({ values, env = process.env } = {}) {
  const resolved = [];
  return {
    resolve(ref) {
      const fromValues = values && Object.prototype.hasOwnProperty.call(values, ref) ? values[ref] : undefined;
      const value = fromValues !== undefined ? fromValues : env[envKeyFor(ref)];
      if (typeof value !== "string" || value.length === 0) {
        throw new Error(`secret_nicht_verfuegbar: ${ref}`);
      }
      resolved.push(value);
      return value;
    },
    // Alle bisher aufgeloesten Werte in einem Text maskieren, bevor er in
    // Logs, Artefakte oder Planner-Rueckfragen gelangt.
    mask(text) {
      let output = String(text ?? "");
      for (const value of resolved) {
        while (output.includes(value)) output = output.replace(value, "***");
      }
      return output;
    }
  };
}
