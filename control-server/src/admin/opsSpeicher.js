// smejj.com — Modul U: Speicher (Single Responsibility: Betriebssicht).
//
// Belegung je Bereich im Object Brain (IDrive e2). Absichtlich NICHT der ganze
// Eimer: dort liegen Modellgewichte mit vielen Gigabyte und Tausenden Objekten.
// Ein Betriebsbildschirm, der die vollstaendig durchzaehlt, ist entweder langsam
// oder teuer, meistens beides.
//
// Deshalb: eine feste Liste von Bereichen, je Bereich hoechstens ein paar
// Seiten. Wird ein Bereich abgeschnitten, sagt die Antwort das ausdruecklich
// ("mindestens") statt eine genaue Zahl vorzutaeuschen. Eine Zahl, der man nicht
// ansieht, dass sie unvollstaendig ist, ist schlimmer als gar keine.
import { signedS3List } from "../storage/s3Signer.js";
import { mapMitGrenze } from "../shared/parallelFetch.js";

// Was eine Betreiberin wissen will — nicht, was technisch alles existiert.
//
// `eimer` ist entscheidend: der Betrieb nutzt ZWEI Eimer. Daten liegen im
// Haupteimer (IDRIVE_E2_BUCKET), Release-Artefakte und Modellgewichte im
// Deploy-Eimer (IDRIVE_E2_DEPLOY_BUCKET). Wer alles im Haupteimer sucht,
// bekommt fuer die Artefakte eine Null — und eine Null sieht aus wie "nichts
// da", nicht wie "am falschen Ort gesucht".
export const BEREICHE = Object.freeze([
  { schluessel: "auth/email-users/", name: "Nutzerkonten", eimer: "haupt" },
  { schluessel: "users/index/", name: "Nutzer-Index", eimer: "haupt" },
  { schluessel: "admin/audit/", name: "Audit-Log", eimer: "haupt" },
  { schluessel: "admin/", name: "Adminbereich gesamt", eimer: "haupt" },
  { schluessel: "capsules/app/", name: "Task Capsules", eimer: "haupt" },
  { schluessel: "jobs/", name: "Jobs", eimer: "haupt" },
  { schluessel: "training/consents/", name: "Trainings-Einwilligungen", eimer: "haupt" },
  { schluessel: "deployments/control/", name: "Release-Artefakte", eimer: "deploy" }
]);

const MAX_SEITEN = 4;

export async function speicherUebersicht({
  env = process.env,
  bereiche = BEREICHE,
  fetchImpl = fetch,
  jetztMs = Date.now()
} = {}) {
  const cfg = idriveConfig(env);
  if (!cfg) {
    return { ok: false, error: "speicher_nicht_eingerichtet", bereiche: [], gemessenAm: new Date(jetztMs).toISOString() };
  }
  const deployEimer = String(env.IDRIVE_E2_DEPLOY_BUCKET || cfg.bucket);

  const gemessen = await mapMitGrenze(
    bereiche,
    (bereich) => zaehle({ ...cfg, bucket: bereich.eimer === "deploy" ? deployEimer : cfg.bucket }, bereich, fetchImpl),
    4
  );
  const fertig = gemessen.filter(Boolean);
  return {
    ok: true,
    eimer: cfg.bucket,
    deployEimer,
    bereiche: fertig,
    objekteGesamt: fertig.reduce((summe, b) => summe + (b.objekte || 0), 0),
    bytesGesamt: fertig.reduce((summe, b) => summe + (b.bytes || 0), 0),
    unvollstaendig: fertig.some((b) => b.abgeschnitten === true),
    gemessenAm: new Date(jetztMs).toISOString(),
    hinweis: `Je Bereich hoechstens ${MAX_SEITEN} Seiten. Modellgewichte werden bewusst nicht gezaehlt.`
  };
}

async function zaehle(cfg, bereich, fetchImpl) {
  let objekte = 0;
  let bytes = 0;
  let neuestes = "";
  let token = null;
  let seiten = 0;
  try {
    do {
      const { response, body } = await signedS3List({ ...cfg, prefix: bereich.schluessel, continuationToken: token, fetchImpl });
      if (!response.ok) return { ...oeffentlich(bereich, cfg.bucket), erreichbar: false, grund: `HTTP ${response.status}` };
      const seite = leseSeite(body);
      objekte += seite.objekte;
      bytes += seite.bytes;
      if (seite.neuestes > neuestes) neuestes = seite.neuestes;
      token = seite.abgeschnitten ? seite.token : null;
      seiten += 1;
    } while (token && seiten < MAX_SEITEN);
  } catch (error) {
    return { ...oeffentlich(bereich, cfg.bucket), erreichbar: false, grund: String(error?.message || "fehler").slice(0, 120) };
  }
  return {
    ...oeffentlich(bereich, cfg.bucket),
    erreichbar: true,
    objekte,
    bytes,
    abgeschnitten: Boolean(token),
    zuletztGeaendertAm: neuestes || null
  };
}

function oeffentlich(bereich, eimer) {
  // Der Eimer gehoert sichtbar dazu: sonst steht bei einem Bereich eine Null,
  // ohne dass erkennbar ist, wo ueberhaupt gesucht wurde.
  return { name: bereich.name, praefix: bereich.schluessel, eimer: eimer || null };
}

/**
 * Aus der Listenantwort werden Anzahl, Groesse und juengste Aenderung gelesen.
 * Eigener kleiner Parser statt Erweiterung des gemeinsamen Signierers: nur
 * dieses Modul braucht Groessen, und der Signierer bleibt so schmal wie er ist.
 */
export function leseSeite(xml) {
  const text = String(xml || "");
  const bloecke = text.match(/<Contents>[\s\S]*?<\/Contents>/g) || [];
  let bytes = 0;
  let neuestes = "";
  for (const block of bloecke) {
    const groesse = Number((block.match(/<Size>(\d+)<\/Size>/) || [])[1] || 0);
    if (Number.isFinite(groesse)) bytes += groesse;
    const geaendert = (block.match(/<LastModified>([^<]+)<\/LastModified>/) || [])[1] || "";
    if (geaendert > neuestes) neuestes = geaendert;
  }
  const abgeschnitten = /<IsTruncated>true<\/IsTruncated>/.test(text);
  const token = (text.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/) || [])[1] || null;
  return { objekte: bloecke.length, bytes, neuestes, abgeschnitten, token };
}

function idriveConfig(env) {
  const endpoint = env.IDRIVE_E2_ENDPOINT;
  const accessKey = env.IDRIVE_E2_ACCESS_KEY;
  const secretKey = env.IDRIVE_E2_SECRET_KEY;
  const bucket = env.IDRIVE_E2_BUCKET;
  if (!endpoint || !accessKey || !secretKey || !bucket) return null;
  return { endpoint, accessKey, secretKey, bucket, region: env.IDRIVE_E2_REGION || "us-west-2" };
}
