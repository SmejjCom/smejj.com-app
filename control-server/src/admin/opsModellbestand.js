// smejj.com — Modul G2: Modellbestand in IDrive e2 (Single Responsibility: Betriebssicht).
//
// Rein lesend. Ergaenzt Modul G (opsModelle.js) um genau das, was dort fehlt:
// Modul G kennt die REGISTRY — welche Modelle die App aufrufen darf und ob sie
// antworten. Dieses Modul kennt den BESTAND — welche Gewichte tatsaechlich in
// e2 liegen, wie gross sie sind und welcher Motor sie ueberhaupt laden kann.
//
// Der Unterschied ist betrieblich entscheidend: eine Datei in e2 ist noch kein
// nutzbares Modell. glm-5-2-fp8 belegt 704 GB und passt auf keinen vorhandenen
// Motor — in Modul G taucht es gar nicht auf, in der e2-Rechnung sehr wohl.
// Ohne diese Sicht bezahlt der Betrieb Speicher fuer Dateien, die niemand
// laden kann, und niemand merkt es.
//
// Kosten der Abfrage: bewusst NICHT der ganze Eimer. Der Modell-Eimer haelt
// ueber 11.000 Objekte, davon gehoeren nur rund 1.100 zu Modellgewichten. Es
// werden ausschliesslich die Praefixe unten gelesen, je Praefix hoechstens
// SEITEN_GRENZE Seiten. Wird abgeschnitten, sagt die Antwort das ausdruecklich
// ("mindestens") — dieselbe Regel wie in Modul U (opsSpeicher.js): eine Zahl,
// der man nicht ansieht, dass sie unvollstaendig ist, ist schlimmer als keine.
import { signedS3List, signedS3Get } from "../storage/s3Signer.js";
import { mapMitGrenze } from "../shared/parallelFetch.js";
import { modellUebersicht } from "./opsModelle.js";

/** Hoechstens so viele Seiten je Praefix. 1.000 Objekte pro Seite. */
const SEITEN_GRENZE = 4;

/** Aelter als das, gilt ein Motor als stumm. Ein Mac hinter smee.io kann
 *  jederzeit einschlafen; drei Minuten sind der Kompromiss zwischen "merkt es
 *  schnell" und "schlaegt nicht bei jedem Netzhaenger Alarm". */
const MELDE_FRIST_MS = 3 * 60 * 1000;

// Wo Modellgewichte liegen. `eimer` ist entscheidend, weil der Betrieb zwei
// Eimer nutzt: Gewichte im Modell-Eimer, tenant-eigene Ablagen im Haupteimer.
// Wer alles im Haupteimer sucht, bekommt fuer die Gewichte eine Null — und
// eine Null sieht aus wie "nichts da", nicht wie "am falschen Ort gesucht".
export const BESTAND_ORTE = Object.freeze([
  { praefix: "model-files/", herkunft: "Gewichte", eimer: "modell" },
  { praefix: "models/production/", herkunft: "Produktion", eimer: "modell" },
  { praefix: "models/staging/", herkunft: "Staging", eimer: "modell" },
  { praefix: "tenants/models/workspaces/default/", herkunft: "Mandant", eimer: "haupt" }
]);

/** Wo die Motoren ihre Lebenszeichen ablegen. Ein Motor hinter smee.io ist von
 *  aussen NICHT erreichbar — der Draht geht nur in eine Richtung. Deshalb
 *  meldet er sich selbst hierher, statt dass der Server ihn anpingt. */
const MOTOR_PRAEFIX = "admin/motoren/";

/** Absichtsmarken des Betreibers. Die Schreibroute legt sie ab, die Motoren
 *  holen sie sich im Takt ihres Lebenszeichens. Steht hier "aus", ist das
 *  staerker als jede gemessene Erreichbarkeit — der Betreiber hat es so
 *  gewollt, und ein Knopf, dessen Wirkung man nicht sieht, ist wertlos. */
const SCHALT_PRAEFIX = "admin/modelle/schaltung/";

export async function modellbestandUebersicht({
  env = process.env,
  fetchImpl = fetch,
  jetzt = Date.now(),
  gesundheit = null
} = {}) {
  const haupt = eimerConfig(env, env.IDRIVE_E2_BUCKET);
  // Reihenfolge ist hier KEIN Geschmack, sondern ein dokumentierter Befund
  // (2026-07-09): der Haupteimer und der Modell-Eimer sind verschieden.
  //
  // NACHTRAG 2026-09-08, live gemessen: die Doku nennt smejj-app als
  // IDRIVE_E2_BUCKET, der laufende Control-Server liest aber aus
  // smejj-model-files. Nachgewiesen, indem dasselbe Lebenszeichen in beide
  // Eimer gelegt wurde — die Konsole fand nur das zweite. Wer sich hier auf
  // die Doku verlaesst, sucht am falschen Ort.
  //
  // Wer auf den Haupteimer zurueckfaellt, bekommt fuer die
  // Gewichte eine Null — und eine Null sieht aus wie "nichts da", nicht wie
  // "am falschen Ort gesucht". Genau dieser Anzeigefehler stand schon einmal
  // in /api/models/status. Deshalb: erst der ausdrueckliche Modell-Eimer,
  // dann der Deploy-Eimer, und der Haupteimer nur als letzte Notloesung.
  const modell = eimerConfig(env,
    env.IDRIVE_E2_MODEL_BUCKET || env.IDRIVE_E2_DEPLOY_BUCKET || env.IDRIVE_E2_BUCKET);
  if (!haupt || !modell) {
    return {
      ok: true,
      erstelltAm: new Date(jetzt).toISOString(),
      stummeQuellen: ["IDrive e2 (Zugang nicht vollstaendig gesetzt)"],
      speicher: {},
      motoren: [],
      modelle: [],
      zugaenge: [],
      kannSchalten: false
    };
  }

  const stumme = [];
  const [bestand, motoren, schaltungen] = await Promise.all([
    leseBestand({ haupt, modell, fetchImpl, stumme }),
    leseMotoren({ cfg: haupt, fetchImpl, jetzt, stumme }),
    leseSchaltungen({ cfg: haupt, fetchImpl, stumme })
  ]);

  const registry = sicherheitshalber(() => modellUebersicht({ env, gesundheit }), null);
  if (!registry) stumme.push("Modell-Registry");

  const modelle = [
    ...verschmelze(bestand, motoren, registry, schaltungen),
    ...nurVomMotorGemeldet(bestand, motoren)
  ];
  return {
    ok: true,
    erstelltAm: new Date(jetzt).toISOString(),
    stummeQuellen: stumme,
    speicher: rechneSpeicher(modelle),
    motoren,
    modelle,
    zugaenge: leseZugaenge(registry),
    // Schreibrechte meldet die Route, nicht dieses Modul — es weiss nichts vom
    // Akteur. Die Voreinstellung false ist die sichere: die Konsole blendet
    // dann alle Knoepfe aus, statt tote Knoepfe zu zeigen.
    kannSchalten: false
  };
}

// -------------------------------------------------------------- e2-Bestand

async function leseBestand({ haupt, modell, fetchImpl, stumme }) {
  const ergebnisse = await mapMitGrenze(BESTAND_ORTE, async (ort) => {
    const cfg = ort.eimer === "modell" ? modell : haupt;
    try {
      return { ort, ...(await zaehleOrt(cfg, ort.praefix, fetchImpl)) };
    } catch {
      stumme.push(`e2 ${ort.praefix}`);
      return { ort, ordner: new Map(), abgeschnitten: false };
    }
  }, 2);

  const gesammelt = [];
  for (const { ort, ordner, abgeschnitten } of ergebnisse) {
    for (const [name, wert] of ordner) {
      gesammelt.push({
        id: kennung(ort.praefix, name),
        name,
        herkunft: ort.herkunft,
        pfad: ort.praefix + name + "/",
        eimer: ort.eimer,
        groesseBytes: wert.bytes,
        dateien: wert.dateien,
        geaendertAm: wert.neuestes || null,
        unvollstaendig: wert.bytes === 0 || wert.dateien === 0,
        abgeschnitten
      });
    }
  }
  return gesammelt;
}

/** Zaehlt je erstem Pfadteil unter dem Praefix. Das ist der Modellordner. */
async function zaehleOrt(cfg, praefix, fetchImpl) {
  const ordner = new Map();
  let token = null;
  let seiten = 0;
  let abgeschnitten = false;

  do {
    const antwort = await signedS3List({ ...cfg, prefix: praefix, continuationToken: token, fetchImpl });
    const xml = typeof antwort === "string" ? antwort : (antwort?.body ?? "");
    for (const eintrag of leseEintraege(xml)) {
      const rest = eintrag.key.slice(praefix.length);
      if (!rest) continue;
      // Ein Modell ist ein ORDNER. Eine lose Datei direkt unter dem Praefix
      // (z.B. models/production/.registry.json) ist Verwaltungskram und stand
      // bis 2026-09-08 als eigene Zeile in der Liste — mit Loeschen-Knopf.
      if (!rest.includes("/")) continue;
      const name = rest.slice(0, rest.indexOf("/"));
      if (!name) continue;
      const wert = ordner.get(name) || { bytes: 0, dateien: 0, neuestes: "" };
      wert.bytes += eintrag.groesse;
      wert.dateien += 1;
      if (eintrag.geaendert > wert.neuestes) wert.neuestes = eintrag.geaendert;
      ordner.set(name, wert);
    }
    token = leseToken(xml);
    seiten += 1;
    abgeschnitten = Boolean(token) && seiten >= SEITEN_GRENZE;
  } while (token && seiten < SEITEN_GRENZE);

  return { ordner, abgeschnitten };
}

function leseEintraege(xml) {
  const bloecke = String(xml || "").match(/<Contents>[\s\S]*?<\/Contents>/g) || [];
  return bloecke.map((block) => ({
    key: (block.match(/<Key>([\s\S]*?)<\/Key>/) || [])[1] || "",
    groesse: Number((block.match(/<Size>(\d+)<\/Size>/) || [])[1] || 0),
    geaendert: (block.match(/<LastModified>([^<]+)<\/LastModified>/) || [])[1] || ""
  })).filter((e) => e.key && !e.key.endsWith("/"));
}

function leseToken(xml) {
  if (!/<IsTruncated>true<\/IsTruncated>/.test(String(xml || ""))) return null;
  return (String(xml || "").match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/) || [])[1] || null;
}

// ----------------------------------------------------------------- Motoren

async function leseMotoren({ cfg, fetchImpl, jetzt, stumme }) {
  let schluessel = [];
  try {
    const antwort = await signedS3List({ ...cfg, prefix: MOTOR_PRAEFIX, fetchImpl });
    const xml = typeof antwort === "string" ? antwort : (antwort?.body ?? "");
    schluessel = leseEintraege(xml).map((e) => e.key).filter((k) => k.endsWith(".json"));
  } catch {
    stumme.push("Motoren-Lebenszeichen");
    return [];
  }

  const motoren = await mapMitGrenze(schluessel, async (key) => {
    try {
      const roh = await signedS3Get({ ...cfg, key, fetchImpl, allowNotFound: true });
      const text = typeof roh === "string" ? roh : (roh?.body ?? "");
      if (!text) return null;
      return zeichneMotor(JSON.parse(text), jetzt);
    } catch {
      return null;
    }
  }, 4);

  return motoren.filter(Boolean).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function zeichneMotor(m, jetzt) {
  const gemeldet = m.gemeldetAm ? Date.parse(m.gemeldetAm) : NaN;
  const alter = Number.isFinite(gemeldet) ? jetzt - gemeldet : null;
  // Ein Motor, der sich abmeldet, ist "aus" und kein Fehler. Nur wer sich
  // NICHT abgemeldet hat und trotzdem schweigt, ist stumm.
  const zustand = m.abgemeldet === true ? "aus"
    : alter === null ? "unbekannt"
      : alter > MELDE_FRIST_MS ? "stumm" : "verbunden";
  return {
    id: String(m.id || "unbenannt"),
    art: String(m.art || "unbekannt"),
    name: String(m.name || m.id || "unbenannt"),
    kanal: m.kanal ? String(m.kanal) : null,
    zustand,
    letzteMeldung: m.gemeldetAm || null,
    hinweis: m.hinweis ? String(m.hinweis) : null,
    modelle: Array.isArray(m.modelle) ? m.modelle.map(String) : [],
    speicherBytes: Number(m.speicherBytes) || null
  };
}

// ------------------------------------------------- Vom Motor gemeldet, ohne Datei

// Ein Motor meldet, welche Modelle er bedient. Findet sich dazu keine Datei in
// den gelesenen Eimern, ist das KEINE Kleinigkeit: entweder liegt die Datei
// woanders (ornith-1.0-9b liegt im Eimer der smejj-Cloud, den diese Sicht nicht
// liest) oder der Motor meldet etwas, das es nicht mehr gibt. Beides gehoert
// auf den Bildschirm. Die Zeile stillschweigend wegzulassen hiesse: der Motor
// sagt "ich bediene 1 Modell", und die Liste zeigt keines — und niemand erfaehrt,
// welches.
function nurVomMotorGemeldet(bestand, motoren) {
  const bekannt = new Set();
  for (const d of bestand) { bekannt.add(d.id); bekannt.add(d.name); }

  const zeilen = new Map();
  for (const motor of motoren) {
    for (const name of motor.modelle || []) {
      if (bekannt.has(name) || zeilen.has(name)) continue;
      zeilen.set(name, {
        id: `motor:${motor.id}:${name}`,
        name,
        groesseBytes: 0,
        dateien: 0,
        herkunft: "vom Motor gemeldet",
        pfad: null,
        eimer: null,
        geaendertAm: null,
        motorId: motor.id,
        motorName: motor.name,
        kostenlos: true,
        zustand: motor.zustand === "verbunden" ? "aktiv" : "fehler",
        meldung: motor.zustand === "verbunden"
          ? "laeuft auf diesem Motor — die Datei liegt aber nicht in den hier gelesenen Eimern"
          : `Motor ${motor.name} meldet sich nicht`,
        geschaltetVon: null,
        geschaltetAm: null
      });
    }
  }
  return [...zeilen.values()];
}

// -------------------------------------------------------------- Schaltungen

async function leseSchaltungen({ cfg, fetchImpl, stumme }) {
  const karte = new Map();
  let schluessel = [];
  try {
    const antwort = await signedS3List({ ...cfg, prefix: SCHALT_PRAEFIX, fetchImpl });
    const xml = typeof antwort === "string" ? antwort : (antwort?.body ?? "");
    schluessel = leseEintraege(xml).map((e) => e.key).filter((k) => k.endsWith(".json"));
  } catch {
    stumme.push("Schaltungen");
    return karte;
  }

  const marken = await mapMitGrenze(schluessel, async (key) => {
    try {
      const roh = await signedS3Get({ ...cfg, key, fetchImpl, allowNotFound: true });
      const text = typeof roh === "string" ? roh : (roh?.body ?? "");
      return text ? JSON.parse(text) : null;
    } catch {
      return null;
    }
  }, 4);

  for (const marke of marken) {
    if (marke && marke.id) karte.set(String(marke.id), marke);
  }
  return karte;
}

// -------------------------------------------------------------- Verschmelzen

function verschmelze(bestand, motoren, registry, schaltungen = new Map()) {
  const ausRegistry = new Map((registry?.modelle || []).map((m) => [String(m.id), m]));

  return bestand.map((datei) => {
    const motor = motoren.find((mo) => mo.modelle.includes(datei.id) || mo.modelle.includes(datei.name)) || null;
    const reg = ausRegistry.get(datei.id) || ausRegistry.get(datei.name) || null;
    const marke = schaltungen.get(datei.id) || null;
    return {
      id: datei.id,
      name: datei.name,
      groesseBytes: datei.groesseBytes,
      dateien: datei.dateien,
      herkunft: datei.herkunft,
      // Pfad UND Eimer wandern mit: die Schreibroute bekommt nur eine id
      // und muss daraus den Ort ableiten koennen. Ohne den Eimer wuerde
      // ein Loeschauftrag im falschen Eimer suchen und still nichts tun.
      pfad: datei.pfad,
      eimer: datei.eimer,
      geaendertAm: datei.geaendertAm,
      motorId: motor ? motor.id : null,
      motorName: motor ? motor.name : null,
      kostenlos: reg ? reg.anbieter !== "salad" : Boolean(motor),
      zustand: zustandAus(datei, motor, reg, marke),
      meldung: meldungAus(datei, motor, reg, marke),
      geschaltetVon: marke ? marke.gesetztVon || null : null,
      geschaltetAm: marke ? marke.gesetztAm || null : null
    };
  }).sort(nachDringlichkeit);
}

function zustandAus(datei, motor, reg, marke) {
  if (datei.unvollstaendig) return "unvollstaendig";
  // Ein ausdrueckliches "aus" des Betreibers schlaegt alles andere. Sonst
  // koennte ein Modell gruen leuchten, das jemand bewusst abgeschaltet hat.
  if (marke && marke.aktiv === false) return "aus";
  if (!motor) return "unbrauchbar";
  if (motor.zustand === "stumm") return "fehler";
  if (reg && reg.aktiv && reg.erreichbarkeit === "ja") return "aktiv";
  if (reg && reg.aktiv) return "laedt";
  return "aus";
}

function meldungAus(datei, motor, reg, marke) {
  if (datei.abgeschnitten) return "Liste abgeschnitten — mindestens diese Groesse";
  if (marke && marke.aktiv === false) {
    return `vom Betreiber ausgeschaltet${marke.gesetztVon ? " (" + marke.gesetztVon + ")" : ""}`;
  }
  if (datei.unvollstaendig) return "keine Nutzdaten — Download vermutlich abgebrochen";
  if (!motor) return "kein eingetragener Motor kann dieses Modell laden";
  if (motor.zustand === "stumm") return `Motor ${motor.name} meldet sich nicht`;
  if (reg && reg.aktiv && reg.erreichbarkeit === "nein") return "eingeschaltet, antwortet aber nicht";
  return null;
}

/** Was kaputt ist, steht oben — dieselbe Regel wie in Modul G. */
function nachDringlichkeit(a, b) {
  const rang = (m) => {
    if (m.zustand === "fehler") return 0;
    if (m.zustand === "unvollstaendig") return 1;
    if (m.zustand === "aktiv") return 2;
    if (m.zustand === "laedt") return 3;
    if (m.zustand === "aus") return 4;
    return 5;                                   // unbrauchbar zuletzt
  };
  const d = rang(a) - rang(b);
  if (d !== 0) return d;
  return (b.groesseBytes || 0) - (a.groesseBytes || 0);
}

// ----------------------------------------------------------------- Zugaenge

// Die Registry weiss je Anbieter, ob ein Zugang eingerichtet ist und ob der
// letzte Aufruf durchging. Ein Schluessel wird NIE mitgeliefert, auch nicht
// gekuerzt — der Betriebsbildschirm braucht den Zustand, nicht das Geheimnis.
function leseZugaenge(registry) {
  return (registry?.anbieter || []).map((a) => ({
    id: String(a.anbieter),
    name: String(a.anbieter),
    hinweis: `${a.aktiv} von ${a.total} aktiv`,
    zustand: a.total === 0 ? "fehlt"
      : a.erreichbar > 0 ? "gueltig"
        : a.aktiv > 0 ? "abgelaufen" : "ungeprueft",
    geprueftAm: null
  }));
}

// -------------------------------------------------------------------- Rest

function rechneSpeicher(modelle) {
  const summe = (liste) => liste.reduce((s, m) => s + (m.groesseBytes || 0), 0);
  return {
    gesamtBytes: summe(modelle),
    nutzbarBytes: summe(modelle.filter((m) => m.zustand === "aktiv" || m.zustand === "laedt")),
    totesGewichtBytes: summe(modelle.filter((m) => m.zustand === "unbrauchbar" || m.zustand === "unvollstaendig"))
  };
}

function kennung(praefix, name) {
  return `${praefix}${name}`.replace(/\/+$/, "").replace(/[^A-Za-z0-9._-]+/g, "-").toLowerCase();
}

function eimerConfig(env, bucket) {
  const endpoint = env.IDRIVE_E2_ENDPOINT;
  const accessKey = env.IDRIVE_E2_ACCESS_KEY;
  const secretKey = env.IDRIVE_E2_SECRET_KEY;
  if (!endpoint || !accessKey || !secretKey || !bucket) return null;
  return { endpoint, accessKey, secretKey, bucket, region: env.IDRIVE_E2_REGION || "us-west-2" };
}

function sicherheitshalber(aufgabe, ersatz) {
  try {
    return aufgabe();
  } catch {
    return ersatz;
  }
}
