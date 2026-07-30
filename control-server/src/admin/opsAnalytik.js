// smejj.com — Modul W: Analytik (Single Responsibility: was tatsaechlich passiert ist).
//
// DIE ENTSCHEIDUNG, DIE DIESES MODUL TRAEGT
//
// "Analytik" heisst ueblicherweise: Besucher zaehlen, Seitenaufrufe, Verweildauer,
// Herkunft, Geraet, Klickweg. Davon wird hier NICHTS gemessen — und zwar nicht,
// weil es schwer waere, sondern weil es dafuer ein Skript, eine Kennung und ein
// Einverstaendnis auf jeder Seite braeuchte. Genau das hat smejj.com bewusst
// nicht: die Startseite laedt keinen Zaehler, setzt kein Cookie und schickt
// keinen Aufruf an Dritte. Ein Analytik-Bildschirm, der dafuer eigens ein
// Tracking einbaut, wuerde das Wichtigste am Produkt kaputtmachen, um eine
// Kachel zu fuellen.
//
// Gemessen wird deshalb ausschliesslich, was im Betrieb OHNEHIN entsteht und
// bereits auf IDrive e2 liegt:
//
//   1. REGISTRIERUNGEN je Tag  — aus dem Nutzer-Index (createdAt).
//   2. VERWALTUNGSAKTIVITAET je Tag — aus dem Audit-Log (ein Schluessel je Eintrag).
//   3. MAILVERSAND je Tag — aus dem Zustellprotokoll (seit 29.07.2026).
//   4. LAEUFE je Tag — aus der Job-Ablage `jobs/` im Hauptspeicher.
//
// Zu 4 gehoert eine Korrektur, die erst der Live-Lauf gezeigt hat: zuerst stand
// hier `capsules/app/`. Das ist aber die Ablage, in die ein ENTWICKLUNGSRECHNER
// seine Dokumentations-Kapseln schiebt (Skript
// `scripts/agent/upload_capsule_to_idrive.mjs`, dort landet sie im
// Deploy-Eimer). Der Control-Server liest den Hauptspeicher — dort ist dieses
// Prefix leer. Ergebnis live: "Laeufe: 0" fuer 14 Tage, obwohl das System
// arbeitet. Ein dauerhaft nullwertiger Zaehler ist schlimmer als keiner: er
// sieht wie ein Befund aus. Gezaehlt wird deshalb `jobs/` — dort legt die
// Laufzeit jeden Auftrag ab (`assertSafeJobPrefix` erzwingt dieses Prefix).
//
// Gezaehlt werden SCHLUESSEL, nicht Inhalte: bei 2 und 3 wird nur gelistet, nie
// gelesen. Das ist billig und es kommt kein Inhalt in die Naehe dieser Ansicht.
//
// VIER REGELN, damit keine Zahl mehr behauptet als sie weiss:
//
//   a) EINE NULL IST EIN MESSERGEBNIS. Ist eine Quelle nicht lesbar, steht dort
//      `null` und die Reihe sagt "nicht erreichbar" — niemals eine Null, die wie
//      "an dem Tag war nichts" aussieht.
//   b) EINE ABGESCHNITTENE LISTE SAGT ES. Wer nur die erste Seite gesehen hat,
//      kennt eine Untergrenze, keine Summe.
//   c) DER NUTZER-INDEX IST EINE PROJEKTION. Ist er aelter als der juengste Tag
//      im Zeitraum, koennen die letzten Registrierungen fehlen — dann wird das
//      gesagt, statt eine zu niedrige Zahl als Tatsache zu zeigen.
//   d) EIN UNBRAUCHBARER ZEITSTEMPEL WIRD NICHT GERATEN. Was kein verwertbares
//      Datum hat, zaehlt unter "ohne Datum" und landet NICHT auf heute.
import { parseS3ListPage, signedS3List } from "../storage/s3Signer.js";
import { mapMitGrenze } from "../shared/parallelFetch.js";
import { projektionFrisch } from "./analytikProjektion.js";
import { readUserIndex } from "./userIndex.js";

const TAG_MS = 24 * 60 * 60 * 1000;
const MAX_TAGE = 90;
const MAX_SEITEN = 8;
const AUDIT_PREFIX = "admin/audit";
const MAIL_PREFIX = "mail/zustellung";
const JOB_PREFIX = "jobs/";
// Die Ablage kennt zwei Formen: `jobs/<status>/<id>.json` (Warteschlange) und
// `jobs/<id>/…` (Kapsel eines Laufs). Diese Ordner sind Zustaende, keine
// Auftraege — sonst zaehlte "open" als ein Lauf.
const JOB_ZUSTAENDE = new Set([
  "open", "queued", "claims", "cancelled", "succeeded", "failed", "completed", "error", "moved"
]);
// Frueher als das gibt es dieses Projekt nicht. Ein Zeitstempel davor ist kaputt,
// kein alter Eintrag — genau diese Klasse hat in Modul S einmal Alter von rund
// 9700 Tagen erzeugt.
const FRUEHESTES_JAHR = 2020;

// WOHER DIE ZAHLEN KOMMEN — und warum nicht bei jedem Aufruf frisch.
//
// Die drei Auflistungs-Reihen (Verwaltung, Mails, Laeufe) liegen als
// Tagesprojektion auf IDrive e2 (`analytikProjektion.js`). Zuerst wurde bei
// JEDEM Aufruf gezaehlt: live 824 ms, ueber dem p99-Budget. Ein Zaehlstand im
// Arbeitsspeicher haette das nur JE INSTANZ geloest — bei 50 Instanzen 50 kalte
// Aufrufe pro Minute, also ein Engpass, der mit der Instanzzahl mitwaechst.
// Genau das verbietet die Skalierungsregel ("kein Zaehlstand im Serverspeicher,
// alles auf IDrive e2").
//
// Die Registrierungs-Reihe und der Bestand kommen dagegen LIVE aus dem
// Nutzer-Index. Grund: der Index muss fuer den Bestand ohnehin gelesen werden
// (eine Momentaufnahme darf nicht zehn Minuten alt sein), und wenn er schon in
// der Hand ist, kostet die Tagesreihe daraus nichts extra — und ist frischer.

export const NICHT_GEMESSEN = Object.freeze([
  {
    was: "Besucher und Seitenaufrufe",
    warum: "Die Seite laedt keinen Zaehler und setzt keine Kennung. Ohne beides gibt es "
      + "keine Besucherzahl — auch keine geschaetzte."
  },
  {
    was: "Verweildauer, Herkunft, Geraet, Klickweg",
    warum: "Das sind Merkmale einzelner Menschen. Sie zu erheben braeuchte ein "
      + "Einverstaendnis auf jeder Seite; erhoben wird nichts davon."
  },
  {
    was: "Token-Verbrauch und Kosten je Anfrage",
    warum: "Wird nicht je Anfrage weggeschrieben. Was dazu messbar ist, steht in Modul F."
  },
  {
    was: "Antwortzeiten der laufenden Anfragen",
    warum: "Es gibt keine dauerhafte Zeitreihe. Gemessene Werte stehen in den Benchmarks "
      + "je Release, nicht hier."
  }
]);

export async function analytikUebersicht({
  env = process.env,
  jetztMs = Date.now(),
  tage = 14,
  fetchImpl = fetch,
  leseIndex = readUserIndex,
  zaehleSchluessel = null,
  zaehleLaeufe = null,
  holeProjektion = projektionFrisch
} = {}) {
  const spanne = spanneAus(tage);
  const tagListe = tageAbsteigend(jetztMs, spanne);
  const erlaubt = new Set(tagListe);
  const cfg = idriveConfig(env);

  const zaehler = zaehleSchluessel
    || ((praefixe, art) => zaehleNachTagUeberS3(cfg, praefixe, art, fetchImpl));
  const laufZaehler = zaehleLaeufe || (() => zaehleLaeufeUeberS3(cfg, fetchImpl));

  // Was die Projektion neu zaehlt, wenn sie zu alt ist. Absichtlich ohne
  // Zeitraum: die Projektion haelt 90 Tage, jede Anfrage schneidet sich ihren
  // Ausschnitt heraus. Sonst haette jeder Zeitraum seine eigene Projektion.
  const alleTage = new Set(tageAbsteigend(jetztMs, 90));
  async function zaehleAlles() {
    const [audit, mail, laeufe] = await Promise.all([
      sicher(() => zaehler(monatsPraefixe(AUDIT_PREFIX, [...alleTage]), "audit")),
      sicher(() => zaehler([`${MAIL_PREFIX}/`], "mail")),
      sicher(() => laufZaehler())
    ]);
    return {
      verwaltung: schluesselReihe(audit, alleTage, "Audit-Log"),
      mails: schluesselReihe(mail, alleTage, "Zustellprotokoll"),
      laeufe: laufReihe(laeufe, alleTage)
    };
  }

  const [index, projektion] = await Promise.all([
    sicher(() => leseIndex({ env, nowMs: jetztMs })),
    sicher(() => holeProjektion({ env, fetchImpl, jetztMs, zaehleAlles }))
  ]);

  const reihen = {
    registrierungen: registrierungenReihe(index, erlaubt, tagListe),
    verwaltung: ausProjektion(projektion, "verwaltung", "Audit-Log"),
    mails: ausProjektion(projektion, "mails", "Zustellprotokoll"),
    laeufe: ausProjektion(projektion, "laeufe", "Job-Ablage jobs/ im Hauptspeicher")
  };

  return {
    ok: true,
    zeitraumTage: spanne,
    tage: tagListe.map((tag) => ({
      tag,
      registrierungen: wertOderNull(reihen.registrierungen, tag),
      verwaltung: wertOderNull(reihen.verwaltung, tag),
      mails: wertOderNull(reihen.mails, tag),
      laeufe: wertOderNull(reihen.laeufe, tag)
    })),
    reihen: {
      registrierungen: ohneRohdaten(reihen.registrierungen, tagListe),
      verwaltung: ohneRohdaten(reihen.verwaltung, tagListe),
      mails: ohneRohdaten(reihen.mails, tagListe),
      laeufe: ohneRohdaten(reihen.laeufe, tagListe)
    },
    bestand: bestandsLage(index),
    // Das Alter der Projektion faehrt sichtbar mit — eine alte Reihe darf nie
    // behaupten, gerade gemessen worden zu sein.
    projektion: projektion?.ok
      ? {
        erreichbar: true,
        gebautAm: projektion.gebautAm || null,
        alterSekunden: projektion.alterSekunden ?? null,
        wirdAufgefrischt: projektion.wirdAufgefrischt === true,
        ersterBau: projektion.ersterBau === true,
        hinweis: "Verwaltung, Mails und Laeufe kommen aus einer Tagesprojektion auf IDrive e2. "
          + "Registrierungen und Bestand sind live aus dem Nutzer-Index."
      }
      : { erreichbar: false, grund: String(projektion?.error || "unbekannt").slice(0, 120) },
    nichtGemessen: {
      punkte: NICHT_GEMESSEN,
      hinweis: "smejj.com zaehlt keine Besucher. Diese Ansicht zeigt ausschliesslich Spuren, "
        + "die der Betrieb ohnehin hinterlaesst — kein Skript, keine Kennung, kein Cookie "
        + "wurde dafuer eingebaut."
    },
    bewertung: bewerte(reihen, spanne, tagListe),
    gemessenAm: new Date(jetztMs).toISOString()
  };
}

/**
 * Holt eine Reihe aus der Projektion. Ist die Projektion selbst nicht lesbar,
 * ist die Reihe nicht lesbar — und zeigt "—", nie 0. Eine Projektion, die man
 * nicht lesen kann, sagt nichts darueber aus, ob an einem Tag etwas passiert ist.
 */
function ausProjektion(projektion, name, quelle) {
  if (!projektion?.ok) {
    return { erreichbar: false, grund: String(projektion?.error || "projektion_nicht_lesbar").slice(0, 120), quelle };
  }
  const reihe = projektion.reihen?.[name];
  if (!reihe) return { erreichbar: false, grund: "reihe_fehlt_in_projektion", quelle };
  if (!reihe.erreichbar) return { erreichbar: false, grund: String(reihe.grund || "unbekannt").slice(0, 120), quelle };
  return {
    erreichbar: true,
    quelle: reihe.quelle || quelle,
    tage: reihe.tage || {},
    ohneDatum: Number(reihe.ohneDatum) || 0,
    unvollstaendig: reihe.unvollstaendig === true,
    grundUnvollstaendig: reihe.grundUnvollstaendig || null,
    hinweis: reihe.hinweis || null
  };
}

/* ------------------------------------------------------------------ Reihen */

function registrierungenReihe(index, erlaubt, tagListe) {
  if (!index?.ok) {
    return { erreichbar: false, grund: index?.error || "unbekannt", quelle: "Nutzer-Index" };
  }
  const tageZaehler = {};
  let ohneDatum = 0;
  for (const eintrag of Array.isArray(index.entries) ? index.entries : []) {
    const tag = tagAusIso(eintrag?.createdAt);
    if (!tag) { ohneDatum += 1; continue; }
    if (erlaubt.has(tag)) tageZaehler[tag] = (tageZaehler[tag] || 0) + 1;
  }

  // Regel (c): der Index ist eine Projektion. Ist er aelter als der juengste
  // Tag im Zeitraum, fehlen dort moeglicherweise Registrierungen — eine zu
  // niedrige Zahl als Tatsache zu zeigen waere schlimmer als sie einzuordnen.
  const gebautMs = Date.parse(index.builtAt || "");
  const juengsterTagMs = Date.parse(`${tagListe[0]}T00:00:00.000Z`);
  const veraltet = Number.isFinite(gebautMs) && gebautMs < juengsterTagMs;

  return {
    erreichbar: true,
    quelle: "Nutzer-Index (abgeleitete Projektion, kein Protokoll)",
    tage: tageZaehler,
    ohneDatum,
    indexGebautAm: index.builtAt || null,
    indexAlterSekunden: Number.isFinite(Number(index.ageSeconds)) ? Number(index.ageSeconds) : null,
    unvollstaendig: veraltet || index.truncated === true,
    grundUnvollstaendig: veraltet
      ? `Der Index wurde am ${String(index.builtAt).slice(0, 16).replace("T", " ")} UTC gebaut und `
        + "ist damit aelter als der neueste Tag dieses Zeitraums. Ganz frische Registrierungen "
        + "koennen darin noch fehlen."
      : index.truncated === true
        ? "Der Index ist bei der Obergrenze abgeschnitten."
        : null
  };
}

function schluesselReihe(ergebnis, erlaubt, quelle) {
  if (!ergebnis?.ok) return { erreichbar: false, grund: ergebnis?.error || "unbekannt", quelle };
  const nachTag = new Map();
  let ohneDatum = 0;
  for (const [tag, anzahl] of ergebnis.nachTag) {
    if (!tag) { ohneDatum += anzahl; continue; }
    if (erlaubt.has(tag)) nachTag.set(tag, (nachTag.get(tag) || 0) + anzahl);
  }
  return {
    erreichbar: true,
    quelle,
    nachTag,
    ohneDatum,
    unvollstaendig: ergebnis.unvollstaendig === true,
    grundUnvollstaendig: ergebnis.unvollstaendig === true
      ? `Nur die ersten ${MAX_SEITEN} Listenseiten wurden gelesen — die Zahlen sind eine `
        + "Untergrenze, keine Summe."
      : null
  };
}

function laufReihe(ergebnis, erlaubt) {
  const reihe = schluesselReihe(ergebnis, erlaubt, "Job-Ablage jobs/ im Hauptspeicher");
  if (!reihe.erreichbar) return reihe;
  return {
    ...reihe,
    hinweis: "Ein Lauf wird dem Tag zugeordnet, an dem sein erstes Objekt geschrieben wurde. "
      + "Laeufe ohne verwertbaren Zeitstempel zaehlen unter \"ohne Datum\" und werden NICHT "
      + "auf heute gebucht."
  };
}

function bestandsLage(index) {
  if (!index?.ok) return { erreichbar: false, grund: index?.error || "unbekannt" };
  const alle = Array.isArray(index.entries) ? index.entries : [];
  const nachRolle = {};
  const nachStatus = {};
  let sitzungen = 0;
  let bestaetigt = 0;
  for (const e of alle) {
    nachRolle[e.role || "unbekannt"] = (nachRolle[e.role || "unbekannt"] || 0) + 1;
    nachStatus[e.status || "unbekannt"] = (nachStatus[e.status || "unbekannt"] || 0) + 1;
    sitzungen += Number(e.activeSessions) || 0;
    if (e.emailVerified === true) bestaetigt += 1;
  }
  return {
    erreichbar: true,
    konten: alle.length,
    bestaetigt,
    // Momentaufnahme, keine Zeitreihe: es gibt keine Historie der Sitzungen.
    aktiveSitzungenJetzt: sitzungen,
    nachRolle,
    nachStatus
  };
}

/* ------------------------------------------------------------------ Zaehlen */

async function zaehleNachTagUeberS3(cfg, praefixe, art, fetchImpl = fetch) {
  if (!cfg) return { ok: false, error: "speicher_nicht_eingerichtet" };
  // Der Grund landet in der Oberflaeche. Deshalb wird er hier auf eine kurze,
  // bekannte Kennung eingekocht statt einen Wert von aussen einzusetzen: live
  // gefunden 2026-07-29, als ein vertauschtes Argument den gesamten Quelltext
  // von `fetch` in den Fehlertext geschrieben hat.
  const kennung = /^[a-z]{1,20}$/.test(String(art || "")) ? String(art) : "quelle";
  const nachTag = new Map();
  let unvollstaendig = false;

  const ergebnisse = await mapMitGrenze(praefixe, async (prefix) => {
    const seiten = await listeSeiten(cfg, prefix, fetchImpl);
    if (!seiten.ok) return seiten;
    for (const key of seiten.keys) {
      if (!key.endsWith(".json")) continue;
      // head.json und andere Verwaltungsdateien tragen keinen Tag im Pfad und
      // sind kein Ereignis — Regel (d) laesst sie draussen statt sie zu raten.
      const tag = tagAusSchluessel(key);
      if (!tag) continue;
      nachTag.set(tag, (nachTag.get(tag) || 0) + 1);
    }
    return { ok: true, unvollstaendig: seiten.unvollstaendig };
  }, 4);

  const gescheitert = ergebnisse.find((r) => !r?.ok);
  if (gescheitert) {
    // Die Ursache wird MITGENANNT, gekuerzt. Ohne sie sah ein Programmierfehler
    // (ReferenceError) genauso aus wie ein nicht erreichbarer Speicher — und
    // wurde deshalb einen Tag lang fuer Letzteres gehalten.
    const ursache = String(gescheitert.grund || "").slice(0, 80);
    return { ok: false, error: `${kennung}_listing_fehlgeschlagen${ursache ? `:${ursache}` : ""}` };
  }
  unvollstaendig = ergebnisse.some((r) => r.unvollstaendig);
  return { ok: true, nachTag, unvollstaendig };
}

/**
 * Laeufe je Tag. Anders als Audit und Mail tragen Job-Schluessel kein Datum,
 * deshalb ist hier LastModified die Quelle — und zwar der FRUEHESTE Wert je
 * Auftrag: ein Lauf schreibt mehrfach (Warteschlange, Zustandswechsel, Kapsel),
 * und der letzte Schreibvorgang waere der Abschluss, nicht der Beginn.
 */
async function zaehleLaeufeUeberS3(cfg, fetchImpl) {
  if (!cfg) return { ok: false, error: "speicher_nicht_eingerichtet" };
  const ersterSchreibvorgang = new Map();
  let token = null;
  let seiten = 0;
  try {
    do {
      const { response, body } = await signedS3List({ ...cfg, prefix: JOB_PREFIX, continuationToken: token, fetchImpl });
      if (!response.ok) return { ok: false, error: `laeufe_listing_${listenGrund(response, body)}` };
      const text = String(body);
      for (const eintrag of eintraegeMitDatum(text)) {
        const auftrag = auftragAusSchluessel(eintrag.key);
        if (!auftrag) continue;
        const vorher = ersterSchreibvorgang.get(auftrag);
        if (!vorher || eintrag.zeit < vorher) ersterSchreibvorgang.set(auftrag, eintrag.zeit);
      }
      token = /<IsTruncated>true<\/IsTruncated>/.test(text)
        ? (text.match(/<NextContinuationToken>([^<]+)</) || [])[1] || null
        : null;
      seiten += 1;
    } while (token && seiten < MAX_SEITEN);
  } catch (error) {
    return { ok: false, error: `laeufe_listing_${String(error?.message || "fehlgeschlagen").slice(0, 60)}` };
  }

  const nachTag = new Map();
  for (const zeit of ersterSchreibvorgang.values()) {
    const tag = zeit ? zeit.slice(0, 10) : "";
    nachTag.set(tag, (nachTag.get(tag) || 0) + 1);
  }
  return { ok: true, nachTag, unvollstaendig: Boolean(token) };
}

async function listeSeiten(cfg, prefix, fetchImpl = fetch) {
  const keys = [];
  let token = null;
  let seiten = 0;
  try {
    do {
      const { response, body } = await signedS3List({ ...cfg, prefix, continuationToken: token, fetchImpl });
      if (!response.ok) return { ok: false, keys: [], unvollstaendig: true, grund: listenGrund(response, body) };
      const page = parseS3ListPage(body);
      keys.push(...page.keys);
      token = page.isTruncated ? page.nextContinuationToken : null;
      seiten += 1;
    } while (token && seiten < MAX_SEITEN);
  } catch (error) {
    return { ok: false, keys: [], unvollstaendig: true, grund: String(error?.message || "ausnahme") };
  }
  return { ok: true, keys, unvollstaendig: Boolean(token) };
}

/**
 * Warum die Auflistung nicht ging. `signedS3List` verschluckt eine Ausnahme und
 * meldet stattdessen Status 0 — die eigentliche Ursache steht dann NUR im Body.
 * Ohne diesen Griff hiesse jeder Netz-, DNS- oder Programmierfehler gleich
 * "http_0", und man sucht an der falschen Stelle.
 */
function listenGrund(response, body) {
  const status = Number(response?.status) || 0;
  if (status !== 0) return `http_${status}`;
  try {
    const gelesen = JSON.parse(String(body || "{}"));
    const text = String(gelesen.message || gelesen.error || "").trim();
    return text ? text.slice(0, 60) : "keine_verbindung";
  } catch {
    return "keine_verbindung";
  }
}

// Nur fuer Tests: der Fehlergrund dieser Funktion landet in der Oberflaeche und
// hat genau dort schon einmal Quelltext angezeigt. Er gehoert geprueft.
export const __zaehleNachTagFuerTests = zaehleNachTagUeberS3;

/** Key + LastModified paarweise. parseS3ListPage liefert nur Schluessel. */
export function eintraegeMitDatum(xml) {
  const treffer = [];
  for (const block of String(xml || "").matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const key = (block[1].match(/<Key>([\s\S]*?)<\/Key>/) || [])[1] || "";
    const roh = (block[1].match(/<LastModified>([\s\S]*?)<\/LastModified>/) || [])[1] || "";
    treffer.push({ key, zeit: brauchbaresDatum(roh) });
  }
  return treffer;
}

/* ------------------------------------------------------------------ Helfer */

function brauchbaresDatum(roh) {
  const ms = Date.parse(String(roh || ""));
  if (!Number.isFinite(ms)) return "";
  const iso = new Date(ms).toISOString();
  return Number(iso.slice(0, 4)) < FRUEHESTES_JAHR ? "" : iso;
}

/**
 * Welcher Auftrag steht hinter diesem Schluessel? Beide beobachteten Formen:
 *   jobs/<zustand>/<id>.json   — Warteschlangeneintrag
 *   jobs/<id>/…                — Kapsel eines Laufs
 * Ein Zustandsordner ist KEIN Auftrag, sonst zaehlte "open" als ein Lauf.
 */
export function auftragAusSchluessel(key) {
  const teile = String(key || "").split("/").filter(Boolean);
  if (teile[0] !== "jobs" || teile.length < 2) return "";
  if (JOB_ZUSTAENDE.has(teile[1])) {
    return teile.length >= 3 ? teile[2].replace(/\.json$/i, "") : "";
  }
  return teile[1].replace(/\.json$/i, "");
}

function tagAusSchluessel(key) {
  const treffer = String(key).match(/\/(\d{4})\/(\d{2})\/(\d{2})\//);
  return treffer ? `${treffer[1]}-${treffer[2]}-${treffer[3]}` : "";
}

function tagAusIso(wert) {
  const ms = Date.parse(String(wert || ""));
  if (!Number.isFinite(ms)) return "";
  const iso = new Date(ms).toISOString();
  return Number(iso.slice(0, 4)) < FRUEHESTES_JAHR ? "" : iso.slice(0, 10);
}

/**
 * Wie viele Tage. Eine unsinnige Eingabe (0, negativ, kein Zahlwert) gilt als
 * NICHT GESTELLT und faellt auf den Standard zurueck — sie wird bewusst nicht
 * auf 1 geklemmt: eine Ein-Tages-Ansicht sieht wie eine gueltige Antwort aus,
 * und ein Verlauf, der ohne Vorwarnung nur heute zeigt, taeuscht mehr als er
 * nuetzt. Nach oben wird geklemmt, weil 500 Tage eine echte Frage sind, nur
 * eine zu teure.
 */
function spanneAus(tage) {
  const zahl = Number(tage);
  if (!Number.isFinite(zahl) || zahl < 1) return 14;
  return Math.min(MAX_TAGE, Math.floor(zahl));
}

/** Juengster Tag zuerst — so liest man einen Verlauf im Adminbereich. */
function tageAbsteigend(jetztMs, spanne) {
  const tage = [];
  for (let i = 0; i < spanne; i += 1) tage.push(new Date(jetztMs - i * TAG_MS).toISOString().slice(0, 10));
  return tage;
}

function monatsPraefixe(basis, tagListe) {
  const monate = new Set(tagListe.map((t) => `${basis}/${t.slice(0, 4)}/${t.slice(5, 7)}/`));
  return [...monate];
}

// Regel (a): nur eine erreichbare Quelle darf eine Null zeigen. Ein Tag, der in
// der Projektion FEHLT, ist bei erreichbarer Quelle eine gemessene 0 — deshalb
// wird dort nichts gespeichert, was von einer Luecke nicht zu unterscheiden waere.
function wertOderNull(reihe, tag) {
  if (!reihe?.erreichbar) return null;
  return Number(reihe.tage?.[tag]) || 0;
}

/**
 * Die Tagesreihe bleibt intern — nach draussen geht die Summe. Summiert wird
 * ausschliesslich der ANGEFRAGTE Zeitraum: die Projektion haelt 90 Tage, und
 * eine Summe ueber alles waere bei `tage=7` schlicht falsch.
 */
function ohneRohdaten(reihe, tagListe) {
  if (!reihe?.erreichbar) return { erreichbar: false, grund: reihe?.grund || "unbekannt", quelle: reihe?.quelle || null };
  const { tage, ...rest } = reihe;
  let summe = 0;
  for (const tag of tagListe) summe += Number(tage?.[tag]) || 0;
  return { ...rest, summeImZeitraum: summe };
}

function bewerte(reihen, spanne, tagListe) {
  const nichtErreichbar = Object.entries(reihen).filter(([, r]) => !r.erreichbar).map(([name]) => name);
  if (nichtErreichbar.length === Object.keys(reihen).length) {
    return "Keine einzige Quelle ist lesbar — diese Ansicht sagt gerade nichts ueber den Betrieb aus.";
  }
  if (nichtErreichbar.length > 0) {
    return `${nichtErreichbar.length} von ${Object.keys(reihen).length} Reihen sind nicht lesbar `
      + `(${nichtErreichbar.join(", ")}). Die dortigen Felder stehen auf "—", nicht auf 0.`;
  }

  const unvollstaendig = Object.entries(reihen).filter(([, r]) => r.unvollstaendig).map(([name]) => name);
  let summeLaeufe = 0;
  for (const tag of tagListe) summeLaeufe += Number(reihen.laeufe.tage?.[tag]) || 0;

  const kern = summeLaeufe === 0
    ? `In den letzten ${spanne} Tagen ist kein neuer Lauf angelegt worden.`
    : `${summeLaeufe} Laeufe in ${spanne} Tagen — das ist die einzige Zahl hier, die echte `
      + "Nutzung abbildet.";
  const zusatz = unvollstaendig.length
    ? ` Achtung: ${unvollstaendig.join(", ")} ist eine Untergrenze (Grund steht bei der Reihe).`
    : "";
  return `${kern}${zusatz} Besucherzahlen gibt es nicht und werden auch nicht geschaetzt.`;
}

function idriveConfig(env = process.env) {
  const endpoint = env.IDRIVE_E2_ENDPOINT;
  const accessKey = env.IDRIVE_E2_ACCESS_KEY;
  const secretKey = env.IDRIVE_E2_SECRET_KEY;
  const bucket = env.IDRIVE_E2_BUCKET;
  if (!endpoint || !accessKey || !secretKey || !bucket) return null;
  return { endpoint, accessKey, secretKey, bucket, region: env.IDRIVE_E2_REGION || "us-west-2" };
}

async function sicher(aufgabe) {
  try {
    return await aufgabe();
  } catch (error) {
    return { ok: false, error: String(error?.message || "fehler").slice(0, 120) };
  }
}
