// Betreiber-Freigabe 1h (15.09.2026): Abmelden entfernt die Profil-E-Mail aus dem Browser.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const quelle = readFileSync(new URL("../public/profile-dock-menu.js", import.meta.url), "utf8");
const start = quelle.indexOf("export function vergissProfilEmail");
const koerper = quelle.slice(start, quelle.indexOf("\n}\n", start) + 2).replace("export function", "function");
const vergissProfilEmail = new Function("STORAGE_KEYS", `${koerper}; return vergissProfilEmail;`)({ profile: "smejj.profile.v1" });
const speicher = (start) => { const m = new Map(Object.entries(start)); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), m }; };

test("E-Mail weg, Name und andere Felder bleiben, andere Schluessel unberuehrt", () => {
  const s = speicher({ "smejj.profile.v1": JSON.stringify({ name: "Ada", email: "ada@example.com", bild: "x" }), "smejj.chats": "bleibt" });
  assert.equal(vergissProfilEmail(s), true);
  assert.deepEqual(JSON.parse(s.m.get("smejj.profile.v1")), { name: "Ada", bild: "x" });
  assert.equal(s.m.get("smejj.chats"), "bleibt");
});

test("ohne Profil, ohne E-Mail oder kaputtes JSON: nichts anfassen", () => {
  assert.equal(vergissProfilEmail(speicher({})), false);
  const ohne = speicher({ "smejj.profile.v1": JSON.stringify({ name: "Ada" }) });
  assert.equal(vergissProfilEmail(ohne), false);
  const kaputt = speicher({ "smejj.profile.v1": "{kaputt" });
  assert.equal(vergissProfilEmail(kaputt), false);
  assert.equal(kaputt.m.get("smejj.profile.v1"), "{kaputt");
});

test("beide Abmeldewege rufen es auf (Dock-Menue und Konto-Ansicht)", () => {
  assert.match(quelle, /vergissProfilEmail\(\);[\s\S]{0,300}?location\.assign\("\/"\);/);
  const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  const logout = app.slice(app.indexOf('$("#logoutLocal")'), app.indexOf('$("#logoutLocal")') + 600);
  assert.match(logout, /JSON\.stringify\(\{ name: state\.profile\.name \|\| "" \}\)/);
});
