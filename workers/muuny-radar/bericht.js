// muuny ai radar — "Was hat muuny ai radar heute dazugelernt?"
//
// Der Bericht wird AUSSCHLIESSLICH aus den Laufprotokollen, dem Wissensindex und dem
// Verwendungsprotokoll des Tages gebaut. Er erfindet nichts: steht nichts drin, sagt
// er das. "Gelernt" heisst hier genau: neu GESPEICHERT (aktiv). Was muuny davon in
// Antworten VERWENDET hat, steht getrennt daneben.
import { radarSchluessel } from "./lauf.js";
import { leseIndex } from "./wissen.js";

export async function leseLaeufe(lager, prefix, tag) {
  const s = radarSchluessel(prefix);
  const liste = await lager.liste(`${s.laeufe}/${tag}/`);
  const out = [];
  for (const { key } of liste) {
    if (!key.endsWith(".json") || /\/\._/.test(key)) continue;
    try { const p = await lager.getJson(key, null); if (p?.laufId) out.push(p); } catch { /* ein kaputtes Protokoll verdirbt nicht den Tag */ }
  }
  return out.sort((a, b) => String(a.start).localeCompare(String(b.start)));
}

const summe = (laeufe, feld) => laeufe.reduce((n, l) => n + (Number(l.zahlen?.[feld]) || 0), 0);

export async function tagesbericht(lager, prefix, tag) {
  const laeufe = await leseLaeufe(lager, prefix, tag);
  const index = await leseIndex(lager, prefix);
  const verwendung = (await lager.getJson(radarSchluessel(prefix).verwendung(tag), null)) || { eintraege: {}, antworten: 0, luecken: {} };
  const echte = laeufe.filter((l) => l.ergebnis === "ok");
  // Antworttests stehen GETRENNT von "in Antworten verwendet": sie sind Pruefungen, keine
  // Nutzerantworten, und nennen das Modell, das geantwortet hat.
  const antworttests = [];
  for (const { key } of await lager.liste(`${radarSchluessel(prefix).tests(tag)}/`)) {
    if (!key.endsWith(".json") || /\/\._/.test(key)) continue;
    try { const t = await lager.getJson(key, null); if (t) antworttests.push(t); } catch { /* weiter */ }
  }

  // Was heute NEU gespeichert wurde — nur, was im Index noch so steht (zurueckgenommenes
  // wird als zurueckgenommen gezeigt, nicht verschwiegen).
  const gelernt = [];
  const aktualisiert = [];
  for (const l of echte) for (const g of l.gespeichert || []) {
    const e = index.eintraege[g.id];
    if (!e) continue;
    const zeile = { id: g.id, titel: e.titel, link: e.link, anbieter: e.anbieter, themaId: e.themaId, veroeffentlicht: e.veroeffentlicht,
      status: e.status, unsicherheit: e.unsicherheit, pruefgrund: e.pruefgrund, laufId: l.laufId,
      inAntwortVerwendet: Number(verwendung.eintraege?.[g.id] || 0) };
    (g.art === "neu" ? gelernt : aktualisiert).push(zeile);
  }
  const grundZaehler = {};
  for (const l of laeufe) for (const v of l.verworfen || []) {
    const g = String(v.grund).split(":")[0];
    grundZaehler[g] = (grundZaehler[g] || 0) + (Number(v.anzahl) || 1);
  }
  const offen = [];
  for (const l of echte) for (const f of l.funde || []) {
    if (f.status === "unbestaetigt" || f.status === "widerspruechlich") offen.push({ ...f, laufId: l.laufId });
  }
  const fehler = laeufe.filter((l) => l.ergebnis === "fehler" || l.ergebnis === "abgebrochen")
    .map((l) => ({ laufId: l.laufId, ergebnis: l.ergebnis, grund: l.grund, start: l.start }));
  const quellenFehler = [];
  for (const l of laeufe) for (const a of l.abrufe || []) if (a.ok === false || (a.grund && !a.ok)) quellenFehler.push({ quelle: a.quelle, grund: a.grund, laufId: l.laufId });

  const zahlen = {
    laeufe: laeufe.length, laeufeOk: echte.length,
    quellenGeprueft: summe(laeufe, "quellenGeprueft"),
    gefunden: summe(laeufe, "gefunden"),
    geprueft: summe(laeufe, "geprueft"),
    gespeichertNeu: gelernt.length,
    aktualisiert: aktualisiert.length,
    veraltetMarkiert: summe(echte, "veraltet"),
    unbestaetigt: summe(laeufe, "unbestaetigt"),
    widerspruechlich: summe(laeufe, "widerspruechlich"),
    verworfen: summe(laeufe, "verworfen"),
    anweisungsversucheGeblockt: summe(laeufe, "anweisungsversucheGeblockt"),
    inAntwortenVerwendet: Object.values(verwendung.eintraege || {}).reduce((a, b) => a + b, 0),
    antwortenMitWissen: Number(verwendung.antworten || 0),
    anfragen: laeufe.reduce((n, l) => n + (l.kosten?.anfragen || 0), 0),
    bytes: laeufe.reduce((n, l) => n + (l.kosten?.bytes || 0), 0),
    usd: laeufe.reduce((n, l) => n + (l.kosten?.usd || 0), 0)
  };
  let satz;
  if (!laeufe.length) satz = "Heute ist kein Lauf gelaufen. Es wurde nichts gelernt.";
  else if (!echte.length) satz = `Heute ${laeufe.length} Lauf/Läufe, keiner vollständig. Es wurde nichts gelernt.`;
  else if (!gelernt.length && !aktualisiert.length) satz = `Heute ${echte.length} vollständige(r) Lauf/Läufe, ${zahlen.gefunden} Funde geprüft — nichts davon war neu und belegt genug für die Wissensbasis.`;
  else satz = `Heute ${gelernt.length} neue und ${aktualisiert.length} aktualisierte Erkenntnis(se) gespeichert, aus ${zahlen.quellenGeprueft} geprüften Quellenabrufen. In Antworten verwendet: ${zahlen.inAntwortenVerwendet}.`;
  return { tag, frage: "Was hat muuny ai radar heute dazugelernt?", satz, zahlen, gelernt, aktualisiert, offen: offen.slice(0, 50),
    verworfenNachGrund: grundZaehler, fehler, quellenFehler: quellenFehler.slice(0, 50),
    luecken: verwendung.luecken || {}, antworttests, laeufe: laeufe.map((l) => ({ laufId: l.laufId, start: l.start, ende: l.ende, ergebnis: l.ergebnis,
      grund: l.grund, ausloeser: l.ausloeser, zahlen: l.zahlen, kosten: l.kosten, ressourcen: l.ressourcen })) };
}
