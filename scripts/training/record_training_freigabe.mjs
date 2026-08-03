#!/usr/bin/env node
// smejj.com — Schriftliche Trainings-Freigabe des Betreibers als Beleg ablegen.
//
// WARUM NICHT EINFACH promotionStatus IM MANIFEST UMSTELLEN:
// Datensatz-Manifeste sind laut SMEJJ_1_0_TRAINING_DATA_POLICY.md unveraenderlich
// und werden mit `If-None-Match: *` geschrieben — sie sind write-once. Das ist
// Absicht: waere der Freigabestand im Manifest editierbar, koennte niemand
// spaeter beweisen, WER wann WAS freigegeben hat. Der Freigabe-Beleg ist darum
// ein EIGENES, ebenfalls unveraenderliches Objekt, das den Inhalts-Hash des
// Manifests nennt. So haengt die Freigabe an genau dieser Datensatzversion und
// waere bei geaenderten Daten sofort als nicht mehr passend erkennbar.
//
// Der Beleg ist KEIN Schalter. Er dokumentiert. Ob die Schleife trainiert,
// entscheidet ihre Umgebung (SMEJJ_LORA_FREIGABE_ID und die Kostengrenzen) —
// bewusst getrennt: ein Dokument darf nie eine GPU starten.
//
// Aufruf:
//   CONFIRM_TRAINING_FREIGABE=YES node scripts/training/record_training_freigabe.mjs <freigabe.txt>
import { readFile } from "node:fs/promises";
import crypto from "node:crypto";
import { loadSecureLocalEnv } from "../../src/shared/env.js";
import { signedS3Get, signedS3List, signedS3Put, parseS3Keys } from "../../control-server/src/storage/s3Signer.js";

const DATENSATZ_PRAEFIX = "datasets/smejj-1-0/";
const BELEG_PRAEFIX = "ops/training-freigaben/";

function fail(nachricht) {
  console.error(nachricht);
  process.exit(1);
}

/**
 * Liest die Kernangaben aus dem Freigabetext. Bewusst streng: fehlt ein Feld,
 * wird nichts abgelegt. Ein unvollstaendiger Beleg ist schlimmer als keiner —
 * er sieht aus wie eine Freigabe, deckt aber nicht, was er zu decken scheint.
 */
export function leseFreigabe(text) {
  const hole = (muster) => (String(text).match(muster) || [])[1]?.trim() || "";
  const zahl = (muster) => {
    const roh = hole(muster).replace(/[^0-9.,]/g, "").replace(",", ".");
    const wert = Number.parseFloat(roh);
    return Number.isFinite(wert) && wert > 0 ? wert : 0;
  };
  // Satzzeichen am Wortende abschneiden: im Fliesstext steht "GPU-Klasse rtx3090,"
  // mit Komma. Ungeputzt landet der Wert als "rtx3090," in der Umgebung, und die
  // Preistabelle findet die Klasse nicht mehr — die Schleife meldete dann
  // "unbekannte_klasse" und niemand saehe, dass nur ein Komma schuld ist.
  const wort = (muster) => hole(muster).replace(/[.,;:]+$/, "");
  const felder = {
    datensatz: wort(/frei\s*\n?.*?(datasets\/[^\s]+)/is) || wort(/(datasets\/[^\s]+)/i),
    freigabeId: wort(/Freigabe-Kennung:\s*(\S+)/i),
    gpuKlasse: wort(/GPU-Klasse\s+(\S+)/i).toLowerCase(),
    prioritaet: wort(/Stufe\s+(\w+)/i).toLowerCase(),
    gesamtUsd: zahl(/Gesamtbetrag maximal:\s*([^\n]+)/i),
    monatUsd: zahl(/Monatsbetrag maximal:\s*([^\n]+)/i),
    zyklusMinuten: zahl(/Zyklusdauer maximal:\s*([^\n]+)/i),
    maxZyklen: zahl(/Anzahl Zyklen maximal:\s*([^\n]+)/i),
    unterzeichner: (String(text).trim().split("\n").pop() || "").trim()
  };
  const fehlend = Object.entries(felder)
    .filter(([, wert]) => wert === "" || wert === 0)
    .map(([name]) => name);
  return { felder, fehlend };
}

async function main() {
  loadSecureLocalEnv();
  const datei = process.argv[2];
  if (!datei) fail("Aufruf: node scripts/training/record_training_freigabe.mjs <freigabe.txt>");
  if (process.env.CONFIRM_TRAINING_FREIGABE !== "YES") {
    fail("Abbruch: CONFIRM_TRAINING_FREIGABE=YES fehlt — es wurde nichts abgelegt.");
  }
  const text = await readFile(datei, "utf8").catch(() => fail(`Abbruch: ${datei} nicht lesbar.`));
  const { felder, fehlend } = leseFreigabe(text);
  if (fehlend.length) fail(`Abbruch: Im Freigabetext fehlen: ${fehlend.join(", ")}. Nichts abgelegt.`);

  const cfg = {
    endpoint: process.env.IDRIVE_E2_ENDPOINT,
    region: process.env.IDRIVE_E2_REGION || "us-east-1",
    accessKey: process.env.IDRIVE_E2_ACCESS_KEY,
    secretKey: process.env.IDRIVE_E2_SECRET_KEY,
    bucket: process.env.IDRIVE_E2_BUCKET
  };
  if (!cfg.endpoint || !cfg.accessKey || !cfg.secretKey || !cfg.bucket) {
    fail("Abbruch: IDRIVE_E2_* unvollstaendig — fail-closed, nichts abgelegt.");
  }

  // Das Manifest der freigegebenen Version holen und seinen Inhalts-Hash bilden.
  // Ohne diese Bindung waere der Beleg eine Behauptung ueber "irgendwelche Daten".
  const keys = parseS3Keys((await signedS3List({ ...cfg, prefix: felder.datensatz.replace(/\/?$/, "/"), maxKeys: 50 })).body || "");
  const manifestKey = keys.find((k) => k.endsWith("manifest.json"));
  if (!manifestKey) fail(`Abbruch: Kein manifest.json unter ${felder.datensatz} gefunden.`);
  const manifestRoh = String((await signedS3Get({ ...cfg, key: manifestKey })).body || "");
  const manifest = JSON.parse(manifestRoh);
  const manifestSha256 = crypto.createHash("sha256").update(manifestRoh).digest("hex");

  const beleg = {
    schemaVersion: 1,
    art: "schriftliche-trainings-freigabe",
    freigabeId: felder.freigabeId,
    unterzeichner: felder.unterzeichner,
    erfasstAm: new Date().toISOString(),
    datensatz: {
      praefix: felder.datensatz,
      manifestKey,
      manifestSha256,
      anzahl: manifest.anzahl ?? null,
      lizenz: manifest.quelle?.license ?? null,
      // Der Freigabestand im Manifest bleibt unveraendert "not-approved":
      // das Manifest ist write-once. Dieser Beleg ist die Freigabe.
      manifestPromotionStatus: manifest.promotionStatus ?? null
    },
    kosten: {
      dienst: "portal.salad.com",
      gpuKlasse: felder.gpuKlasse,
      prioritaet: felder.prioritaet,
      maxGesamtUsd: felder.gesamtUsd,
      maxMonatUsd: felder.monatUsd,
      maxZyklusMinuten: felder.zyklusMinuten,
      maxZyklen: felder.maxZyklen
    },
    wortlaut: text.trim()
  };
  const koerper = `${JSON.stringify(beleg, null, 2)}\n`;
  // Der Schluessel haengt am INHALT der Freigabe (Wortlaut + genaue
  // Datensatzversion), NICHT am Zeitstempel. Sonst legt jeder erneute Aufruf
  // einen weiteren, fast gleichen Beleg an — gemessen am 2026-08-02: zwei
  // Objekte fuer dieselbe Freigabe, nur weil `erfasstAm` mit in den Hash floss.
  // Ein Freigabearchiv mit Dubletten ist kein Archiv, sondern ein Haufen.
  const belegSha = crypto.createHash("sha256")
    .update(`${felder.freigabeId}\n${manifestSha256}\n${beleg.wortlaut}`)
    .digest("hex");
  const key = `${BELEG_PRAEFIX}${felder.freigabeId}/${belegSha.slice(0, 12)}.json`;

  // Unveraenderlich schreiben: existiert der Schluessel schon, wird NICHT ueberschrieben.
  const put = await signedS3Put({ ...cfg, key, body: koerper, contentType: "application/json", ifNoneMatch: "*" });
  if (!put?.ok) {
    if (put?.status === 412) {
      console.log(`Beleg lag bereits identisch vor: ${key} — nichts geaendert.`);
      return;
    }
    fail(`Abbruch: Ablage fehlgeschlagen (HTTP ${put?.status}).`);
  }

  console.log(JSON.stringify({
    ok: true,
    beleg: key,
    freigabeId: beleg.freigabeId,
    datensatzManifest: manifestKey,
    manifestSha256,
    kosten: beleg.kosten
  }, null, 2));
  console.log("\nDer Beleg ist abgelegt und unveraenderlich. Er startet NICHTS.");
  console.log("Damit die Schleife trainiert, muessen diese Werte in ihre Umgebung:");
  console.log(`  SMEJJ_LORA_FREIGABE_ID=${felder.freigabeId}`);
  console.log(`  SMEJJ_LORA_FREIGABE_GPU_KLASSE=${felder.gpuKlasse}`);
  console.log(`  SMEJJ_LORA_FREIGABE_MONATSBETRAG_USD=${felder.monatUsd}`);
  console.log(`  SMEJJ_LORA_MAX_USD_GESAMT=${felder.gesamtUsd}`);
  console.log(`  SMEJJ_LORA_MAX_ZYKLUS_MINUTEN=${felder.zyklusMinuten}`);
  console.log(`  SMEJJ_LORA_MAX_ZYKLEN=${felder.maxZyklen}`);
  console.log(`  SMEJJ_LORA_GPU_KLASSE=${felder.gpuKlasse}`);
  console.log(`  SMEJJ_LORA_PRIORITAET=${felder.prioritaet}`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  await main();
}
