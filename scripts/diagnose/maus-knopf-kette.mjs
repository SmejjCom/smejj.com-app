#!/usr/bin/env node
// smejj.com — prueft die GANZE Kette hinter dem Maus-Knopf, ohne Oberflaeche.
//
// Sitzung oeffnen -> Erlaubnis bilden -> Server planen lassen -> uebersetzen
// -> Schritt fuer Schritt gegen die Sitzung fahren. Genau die Reihenfolge,
// die der Knopf im Panel durchlaeuft, mit denselben Modulen.
//
// Aufruf: TOK=$(node scripts/verlauf/mint-eval-token.mjs) node scripts/diagnose/maus-knopf-kette.mjs
import { planAlsAuftraege, fahreAuftraege, erlaubteHosts } from "../../public/browser-pane-maus.js";

const BASIS = "https://smejj-control.zeabur.app";
const TOKEN = process.env.TOK;
const kopf = { "content-type": "application/json", Authorization: `Bearer ${TOKEN}`, Origin: "https://smejj.com" };
const SEITE = "https://smejj.com/hilfe.html";

// 1. Sitzung oeffnen — im Panel ist sie schon offen.
const s = await (await fetch(`${BASIS}/api/browser/session`, {
  method: "POST", headers: kopf,
  body: JSON.stringify({ url: SEITE, viewport: { width: 1365, height: 900 } })
})).json();
if (!s.sessionId) { console.log("KEINE SITZUNG:", s.error); process.exit(1); }
console.log("1. Sitzung offen:", s.sessionId.slice(0, 12), "|", s.title);

// 2. Erlaubnis wie im Knopf: nur die offene Seite.
const hosts = erlaubteHosts(SEITE);
console.log("2. Erlaubnis:", hosts.join(", "));

// 3. Server planen lassen.
const p = await (await fetch(`${BASIS}/api/maus/run`, {
  method: "POST", headers: kopf,
  body: JSON.stringify({
    nurPlan: true, plannerModel: "glm-5.2",
    task: process.env.AUFTRAG || "Lies die Ueberschrift.",
    capsuleRef: `knopftest-${Date.now().toString(36)}`, domainAllowlist: hosts
  })
})).json();
if (!p.ok) { console.log("PLANEN GESCHEITERT:", p.error); process.exit(1); }
console.log("3. Plan:", p.planId, "|", (p.plan.steps || []).length, "Schritte");

// 4. Uebersetzen.
const auftraege = planAlsAuftraege(p.plan);
console.log("4. Uebersetzt in", auftraege.length, "Panel-Auftraege");

// 5. Fahren — genau wie das Panel, mit Antwortpruefung.
const ergebnis = await fahreAuftraege({
  auftraege, pauseMs: 300,
  zeige: (t, nr, ges) => console.log(`   Maus ${nr}/${ges}: ${t}`),
  // Den GRUND mitgeben, nicht nur "gestoppt". Ein Diagnosewerkzeug, das
  // verschweigt, warum etwas scheiterte, kostet genau den Lauf, den es
  // erklaeren sollte.
  sende: async (aktion) => {
    const antwort = await (await fetch(`${BASIS}/api/browser/session/act`, {
      method: "POST", headers: kopf,
      body: JSON.stringify({ sessionId: s.sessionId, action: aktion })
    })).json();
    if (!antwort?.ok) console.log("      Grund:", antwort?.error || "(ohne Angabe)", "| Aktion:", JSON.stringify(aktion).slice(0, 120));
    return antwort;
  }
});
console.log("5. Ergebnis:", ergebnis.fehler ? `GESTOPPT bei "${ergebnis.fehler}"` : `${ergebnis.getan} Schritte erledigt`);
// Wo steht der Browser am Ende? Bei einem Klick-Auftrag ist die Endadresse
// der eigentliche Beweis — "3 Schritte erledigt" sagt nichts darueber, ob
// der Klick auch WOHIN gefuehrt hat.
const stand = await (await fetch(`${BASIS}/api/browser/session/act`, {
  method: "POST", headers: kopf,
  body: JSON.stringify({ sessionId: s.sessionId, action: { type: "scroll", deltaY: 1 } })
})).json();
console.log("   Endadresse:", stand?.finalUrl || "(unbekannt)");
console.log("   Endtitel  :", stand?.title || "(unbekannt)");
if (Object.keys(ergebnis.gelesen).length) console.log("   Gelesen:", JSON.stringify(ergebnis.gelesen));

await fetch(`${BASIS}/api/browser/session/close`, { method: "POST", headers: kopf, body: JSON.stringify({ sessionId: s.sessionId }) });
console.log(ergebnis.getan === auftraege.length ? "\n>>> DER KNOPF FUNKTIONIERT" : "\n>>> UNVOLLSTAENDIG");
