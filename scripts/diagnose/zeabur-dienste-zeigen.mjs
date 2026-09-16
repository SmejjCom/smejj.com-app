#!/usr/bin/env node
// smejj.com — zeigt Projekte, Umgebungen und Dienste bei Zeabur und die
// Mutationen, mit denen Umgebungswerte gesetzt werden.
//
// WARUM ES DAS GIBT (2026-08-14): Bis heute endete jede Umgebungsaenderung mit
// "der Betreiber muss den Wert im Portal einfuegen". Der Zugang lag die ganze
// Zeit in ~/.config/zeabur/cli.yaml — er wurde nur nie gesucht (siehe
// zeabur-schluessel-suchen.mjs). Damit Skripte Werte selbst setzen koennen,
// braucht es zwei Dinge: die IDs von Dienst und Umgebung, und den genauen
// Namen der Mutation. Beides zeigt dieses Skript.
//
// Rein lesend. Gibt niemals einen Schluessel oder einen Variablenwert aus —
// nur Namen und IDs.
//
// Aufruf: node scripts/diagnose/zeabur-dienste-zeigen.mjs
import { zeaburAbfrage } from "./zeabur-api.mjs";

console.log("=== Mutationen rund um Umgebungswerte ===");
const schema = await zeaburAbfrage(`{
  __schema { mutationType { fields { name args { name type { name kind ofType { name } } } } } }
}`);
for (const feld of schema?.__schema?.mutationType?.fields || []) {
  if (!/variable|environment/i.test(feld.name)) continue;
  const args = feld.args.map((a) => `${a.name}: ${a.type.name || a.type.ofType?.name || a.type.kind}`).join(", ");
  console.log(`  ${feld.name}(${args})`);
}

console.log("=== Projekte, Umgebungen, Dienste ===");
// Zwei Abfragen wie findeDienst() in scripts/deploy/zeabur-umgebung-setzen.mjs:
// `Project.services` ist eine Liste, keine Verbindung — die verschachtelte Fassung
// endete mit HTTP 422 ("Cannot query field \"edges\" on type \"Service\"", 17.09.).
const projekte = await zeaburAbfrage(`{
  projects { edges { node { _id name environments { _id name } } } }
}`);
for (const kante of projekte?.projects?.edges || []) {
  const p = kante.node;
  const umgebungen = (p.environments || []).map((e) => `${e.name}=${e._id}`).join("  ");
  console.log(`  Projekt ${p.name}  (${p._id})`);
  console.log(`    Umgebungen: ${umgebungen || "(keine)"}`);
  const dienste = await zeaburAbfrage(
    `query($p:ObjectID!){ services(projectID:$p, limit:100){ edges { node { _id name } } } }`,
    { p: p._id }
  );
  for (const s of dienste?.services?.edges || []) console.log(`    Dienst ${s.node.name}  (${s.node._id})`);
}
