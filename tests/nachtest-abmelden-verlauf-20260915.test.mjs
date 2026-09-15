// smejj.com — Live-Nachtest 15.09.2026 nach der A-bis-Z-Fixrunde, zwei Restbefunde:
//
// 7:  "Ausloggen" auf der Kontoseite (Profil -> Anmeldung & Sicherheit) loeschte nur den
//     Token; smejj.session.v1 blieb mit authenticated:true stehen, auch nach dem Neuladen.
//     Der sichtbare Knopf laeuft ueber account-privacy.js (ABO-LOCK) — das Aufraeumen
//     haengt sich darum in account-auth-state.js an denselben Klick.
// M2: Neues Geraet: der Server listet in Ablage-Reihenfolge, 180 alte Chats kamen vor
//     den sichtbaren, die Liste zeigte 40 s lang EINEN Eintrag. Jetzt: neueste zuerst.
import test from "node:test";
import assert from "node:assert/strict";
import { raeumeNachAbmeldenAuf, bindeAbmeldeAufraeumen } from "../public/account-auth-state.js";
import { neuesteZuerst } from "../public/chat-sync-auswahl.js";

function speicher(start = {}) {
  const daten = new Map(Object.entries(start));
  return {
    getItem: (k) => (daten.has(k) ? daten.get(k) : null),
    setItem: (k, v) => daten.set(k, String(v)),
    removeItem: (k) => daten.delete(k),
    daten
  };
}

test("7 gesund: nach dem Ausloggen sind Sitzung, Entwurf und Profil-E-Mail weg — Name und Chats bleiben", () => {
  const s = speicher({
    "smejj.session.v1": JSON.stringify({ authenticated: true, userId: "user_a" }),
    "smejj.entwurf.v1": "halb geschrieben",
    "smejj.profile.v1": JSON.stringify({ name: "Ada", email: "ada@example.de" }),
    "smejj.chats.v1": "[]"
  });
  raeumeNachAbmeldenAuf(s);
  assert.equal(s.getItem("smejj.session.v1"), null);
  assert.equal(s.getItem("smejj.entwurf.v1"), null);
  assert.deepEqual(JSON.parse(s.getItem("smejj.profile.v1")), { name: "Ada" });
  assert.equal(s.getItem("smejj.chats.v1"), "[]");
});

test("7 kaputt: ein Klick daneben raeumt nichts auf, der Klick auf #logoutLocal schon — und nur einmal verdrahtet", () => {
  const s = speicher({ "smejj.session.v1": "{}" });
  const zuhoerer = [];
  const view = { dataset: {}, addEventListener: (art, f) => zuhoerer.push([art, f]) };
  bindeAbmeldeAufraeumen(view, s);
  bindeAbmeldeAufraeumen(view, s);
  assert.equal(zuhoerer.length, 1, "applyAuthState laeuft mehrfach — der Zuhoerer darf sich nicht stapeln");
  const klick = (treffer) => zuhoerer[0][1]({ target: { closest: (sel) => (sel === "#logoutLocal" && treffer ? {} : null) } });
  klick(false);
  assert.equal(s.getItem("smejj.session.v1"), "{}");
  klick(true);
  assert.equal(s.getItem("smejj.session.v1"), null);
});

test("7: account-auth-state.js verdrahtet das Aufraeumen in applyAuthState", async () => {
  const { readFileSync } = await import("node:fs");
  const quelle = readFileSync("public/account-auth-state.js", "utf8");
  const apply = quelle.slice(quelle.indexOf("export function applyAuthState"), quelle.indexOf("function toggle("));
  assert.match(apply, /bindeAbmeldeAufraeumen\(view\)/);
});

test("M2: Nachhol-Abrufe laufen neueste zuerst, gleiche Staende in alter Reihenfolge", () => {
  const f = (n) => () => n;
  const reihe = neuesteZuerst([{ stand: 100, aufgabe: f("alt") }, { stand: 300, aufgabe: f("neu") }, { stand: 200, aufgabe: f("mitte-a") }, { stand: 200, aufgabe: f("mitte-b") }]);
  assert.deepEqual(reihe.map((a) => a()), ["neu", "mitte-a", "mitte-b", "alt"]);
  assert.deepEqual(neuesteZuerst(null), []);
  assert.deepEqual(neuesteZuerst([{ stand: 1 }]), [], "Eintrag ohne Aufgabe faellt weg statt zu werfen");
});

test("M2: chat-sync.js reicht die Abrufe sortiert an abarbeitenMitGrenze", async () => {
  const { readFileSync } = await import("node:fs");
  const quelle = readFileSync("public/chat-sync.js", "utf8");
  assert.match(quelle, /abarbeitenMitGrenze\(neuesteZuerst\(abrufe\)/);
  assert.match(quelle, /abrufe\.push\(\{ stand: fernStand, aufgabe: async \(\) => \{/);
});
