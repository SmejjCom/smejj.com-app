// smejj.com — Preisliste der oeffentlichen API.
//
// Gerechnet wird in MIKRO-USD (1 USD = 1_000_000), ganzzahlig. Gleitkomma
// bei Geld summiert sich ueber Millionen Anfragen zu echten Cent-Fehlern;
// Ganzzahlen tun das nicht. Der Kunde sieht USD mit zwei Nachkommastellen.
//
// Die Preise stehen je Markenmodell, nicht je Backend — ein Anbieterwechsel
// aendert unsere Kosten, nicht den Kundenpreis. Wer die Preise aendert,
// aendert sie hier und nirgends sonst; die Entwicklerseite liest sie vom Server.

export const MIKRO_JE_USD = 1_000_000;

/** USD je 1 Mio Token, getrennt nach Eingabe und Ausgabe. */
export const PREISE_USD_JE_MIO = Object.freeze({
  "smejj-1.0":           Object.freeze({ eingabe: 0.50, ausgabe: 1.50 }),
  "smejj-1.0-fast":      Object.freeze({ eingabe: 0.20, ausgabe: 0.60 }),
  "smejj-1.0-code":      Object.freeze({ eingabe: 1.00, ausgabe: 3.00 }),
  "smejj-1.0-reasoning": Object.freeze({ eingabe: 1.00, ausgabe: 4.00 })
});

/** Kosten einer Anfrage in Mikro-USD. Unbekanntes Modell = teuerster Satz (fail-closed). */
export function kostenMikro(modell, promptTokens, completionTokens) {
  const satz = PREISE_USD_JE_MIO[String(modell || "")] || PREISE_USD_JE_MIO["smejj-1.0-reasoning"];
  const eingabe = Math.round(sichereZahl(promptTokens) * satz.eingabe); // Token * (USD/1e6 Token) * 1e6 Mikro/USD
  const ausgabe = Math.round(sichereZahl(completionTokens) * satz.ausgabe);
  return eingabe + ausgabe;
}

export function mikroZuUsd(mikro) {
  return Number((sichereZahl(mikro) / MIKRO_JE_USD).toFixed(4));
}

export function usdZuMikro(usd) {
  const zahl = Number(usd);
  if (!Number.isFinite(zahl) || zahl < 0) return 0;
  return Math.round(zahl * MIKRO_JE_USD);
}

/** Preisliste fuer die Oberflaeche und /v1/models. */
export function preislistePayload() {
  return Object.fromEntries(Object.entries(PREISE_USD_JE_MIO).map(([id, satz]) => [id, { ...satz, einheit: "USD je 1 Mio Token" }]));
}

function sichereZahl(wert) {
  const zahl = Number(wert);
  return Number.isFinite(zahl) && zahl > 0 ? Math.floor(zahl) : 0;
}
