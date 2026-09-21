// muuny ai radar — Verbesserungsvorschlaege und selbst ergaenzte Themen.
//
// Zwei getrennte Dinge:
//  1. AUTO-THEMEN: das Radar darf SELBST ein Thema ergaenzen — aber nur in engen
//     Grenzen: hoechstens maxAutoThemen, nur fuer ein Modell, das in >= 3 GEPRUEFTEN
//     Funden aus >= 2 Domains der letzten 7 Tage vorkam, nur mit den kostenlosen
//     Quellen (HN-Suche, arXiv-Feed mit Vorfilter), Intervall 24 h. Jedes Auto-Thema steht im Protokoll
//     und ist im Admin abschaltbar.
//  2. VORSCHLAEGE: alles andere (Quelle ersetzen, Grenze aendern, Code, Modell,
//     Berechtigungen) wird nur VORGESCHLAGEN, mit Prioritaet und Begruendung, und
//     bleibt "offen", bis der Owner es freigibt oder ablehnt. Freigegebene Vorschlaege
//     vom Typ "thema" werden als neue Konfigurationsfassung angewandt; alle anderen
//     Typen setzt ein Mensch um — eine Freigabe hier aendert keinen Code.
import { createHash } from "node:crypto";
import { radarSchluessel } from "./lauf.js";

const id = (t) => createHash("sha256").update(t).digest("hex").slice(0, 12);

/**
 * Leitet Vorschlaege aus Laufprotokollen, Zustand und Luecken ab. Rein, deterministisch.
 * @param laeufe  Protokolle der letzten 7 Tage
 */
export function leiteAb({ laeufe, zustand, konfig, luecken = {} }) {
  const v = [];
  // Quellen, die dauerhaft scheitern.
  for (const [url, qs] of Object.entries(zustand?.quellen || {})) {
    if ((qs.fehlerInFolge || 0) >= 5) {
      const q = konfig.quellen.find((x) => url.startsWith(x.url.split("?")[0]));
      v.push({ id: id(`quelle:${url}`), typ: "quelle", prioritaet: q?.primaer ? 1 : 2,
        titel: `Quelle „${q?.name || url}" scheitert seit ${qs.fehlerInFolge} Abrufen`,
        begruendung: `Letzter Fehler: ${qs.letzterFehler}. Ersetzen oder abschalten.`, beleg: { url, fehler: qs.letzterFehler } });
    }
  }
  // Viele Fragen ohne passendes Thema.
  const ohne = Number(luecken["ohne-thema"] || 0);
  if (ohne >= 10) v.push({ id: id("luecke:ohne-thema"), typ: "thema", prioritaet: 2,
    titel: `${ohne} Fragen an muuny passten zu keinem Thema`, begruendung: "Themenliste pruefen; der Wortlaut wird aus Datenschutzgruenden nicht gespeichert.", beleg: { anzahl: ohne } });
  // Viele Widersprueche in einem Thema.
  const wid = {};
  for (const l of laeufe) for (const f of l.funde || []) if (f.status === "widerspruechlich") wid[f.themaId] = (wid[f.themaId] || 0) + 1;
  for (const [t, n] of Object.entries(wid)) if (n >= 3) v.push({ id: id(`widerspruch:${t}`), typ: "pruefung", prioritaet: 2,
    titel: `${n} Widersprueche im Thema ${t}`, begruendung: "Eine weitere Primaerquelle wuerde sie aufloesen.", beleg: { themaId: t, anzahl: n } });
  // Themen, die nichts liefern.
  for (const t of konfig.themen) {
    const funde = laeufe.reduce((n, l) => n + (l.funde || []).filter((f) => f.themaId === t.id).length, 0);
    const liefen = laeufe.filter((l) => (l.themen || []).includes(t.id)).length;
    if (liefen >= 4 && funde === 0) v.push({ id: id(`leer:${t.id}`), typ: "thema", prioritaet: 3,
      titel: `Thema „${t.name}" hat in ${liefen} Laeufen nichts geliefert`, begruendung: "Begriffe oder Quellen anpassen.", beleg: { themaId: t.id, laeufe: liefen } });
  }
  return v.sort((a, b) => a.prioritaet - b.prioritaet);
}

/** Auto-Themen: Modellnamen, die haeufig und belegt auftauchen, aber kein Thema haben. */
export function autoThemen({ laeufe, konfig, jetzt = new Date() }) {
  const vorhanden = konfig.themen.filter((t) => t.auto).length;
  const platz = Math.max(0, (konfig.grenzen?.maxAutoThemen ?? 5) - vorhanden);
  if (!platz) return [];
  const bekannt = new Set(konfig.themen.flatMap((t) => t.begriffe.map((b) => b.toLowerCase())));
  const zaehler = new Map();
  const seit = jetzt.getTime() - 7 * 86_400_000;
  for (const l of laeufe) {
    if (new Date(l.start).getTime() < seit || l.ergebnis !== "ok") continue;
    for (const f of l.funde || []) {
      if (f.status !== "geprueft" && f.status !== "aktualisiert") continue;
      for (const m of String(f.titel).matchAll(/\b(gemma|phi|olmo|granite|falcon|yi|glm|kimi|minimax|nemotron|command-r|jamba|grok)\b/gi)) {
        const name = m[1].toLowerCase();
        if (bekannt.has(name)) continue;
        const z = zaehler.get(name) || { n: 0, domains: new Set() };
        z.n += 1;
        try { z.domains.add(new URL(f.link).hostname); } catch { /* egal */ }
        zaehler.set(name, z);
      }
    }
  }
  const quellen = new Set(konfig.quellen.map((q) => q.id));
  return [...zaehler.entries()].filter(([, z]) => z.n >= 3 && z.domains.size >= 2).slice(0, platz)
    .map(([name, z]) => ({ id: `auto-${name}`, name: `Automatisch: ${name}`, auto: true, prioritaet: 3, intervallStunden: 24,
      warum: `Selbst ergaenzt: „${name}" kam in ${z.n} geprueften Funden aus ${z.domains.size} Domains vor und hatte kein Thema.`,
      begriffe: [name], quellen: ["hn", "arxiv-cl"].filter((q) => quellen.has(q)) }))
    .filter((t) => t.quellen.length);
}

/** Vorschlagsliste im Lager fortschreiben: neue kommen dazu, Entscheidungen bleiben. */
export async function aktualisiereVorschlaege(lager, prefix, neue, jetzt = new Date()) {
  const k = radarSchluessel(prefix).vorschlaege;
  const liste = (await lager.getJson(k, null)) || { vorschlaege: [] };
  const bekannt = new Map(liste.vorschlaege.map((x) => [x.id, x]));
  for (const n of neue) {
    const alt = bekannt.get(n.id);
    if (!alt) bekannt.set(n.id, { ...n, status: "offen", erstellt: jetzt.toISOString(), zuletztGesehen: jetzt.toISOString() });
    else bekannt.set(n.id, { ...alt, titel: n.titel, beleg: n.beleg, zuletztGesehen: jetzt.toISOString() });
  }
  const aus = { vorschlaege: [...bekannt.values()].sort((a, b) => (a.status === "offen" ? 0 : 1) - (b.status === "offen" ? 0 : 1) || a.prioritaet - b.prioritaet) };
  await lager.putJson(k, aus);
  return aus;
}

export async function entscheide(lager, prefix, vorschlagId, { entscheidung, wer = "admin", jetzt = new Date() }) {
  if (!["freigegeben", "abgelehnt"].includes(entscheidung)) return { ok: false, grund: "entscheidung_ungueltig" };
  const k = radarSchluessel(prefix).vorschlaege;
  const liste = (await lager.getJson(k, null)) || { vorschlaege: [] };
  const v = liste.vorschlaege.find((x) => x.id === vorschlagId);
  if (!v) return { ok: false, grund: "unbekannt" };
  if (v.status !== "offen") return { ok: false, grund: `schon_${v.status}` };
  v.status = entscheidung;
  v.entschieden = { am: jetzt.toISOString(), wer };
  await lager.putJson(k, liste);
  return { ok: true, vorschlag: v };
}
