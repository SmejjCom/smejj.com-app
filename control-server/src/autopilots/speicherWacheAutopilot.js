// smejj.com — Speicher-Füllstand-Wache (Autopilot Nr. 64): misst täglich, wie
// voll das IDrive-e2-Paket ist. Die Kosten-Policy verbietet automatische
// Mehrkosten — aber genau die entstehen still, wenn ein Modell-Upload das
// Paket sprengt. Stand beim Bau (2026-08-24): 1,25 von 2 TB belegt (63 %).
//
// GEMESSEN, NICHT GESCHÄTZT: Die Wache listet die erreichbaren Eimer per
// S3-LIST (liefert je Objekt die Größe) und summiert. Der Sicherungs-Eimer
// smejj-sicherung ist für den Dienst-Schlüssel BEWUSST unlesbar (Isolation,
// Betreiber-Entscheidung 2026-08-24) — er wird in der Meldung BENANNT statt
// verschwiegen: er spiegelt smejj-app plus die Schnappschüsse und ist damit
// klein gegen den Haupteimer.
import { createRecordStore } from "../admin/recordStore.js";
import { signedS3List } from "../storage/s3Signer.js";

const MESS_ABSTAND_MS = 22 * 60 * 60 * 1000; // täglich, mit Spielraum wie beim Modell-Einkäufer
const ABLAGE_ID = "letzter-fuellstand";
// Deckel gegen Endlos-Listen: 80 Seiten × 1000 Objekte. Wird er erreicht,
// steht das in der Meldung — eine still abgeschnittene Summe wäre eine Lüge.
const MAX_SEITEN = 80;

/** Grenzen als Anteil des Pakets: ab 80 % warnt die Meldung, ab 90 % wird die Ampel rot. */
export const GRENZEN = Object.freeze({ warnAb: 0.80, rotAb: 0.90 });
/** Paketgröße in GB; überschreibbar per SMEJJ_SPEICHER_PAKET_GB (IDrive-Tarif des Betreibers: 2 TB). */
export const PAKET_GB_STANDARD = 2048;

let ablageStandard = null;
function holeAblage(ablage) {
  if (ablage) return ablage;
  if (!ablageStandard) ablageStandard = createRecordStore("betrieb/speicher-fuellstand", { maximal: 20 });
  return ablageStandard;
}

/** Zieht Objektgrößen und Fortsetzungs-Marke aus einer ListObjectsV2-Seite. Getrennt testbar. */
export function parseListSeite(xml = "") {
  const text = String(xml);
  let bytes = 0;
  let objekte = 0;
  for (const treffer of text.matchAll(/<Size>(\d+)<\/Size>/g)) {
    bytes += Number(treffer[1]);
    objekte += 1;
  }
  const abgeschnitten = /<IsTruncated>true<\/IsTruncated>/.test(text);
  const marke = abgeschnitten ? (text.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1] || null) : null;
  return { bytes, objekte, marke };
}

/** Bytes menschenlesbar — die Meldung soll Zahlen tragen, die der Betreiber liest. */
export function formatiereBytes(bytes = 0) {
  const n = Number(bytes) || 0;
  if (n >= 1024 ** 4) return `${(n / 1024 ** 4).toFixed(2)} TB`;
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.round(n / 1024)} KB`;
}

/** Beurteilt den Füllstand gegen das Paket. Getrennt testbar (kaputt + gesund). */
export function beurteileFuellstand({ belegtBytes = 0, paketGb = PAKET_GB_STANDARD }, { grenzen = GRENZEN } = {}) {
  const paketBytes = paketGb * 1024 ** 3;
  const quote = paketBytes > 0 ? belegtBytes / paketBytes : 1;
  const prozent = Math.round(quote * 100);
  const stand = `${formatiereBytes(belegtBytes)} von ${formatiereBytes(paketBytes)} (${prozent} %)`;
  if (quote >= grenzen.rotAb) {
    return { ok: false, quote, grund: `Paket zu ${prozent} % voll — ${stand}: Mehrkosten drohen, Betreiber-Entscheidung nötig (aufräumen oder Paket vergrößern)` };
  }
  if (quote >= grenzen.warnAb) {
    return { ok: true, quote, grund: `${stand} — nähert sich der 90-%-Grenze` };
  }
  return { ok: true, quote, grund: stand };
}

/** Selbsttest: XML-Parser und Beurteilung müssen kaputte UND gesunde Fälle richtig behandeln. */
export function fuehreSelbsttestAus() {
  const fehler = [];
  const seite = parseListSeite(
    "<ListBucketResult><Contents><Key>a</Key><Size>1000</Size></Contents>"
    + "<Contents><Key>b</Key><Size>500</Size></Contents>"
    + "<IsTruncated>true</IsTruncated><NextContinuationToken>tok123</NextContinuationToken></ListBucketResult>"
  );
  if (seite.bytes !== 1500 || seite.objekte !== 2) fehler.push(`Parser: ${seite.bytes} Bytes/${seite.objekte} Objekte statt 1500/2`);
  if (seite.marke !== "tok123") fehler.push("Parser übersieht die Fortsetzungs-Marke");
  const leere = parseListSeite("<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>");
  if (leere.bytes !== 0 || leere.marke !== null) fehler.push("leere Seite wird falsch gelesen");
  const voll = beurteileFuellstand({ belegtBytes: 0.95 * 2048 * 1024 ** 3, paketGb: 2048 });
  if (voll.ok) fehler.push("95 % Füllstand gilt fälschlich als gesund");
  const warnung = beurteileFuellstand({ belegtBytes: 0.85 * 2048 * 1024 ** 3, paketGb: 2048 });
  if (!warnung.ok || !/nähert/.test(warnung.grund)) fehler.push("85 % Füllstand warnt nicht");
  const gesund = beurteileFuellstand({ belegtBytes: 0.5 * 2048 * 1024 ** 3, paketGb: 2048 });
  if (!gesund.ok || /nähert/.test(gesund.grund)) fehler.push("50 % Füllstand löst fälschlich eine Warnung aus");
  return { bestanden: fehler.length === 0, fehler };
}

/** Summiert einen Eimer über alle LIST-Seiten. */
export async function messeEimer(cfg, bucket, { listImpl = signedS3List } = {}) {
  let bytes = 0;
  let objekte = 0;
  let marke = null;
  for (let seiten = 0; seiten < MAX_SEITEN; seiten += 1) {
    const { response, body } = await listImpl({ ...cfg, bucket, prefix: "", continuationToken: marke });
    if (!response.ok) return { ok: false, status: response.status || 0 };
    const seite = parseListSeite(body);
    bytes += seite.bytes;
    objekte += seite.objekte;
    if (!seite.marke) return { ok: true, bytes, objekte };
    marke = seite.marke;
  }
  return { ok: true, bytes, objekte, abgeschnitten: true };
}

/**
 * Der Lauf im Takt: täglich messen, dazwischen den gemessenen Stand melden.
 */
export async function laufSpeicherWache({ mitNetz = true, ablage = null, env = process.env, listImpl = signedS3List, jetztMs = Date.now() } = {}) {
  const probe = fuehreSelbsttestAus();
  if (!probe.bestanden) {
    return { ok: false, meldung: `Speicher-Wache rechnet bekannte Fälle falsch: ${probe.fehler.join("; ")}` };
  }
  const speicher = holeAblage(ablage);
  let stand = null;
  try { stand = await speicher.lies(ABLAGE_ID); } catch { /* unten neu gemessen */ }
  const alterMs = stand ? jetztMs - Date.parse(stand.createdAt || 0) : Infinity;
  if (Number.isFinite(alterMs) && alterMs < MESS_ABSTAND_MS && stand) {
    const stunden = Math.round(alterMs / 3_600_000);
    return { ok: stand.ok !== false, meldung: `Füllstand (vor ${stunden} h gemessen): ${stand.zusammenfassung}` };
  }
  if (!mitNetz) {
    return { ok: true, meldung: "Füllstands-Messung fällig — läuft im nächsten Netz-Takt" };
  }

  const { IDRIVE_E2_ENDPOINT: endpoint, IDRIVE_E2_ACCESS_KEY: accessKey, IDRIVE_E2_SECRET_KEY: secretKey, IDRIVE_E2_BUCKET: haupteimer } = env;
  if (!endpoint || !accessKey || !secretKey || !haupteimer) {
    return { ok: false, meldung: "Speicher-Wache ohne Zugangsdaten — IDRIVE_E2_* unvollständig, Füllstand nicht messbar" };
  }
  const cfg = { endpoint, accessKey, secretKey, region: env.IDRIVE_E2_REGION || "us-west-2" };
  // Haupteimer plus der Chat-Eimer; smejj-sicherung ist bewusst unlesbar (s. Kopf).
  const eimerNamen = [...new Set([haupteimer, "smejj-app"])];
  let belegtBytes = 0;
  const teile = [];
  const stumm = [];
  for (const name of eimerNamen) {
    try {
      const mass = await messeEimer(cfg, name, { listImpl });
      if (!mass.ok) { stumm.push(`${name} (HTTP ${mass.status})`); continue; }
      belegtBytes += mass.bytes;
      teile.push(`${name} ${formatiereBytes(mass.bytes)}/${mass.objekte} Obj.${mass.abgeschnitten ? " (Liste abgeschnitten!)" : ""}`);
    } catch (f) {
      stumm.push(`${name} (${String(f?.message || f).slice(0, 40)})`);
    }
  }
  if (!teile.length) {
    return { ok: false, meldung: `Füllstand nicht messbar — kein Eimer listbar: ${stumm.join(", ")}` };
  }
  const paketGb = Number(env.SMEJJ_SPEICHER_PAKET_GB) || PAKET_GB_STANDARD;
  const urteil = beurteileFuellstand({ belegtBytes, paketGb });
  const zusammenfassung = `${urteil.grund} — ${teile.join(", ")}`
    + (stumm.length ? `; nicht lesbar: ${stumm.join(", ")}` : "")
    + "; Sicherungs-Eimer bewusst unlesbar (Isolation)";
  try {
    await speicher.schreib({ id: ABLAGE_ID, createdAt: new Date(jetztMs).toISOString(), ok: urteil.ok, belegtBytes, quote: urteil.quote, zusammenfassung });
  } catch { /* die Meldung unten trägt die Zahlen auch ohne Ablage */ }
  return { ok: urteil.ok, meldung: `Selbsttest 6/6; ${zusammenfassung}` };
}
