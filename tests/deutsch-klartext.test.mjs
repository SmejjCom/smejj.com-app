// smejj.com — Durchgängig Deutsch in den Ansichten nach dem Login (Betreiber 08.09.).
// Gemessen im Emulator (deutsche Oberfläche): Reasoning, Sync, Coding, Key, Free-safe, BYOK,
// Session, Diff standen in Einstellungen, Konto, Speicher und Kostenschutz. Laufzeit-Ersetzung,
// nur bei exaktem Treffer und deutscher Oberfläche — in anderen Sprachen greift sie nie.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const quelle = readFileSync(new URL("../public/deutsch-klartext.js", import.meta.url), "utf8");
const m = await import("data:text/javascript;base64," + Buffer.from(quelle.split("\nif (typeof document")[0]).toString("base64"));

test("die gemessenen Anglizismen haben ein deutsches Wort", () => {
  for (const alt of ["Modelle und Reasoning", "Reasoning-Aufwand", "Offline, Sync, Platz", "Free-safe", "BYOK vorbereitet", "Coding-Arbeitsbereich", "Coding öffnen", "API-Key", "API-Keys", "Key sicher verbinden", "Session", "local-only", "Exakte Diff-Freigabe", "Free-Guard anzeigen", "Sync", "Standardmodell, BYOK und lokale Modelle.", "Wenn ein Diff oder externer Schritt wartet.", "owner/editor/viewer/local-only vorbereitet", "Aufbauphase: ohne Limit."]) {
    assert.ok(m.WOERTER[alt], `${alt} fehlt`);
    assert.doesNotMatch(m.WOERTER[alt], /Reasoning|Sync|Coding|\bKey|Free|BYOK|Session|Diff|Limit|local-only/, `${alt} -> ${m.WOERTER[alt]} ist noch nicht deutsch`);
  }
});

test("Ersetzung nur bei exaktem Treffer, Randleerraum bleibt, Unbekanntes unverändert", () => {
  assert.equal(m.deutschesWort("  Reasoning-Aufwand "), "  Gründlichkeit beim Nachdenken ");
  assert.equal(m.deutschesWort("Reasoning-Aufwand hoch"), "Reasoning-Aufwand hoch", "kein Teiltreffer");
  assert.equal(m.deutschesWort("Models and reasoning"), "Models and reasoning", "englische Oberfläche traegt schon die Übersetzung");
  assert.equal(m.deutschesWort(""), "");
});

test("nur bei deutscher Oberfläche; Textknoten, Optionen und Platzhalter, nie in code/pre/textarea", () => {
  const de = { documentElement: { getAttribute: () => "de" } };
  const en = { documentElement: { getAttribute: () => "en" } };
  assert.equal(m.oberflaecheDeutsch(de), true);
  assert.equal(m.oberflaecheDeutsch({ documentElement: { getAttribute: () => null } }), true, "ohne lang ist die Quelle deutsch");
  assert.equal(m.oberflaecheDeutsch(en), false);
  // Mini-DOM
  const knoten = (text, tag) => ({ textContent: text, parentElement: { tagName: tag } });
  const liste = [knoten("Free-safe", "OPTION"), knoten("API-Key", "PRE"), knoten("Sync", "SPAN")];
  let i = -1;
  const platz = { placeholder: "Cline API-Key einmalig eingeben" };
  const doc = { documentElement: de.documentElement, createTreeWalker: () => ({ nextNode: () => liste[++i] || null }) };
  const wurzel = { querySelectorAll: () => [platz] };
  assert.equal(m.deutscheWoerter(wurzel, doc), 3);
  assert.equal(liste[0].textContent, "Kostenfrei & sicher");
  assert.equal(liste[1].textContent, "API-Key", "in <pre> bleibt alles wie es ist");
  assert.equal(liste[2].textContent, "Abgleich");
  assert.equal(platz.placeholder, "Cline-API-Schlüssel einmalig eingeben");
  i = -1;
  assert.equal(m.deutscheWoerter(wurzel, { ...doc, documentElement: en.documentElement }), 0, "englisch: nichts anfassen");
});

test("Modul hängt am Start-Haken und im Service-Worker-Vorrat, Beobachter auf der Hülle", () => {
  const menu = readFileSync(new URL("../public/chat-actions-menu.js", import.meta.url), "utf8");
  assert.ok(menu.includes('import("/assets/deutsch-klartext.js").catch(() => {})'));
  const sw = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.ok(sw.includes('"/assets/deutsch-klartext.js"'));
  assert.match(quelle, /new MutationObserver\(nachziehen\)\.observe\(huelle, \{ childList: true, subtree: true \}\)/);
});
