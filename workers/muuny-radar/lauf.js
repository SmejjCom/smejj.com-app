// muuny ai radar — EIN Recherchelauf, von der Sperre bis zum Protokoll.
//
// Sicherer Betrieb (Owner-Auftrag), hier und nur hier durchgesetzt:
//  * nie zwei Laeufe gleichzeitig: Sperre im Prozess UND im Lager (mit Herzschlag;
//    eine Sperre ohne Herzschlag seit 10 min gilt als verwaist und wird uebernommen)
//  * NOTAUS schlaegt alles: kein Start, und ein laufender Lauf bricht beim naechsten
//    Abruf ab und speichert NICHTS (ein halber Lauf schreibt kein halbes Wissen)
//  * Budget unlesbar = kein Lauf. Tages- und Monatsgrenzen fuer Anfragen, Bytes, USD
//  * App-Funktionen haben Vorrang: ist der Server ausgelastet, wartet der Lauf
//  * Quellen, die wiederholt scheitern, werden mit wachsendem Abstand gemieden
//  * jeder Lauf hinterlaesst ein Protokoll — auch der gescheiterte und der abgebrochene
import os from "node:os";
import { randomUUID } from "node:crypto";
import { GRENZEN_STANDARD, QUELLEN_STANDARD, THEMEN_STANDARD, pruefeKonfig } from "./konfig.js";
import { baueAbrufer } from "./abruf.js";
import { abrufAdresse, zerlege } from "./parser.js";
import { passtZumThema, pruefeFunde } from "./pruefung.js";
import { bestandAus, leseIndex, speichere } from "./wissen.js";

export const SPERRE_VERWAIST_MS = 10 * 60_000;
export const STATUS = Object.freeze(["recherchiert", "prueft", "wartet", "pausiert", "fehler"]);

export function radarSchluessel(prefix = "muuny/") {
  const r = `${prefix}radar`;
  return {
    zustand: `${r}/zustand.json`,
    konfig: `${r}/konfig.json`,
    konfigVersionen: `${r}/konfig`,
    sperre: `${r}/sperre.json`,
    laeufe: `${r}/laeufe`,
    verbrauch: (monat) => `${r}/verbrauch/${monat}.json`,
    verwendung: (tag) => `${r}/verwendung/${tag}.json`,
    vorschlaege: `${r}/vorschlaege.json`,
    // Antworttests: Testfragen gegen das Wissen, mit Angabe, WELCHES Modell geantwortet hat.
    tests: (tag) => `${r}/tests/${tag}`
  };
}

export const tagVon = (d) => new Date(d).toISOString().slice(0, 10);
export const monatVon = (d) => new Date(d).toISOString().slice(0, 7);

export function standardKonfig() {
  return { version: 0, themen: structuredClone(THEMEN_STANDARD), quellen: structuredClone(QUELLEN_STANDARD),
    grenzen: { ...GRENZEN_STANDARD }, aktualisiert: null, von: "standard" };
}

export async function leseKonfig(lager, prefix) {
  const k = await lager.getJson(radarSchluessel(prefix).konfig, null);
  if (!k) return standardKonfig();
  return { ...k, grenzen: { ...GRENZEN_STANDARD, ...(k.grenzen || {}) } };
}

/** Neue Konfigurationsfassung. Die alte bleibt unter konfig/v<n>.json — Rueckgaengig ist ein erneutes Schreiben. */
export async function schreibeKonfig(lager, prefix, neu, { wer = "admin", jetzt = new Date(), grund = "" } = {}) {
  const pruef = pruefeKonfig(neu);
  if (!pruef.ok) return { ok: false, fehler: pruef.fehler };
  const s = radarSchluessel(prefix);
  const alt = await leseKonfig(lager, prefix);
  const k = { version: (alt.version || 0) + 1, themen: neu.themen, quellen: neu.quellen,
    grenzen: { ...GRENZEN_STANDARD, ...(neu.grenzen || {}) }, aktualisiert: jetzt.toISOString(), von: wer, grund: String(grund).slice(0, 200) };
  await lager.putJson(`${s.konfigVersionen}/v${k.version}.json`, k);
  await lager.putJson(s.konfig, k);
  return { ok: true, version: k.version };
}

export async function leseZustand(lager, prefix) {
  const z = await lager.getJson(radarSchluessel(prefix).zustand, null);
  return z || { eingeschaltet: false, notaus: false, quellen: {}, themen: {}, letzterErfolg: null, letzterLauf: null };
}

/**
 * Budget lesen. Wirft, wenn es nicht lesbar ist — der Aufrufer darf dann NICHT laufen.
 */
export async function leseVerbrauch(lager, prefix, jetzt) {
  const k = radarSchluessel(prefix).verbrauch(monatVon(jetzt));
  let v;
  try { v = await lager.getJson(k, null); } catch (f) { throw new Error(`budget_unlesbar:${String(f?.message || f).slice(0, 60)}`); }
  if (v === null) return { monat: monatVon(jetzt), usd: 0, tage: {} };
  if (typeof v !== "object" || typeof v.tage !== "object" || !Number.isFinite(Number(v.usd))) throw new Error("budget_unlesbar:format");
  return v;
}

export function budgetRest(verbrauch, grenzen, jetzt) {
  const t = verbrauch.tage?.[tagVon(jetzt)] || { anfragen: 0, bytes: 0, usd: 0 };
  return {
    anfragen: Math.max(0, grenzen.anfragenProTag - t.anfragen),
    bytes: Math.max(0, grenzen.bytesProTag - t.bytes),
    usdTag: Math.max(0, grenzen.usdProTag - t.usd),
    usdMonat: Math.max(0, grenzen.usdProMonat - Number(verbrauch.usd || 0)),
    heute: t
  };
}

/** Ist der Server gerade mit der App beschaeftigt? Dann wartet das Radar. */
export function serverAusgelastet({ last = os.loadavg()[0], kerne = os.cpus().length || 1, schwelle = 0.7 } = {}) {
  return last / kerne > schwelle;
}

/** Welche Themen sind faellig? Manuell: alle. */
export function faelligeThemen(konfig, zustand, jetzt, { manuell = false } = {}) {
  return konfig.themen.filter((t) => t.aktiv !== false).filter((t) => {
    if (manuell) return true;
    const zuletzt = zustand.themen?.[t.id]?.letzterLauf;
    return !zuletzt || (jetzt - new Date(zuletzt)) >= Number(t.intervallStunden) * 3600_000;
  }).sort((a, b) => (a.prioritaet || 9) - (b.prioritaet || 9));
}

/** Rueckzug nach Fehlern: 30 min, 1 h, 2 h … hoechstens 24 h. */
export function naechsterVersuch(fehlerInFolge, jetzt) {
  if (!fehlerInFolge) return null;
  const ms = Math.min(24 * 3600_000, 30 * 60_000 * 2 ** (fehlerInFolge - 1));
  return new Date(jetzt.getTime() + ms).toISOString();
}

/** Naechster geplanter Lauf: das frueheste faellige Thema. */
export function naechsterGeplanterLauf(konfig, zustand, jetzt) {
  let frueh = null;
  for (const t of konfig.themen.filter((x) => x.aktiv !== false)) {
    const zuletzt = zustand.themen?.[t.id]?.letzterLauf;
    const f = zuletzt ? new Date(new Date(zuletzt).getTime() + Number(t.intervallStunden) * 3600_000) : jetzt;
    if (!frueh || f < frueh) frueh = f;
  }
  return frueh ? new Date(Math.max(frueh.getTime(), jetzt.getTime())).toISOString() : null;
}

/** Sperre im Lager. Liefert {ok, laufId} oder {ok:false, grund}. */
export async function holeSperre(lager, prefix, { laufId, jetzt = () => new Date(), warte = (ms) => new Promise((r) => setTimeout(r, ms)), pruefMs = 1500 } = {}) {
  const k = radarSchluessel(prefix).sperre;
  const vorhanden = await lager.getJson(k, null);
  if (vorhanden && vorhanden.laufId && !vorhanden.frei) {
    const alter = jetzt() - new Date(vorhanden.herzschlag || vorhanden.seit);
    if (alter < SPERRE_VERWAIST_MS) return { ok: false, grund: "lauf_aktiv", laufId: vorhanden.laufId };
  }
  const eintrag = { laufId, seit: jetzt().toISOString(), herzschlag: jetzt().toISOString(), host: os.hostname(),
    uebernommen: vorhanden && !vorhanden.frei ? vorhanden.laufId : null };
  await lager.putJson(k, eintrag);
  // Zweimal lesen: hat ein zweiter Starter im selben Augenblick geschrieben, gewinnt der letzte Schreiber — der andere zieht zurueck.
  await warte(pruefMs);
  const nachher = await lager.getJson(k, null);
  if (nachher?.laufId !== laufId) return { ok: false, grund: "lauf_aktiv", laufId: nachher?.laufId };
  return { ok: true, laufId, uebernommen: eintrag.uebernommen };
}

export async function herzschlag(lager, prefix, laufId, jetzt = new Date()) {
  const k = radarSchluessel(prefix).sperre;
  const s = await lager.getJson(k, null);
  if (s?.laufId !== laufId) return false;
  await lager.putJson(k, { ...s, herzschlag: jetzt.toISOString() });
  return true;
}

export async function gibSperreFrei(lager, prefix, laufId, jetzt = new Date()) {
  const k = radarSchluessel(prefix).sperre;
  const s = await lager.getJson(k, null);
  if (s?.laufId === laufId) await lager.putJson(k, { ...s, frei: true, freiSeit: jetzt.toISOString() });
}

let laufImProzess = null;
export function laufenderLauf() { return laufImProzess; }

/**
 * Fuehrt einen Lauf aus.
 * @param opts.manuell     "Jetzt recherchieren": auch wenn ausgeschaltet, alle Themen
 * @param opts.abbrechen   () => boolean — wird vor jedem Abruf gefragt (Notaus, Abbruch)
 * @returns das Laufprotokoll
 */
export async function fuehreLaufAus(lager, { prefix = "muuny/", fetchImpl = fetch, jetzt = () => new Date(), manuell = false,
  ausloeser = "zeitplan", abbrechen = () => false, ausgelastet = () => serverAusgelastet(), warte, abrufOptionen = {},
  laufId = `lauf-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 6)}`, log = () => {} } = {}) {
  const s = radarSchluessel(prefix);
  const start = jetzt();
  const cpu0 = process.cpuUsage();
  const protokoll = { laufId, ausloeser, manuell, start: start.toISOString(), ende: null, ergebnis: null, grund: null,
    themen: [], abrufe: [], zahlen: { quellenGeprueft: 0, abrufeOk: 0, abrufeFehler: 0, unveraendertLeer: 0, gefunden: 0,
      geprueft: 0, unbestaetigt: 0, widerspruechlich: 0, unveraendert: 0, verworfen: 0, gespeichertNeu: 0, aktualisiert: 0, veraltet: 0,
      anweisungsversucheGeblockt: 0 },
    funde: [], verworfen: [], gespeichert: [], veraltet: [], kosten: { usd: 0, anfragen: 0, bytes: 0 }, ressourcen: null, autoThemen: [] };

  const schreibeProtokoll = async () => {
    protokoll.ende = jetzt().toISOString();
    const cpu = process.cpuUsage(cpu0);
    protokoll.ressourcen = { dauerMs: jetzt() - start, cpuMs: Math.round((cpu.user + cpu.system) / 1000),
      rssMb: Math.round(process.memoryUsage().rss / 1048576) };
    try { await lager.putJson(`${s.laeufe}/${tagVon(start)}/${laufId}.json`, protokoll); }
    catch (f) { protokoll.protokollFehler = String(f?.message || f).slice(0, 120); log("Protokoll nicht gespeichert:", protokoll.protokollFehler); }
    return protokoll;
  };
  const ende = async (ergebnis, grund) => { protokoll.ergebnis = ergebnis; protokoll.grund = grund; return schreibeProtokoll(); };

  if (laufImProzess) { protokoll.ergebnis = "abgelehnt"; protokoll.grund = `lauf_aktiv:${laufImProzess.laufId}`; return protokoll; }
  laufImProzess = { laufId, status: "prueft", seit: start.toISOString(), schritt: "vorbereitung" };
  let sperre = null;
  try {
    let zustand, konfig, verbrauch;
    try {
      zustand = await leseZustand(lager, prefix);
      konfig = await leseKonfig(lager, prefix);
    } catch (f) { return await ende("fehler", `lager_unlesbar:${String(f?.message || f).slice(0, 80)}`); }
    if (zustand.notaus) return await ende("abgelehnt", "notaus");
    if (!zustand.eingeschaltet && !manuell) return await ende("abgelehnt", "ausgeschaltet");
    if (ausgelastet()) return await ende("wartet", "server_ausgelastet_app_hat_vorrang");
    try { verbrauch = await leseVerbrauch(lager, prefix, start); }
    catch (f) { return await ende("fehler", String(f.message)); }
    const rest = budgetRest(verbrauch, konfig.grenzen, start);
    protokoll.budgetVorher = rest;
    if (rest.anfragen <= 0) return await ende("abgelehnt", "tagesbudget_anfragen_erschoepft");
    if (rest.bytes <= 0) return await ende("abgelehnt", "tagesbudget_bytes_erschoepft");
    if (rest.usdMonat <= 0 || rest.usdTag <= 0) return await ende("abgelehnt", "kostenbudget_erschoepft");

    sperre = await holeSperre(lager, prefix, { laufId, jetzt, ...(warte ? { warte } : {}) });
    if (!sperre.ok) { sperre = null; return await ende("abgelehnt", `lauf_aktiv:${(await lager.getJson(s.sperre, null))?.laufId}`); }
    if (sperre.uebernommen) protokoll.uebernahmeVerwaisterSperre = sperre.uebernommen;

    const themen = faelligeThemen(konfig, zustand, start, { manuell });
    protokoll.themen = themen.map((t) => t.id);
    if (!themen.length) return await ende("nichts_faellig", "kein_thema_faellig");

    // Jede Adresse nur einmal pro Lauf abrufen, auch wenn sie mehreren Themen dient.
    const quelleVon = new Map(konfig.quellen.filter((q) => q.aktiv !== false).map((q) => [q.id, q]));
    const abrufe = new Map(); // url -> {q, themen:[]}
    for (const t of themen) for (const qid of t.quellen || []) {
      const q = quelleVon.get(qid);
      if (!q) continue;
      const url = abrufAdresse(q, t);
      const e = abrufe.get(url) || { q, url, themen: [] };
      e.themen.push(t);
      abrufe.set(url, e);
    }

    const abrufer = baueAbrufer({ fetchImpl, jetzt: () => jetzt().getTime(), ...(warte ? { warte } : {}), ...abrufOptionen });
    const maxAnfragen = Math.min(konfig.grenzen.anfragenProLauf, rest.anfragen);
    const quellenStand = structuredClone(zustand.quellen || {});
    const kandidaten = [];
    laufImProzess.status = "recherchiert";
    for (const { q, url, themen: fuer } of abrufe.values()) {
      if (abbrechen()) return await ende("abgebrochen", "notaus_oder_abbruch_waehrend_recherche");
      if (abrufer.zaehler.anfragen >= maxAnfragen) { protokoll.budgetGrenze = "anfragen_pro_lauf"; break; }
      if (abrufer.zaehler.bytes >= rest.bytes) { protokoll.budgetGrenze = "bytes_pro_tag"; break; }
      const qs = quellenStand[url] || {};
      if (qs.naechsterVersuchAb && new Date(qs.naechsterVersuchAb) > jetzt()) {
        protokoll.abrufe.push({ quelle: q.id, url, uebersprungen: "rueckzug_nach_fehlern", bis: qs.naechsterVersuchAb });
        continue;
      }
      laufImProzess.schritt = q.id;
      protokoll.zahlen.quellenGeprueft += 1;
      const r = await abrufer.hole(url, { etag: qs.etag, lastModified: qs.lastModified, maxBytes: konfig.grenzen.bytesProAbruf });
      const eintrag = { quelle: q.id, url, status: r.status, ok: r.ok, bytes: r.bytes || 0, ms: r.ms, versuche: r.versuche, grund: r.grund || null };
      if (!r.ok) {
        protokoll.zahlen.abrufeFehler += 1;
        const n = (qs.fehlerInFolge || 0) + 1;
        quellenStand[url] = { ...qs, fehlerInFolge: n, letzterFehler: r.grund, letzterAbruf: jetzt().toISOString(), naechsterVersuchAb: naechsterVersuch(n, jetzt()) };
        protokoll.abrufe.push(eintrag);
        continue;
      }
      protokoll.zahlen.abrufeOk += 1;
      quellenStand[url] = { etag: r.etag || qs.etag || null, lastModified: r.lastModified || qs.lastModified || null,
        fehlerInFolge: 0, letzterAbruf: jetzt().toISOString(), letzterErfolg: jetzt().toISOString() };
      if (r.unveraendert) { protokoll.zahlen.unveraendertLeer += 1; eintrag.unveraendert = true; protokoll.abrufe.push(eintrag); continue; }
      // Grosse Feeds (arXiv: hunderte Paper am Tag) werden VOR der Deckelung nach den
      // Themenbegriffen gefiltert — sonst waeren die ersten 15 zufaellig und fast alle themenfremd.
      const { funde: alle, fehler } = zerlege(q, r.text, { max: q.vorfilter ? 1000 : konfig.grenzen.maxFundeProQuelle });
      let funde = alle;
      if (q.vorfilter) {
        funde = alle.filter((f) => fuer.some((t) => passtZumThema(f, t))).slice(0, konfig.grenzen.maxFundeProQuelle);
        const weg = alle.length - funde.length;
        eintrag.vorfilter = { gesamt: alle.length, passend: funde.length };
        if (weg > 0) {
          protokoll.zahlen.gefunden += weg;
          protokoll.zahlen.verworfenVorfilter = (protokoll.zahlen.verworfenVorfilter || 0) + weg;
          protokoll.verworfen.push({ titel: `${weg} Eintraege ohne Themenbezug (Vorfilter)`, link: url, quelle: q.name, grund: "themenfremd:vorfilter", anzahl: weg });
        }
      }
      eintrag.funde = funde.length;
      if (fehler) { eintrag.grund = fehler; protokoll.zahlen.abrufeFehler += 1; protokoll.zahlen.abrufeOk -= 1; }
      protokoll.abrufe.push(eintrag);
      for (const f of funde) {
        protokoll.zahlen.gefunden += 1;
        protokoll.zahlen.anweisungsversucheGeblockt += f.anweisungsversuche;
        const thema = fuer.find((t) => passtZumThema(f, t)) || fuer[0];
        kandidaten.push({ fund: f, themaId: thema.id });
      }
      await herzschlag(lager, prefix, laufId, jetzt()).catch(() => {});
    }
    protokoll.kosten = { usd: 0, anfragen: abrufer.zaehler.anfragen, bytes: abrufer.zaehler.bytes };

    if (abbrechen()) return await ende("abgebrochen", "notaus_oder_abbruch_vor_pruefung");
    laufImProzess.status = "prueft";
    laufImProzess.schritt = "pruefung";
    let index;
    try { index = await leseIndex(lager, prefix); }
    catch (f) { return await ende("fehler", `wissen_unlesbar:${String(f?.message || f).slice(0, 80)}`); }
    const { ergebnisse, verworfen } = pruefeFunde(kandidaten, { themen: konfig.themen, bestand: bestandAus(index),
      jetzt: start, maxAlterTage: konfig.grenzen.maxAlterTage });
    const knapp = (r) => ({ schluessel: r.schluessel, themaId: r.themaId, status: r.status, grund: r.grund, titel: r.fund.titel,
      link: r.fund.link, quelle: r.fund.quelle, primaer: r.fund.primaer, veroeffentlicht: r.fund.veroeffentlicht,
      quellen: r.quellen?.map((q) => q.url) });
    protokoll.funde = ergebnisse.map(knapp);
    protokoll.verworfen = [...protokoll.verworfen, ...verworfen.map((v) => ({ titel: String(v.fund.titel || "").slice(0, 160), link: v.fund.link, quelle: v.fund.quelle, grund: v.grund }))];
    for (const r of ergebnisse) {
      if (r.status === "geprueft" || r.status === "aktualisiert") protokoll.zahlen.geprueft += 1;
      else if (r.status in protokoll.zahlen) protokoll.zahlen[r.status] += 1;
    }
    protokoll.zahlen.verworfen = verworfen.length + (protokoll.zahlen.verworfenVorfilter || 0);

    if (abbrechen()) return await ende("abgebrochen", "notaus_oder_abbruch_vor_speichern");
    let gespeichert;
    try { gespeichert = await speichere(lager, prefix, ergebnisse, { laufId, jetzt: start }); }
    catch (f) { return await ende("fehler", `speichern_fehlgeschlagen:${String(f?.message || f).slice(0, 80)}`); }
    protokoll.gespeichert = gespeichert.gespeichert;
    protokoll.veraltet = gespeichert.veraltet;
    protokoll.zahlen.gespeichertNeu = gespeichert.gespeichert.filter((g) => g.art === "neu").length;
    protokoll.zahlen.aktualisiert = gespeichert.gespeichert.filter((g) => g.art === "aktualisiert").length;
    protokoll.zahlen.veraltet = gespeichert.veraltet.length;

    // Verbrauch und Zustand fortschreiben. Scheitert das, ist der Lauf ein Fehler:
    // ein Budget, das nicht mitzaehlt, ist keins.
    try {
      const v = await leseVerbrauch(lager, prefix, start);
      const t = v.tage[tagVon(start)] || { anfragen: 0, bytes: 0, usd: 0, laeufe: 0 };
      v.tage[tagVon(start)] = { anfragen: t.anfragen + protokoll.kosten.anfragen, bytes: t.bytes + protokoll.kosten.bytes,
        usd: t.usd + protokoll.kosten.usd, laeufe: (t.laeufe || 0) + 1 };
      v.usd = Number(v.usd || 0) + protokoll.kosten.usd;
      await lager.putJson(s.verbrauch(monatVon(start)), v);
      const z = await leseZustand(lager, prefix);
      z.quellen = quellenStand;
      z.themen = z.themen || {};
      for (const t of themen) z.themen[t.id] = { letzterLauf: start.toISOString(), laufId };
      z.letzterErfolg = { laufId, am: jetzt().toISOString(), zahlen: protokoll.zahlen };
      z.letzterLauf = { laufId, am: jetzt().toISOString(), ergebnis: "ok" };
      await lager.putJson(s.zustand, z);
    } catch (f) { return await ende("fehler", `verbrauch_nicht_gespeichert:${String(f?.message || f).slice(0, 80)}`); }
    return await ende("ok", protokoll.budgetGrenze ? `teilweise:${protokoll.budgetGrenze}` : null);
  } catch (f) {
    return await ende("fehler", `unerwartet:${String(f?.message || f).slice(0, 120)}`);
  } finally {
    if (sperre) await gibSperreFrei(lager, prefix, laufId, jetzt()).catch(() => {});
    // Gescheiterte Laeufe im Zustand vermerken (erfolgreiche haben es oben getan).
    if (protokoll.ergebnis && protokoll.ergebnis !== "ok") {
      try {
        const z = await leseZustand(lager, prefix);
        z.letzterLauf = { laufId, am: jetzt().toISOString(), ergebnis: protokoll.ergebnis, grund: protokoll.grund };
        await lager.putJson(s.zustand, z);
      } catch { /* Lager weg: das Protokoll (falls geschrieben) traegt es */ }
    }
    laufImProzess = null;
  }
}
