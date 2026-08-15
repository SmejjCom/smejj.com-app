#!/usr/bin/env node
// smejj.com — welche Zeabur-Mutationen es fuer Umgebungsvariablen gibt.
// Reine Introspektion, aendert nichts. Entstanden 2026-08-14, weil die
// Anlege-Mutation bei einer BESTEHENDEN Variable mit
// "This variable has been created" abbricht — gesucht war die Aendern-Form.
import { zeaburAbfrage } from "./zeabur-api.mjs";

const d = await zeaburAbfrage(`{ __schema { mutationType { fields { name args { name type { kind name ofType { kind name } } } } } } }`);
const felder = d?.__schema?.mutationType?.fields || [];
const treffer = felder.filter((f) => /variable|env/i.test(f.name));

for (const f of treffer) {
  const args = f.args.map((a) => {
    const t = a.type?.name || a.type?.ofType?.name || a.type?.kind;
    return `${a.name}: ${t}`;
  });
  console.log(`${f.name}(${args.join(", ")})`);
}
if (!treffer.length) console.log("(keine Mutation mit Bezug zu Variablen gefunden)");
