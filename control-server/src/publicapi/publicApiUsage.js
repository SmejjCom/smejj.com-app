// smejj.com — Verbrauchskonto der oeffentlichen API.
//
// Ohne diese Datei ist die API ein Geschenk: sie liefert Antworten, und niemand
// weiss, wer wieviel verbraucht hat. Gezaehlt wird pro Konto und UTC-Tag, in
// Token — dieselbe Einheit, in der uns die Anbieter abrechnen.
//
// Bauart bewusst zweistufig: im Speicher wird bei JEDER Anfrage gezaehlt,
// geschrieben wird hoechstens alle 30 Sekunden je Konto. Ein S3-Schreibvorgang
// je Chat-Anfrage waere teurer als die Anfrage selbst. Preis: ein Absturz
// verliert bis zu 30 Sekunden Zaehlung. Das ist fuer eine Verbrauchsanzeige
// vertretbar — fuer eine Rechnung waere es das nicht, dann muss hier ein
// Ereignisprotokoll hin (siehe Hinweis unten).
import {
  getProviderCredential,
  putProviderCredential
} from "../providers/providerCredentialVault.js";

const USAGE_PROVIDER = "smejj-api-usage";
const SICHERUNG_ABSTAND_MS = 30_000;
const konten = new Map();

export function heutigerTag(jetzt = () => Date.now()) {
  return new Date(jetzt()).toISOString().slice(0, 10);
}

/**
 * Zaehlt eine beantwortete Anfrage. Wirft nie — eine gescheiterte Zaehlung
 * darf die Antwort an den Kunden nicht kippen (sie ist zu diesem Zeitpunkt
 * ohnehin schon rausgegangen).
 */
export async function zaehleVerbrauch(kontoId, {
  keyId = "",
  promptTokens = 0,
  completionTokens = 0,
  modell = "",
  env = process.env,
  jetzt = () => Date.now()
} = {}) {
  if (!kontoId) return null;
  try {
    const konto = await ladeKonto(kontoId, env, jetzt);
    const tag = heutigerTag(jetzt);
    if (konto.tag !== tag) {
      konto.tag = tag;
      konto.anfragen = 0;
      konto.promptTokens = 0;
      konto.completionTokens = 0;
    }
    konto.anfragen += 1;
    konto.promptTokens += sichereZahl(promptTokens);
    konto.completionTokens += sichereZahl(completionTokens);
    konto.zuletztAm = new Date(jetzt()).toISOString();
    konto.zuletztModell = String(modell || "").slice(0, 40);
    konto.zuletztKeyId = String(keyId || "").slice(0, 40);
    if (jetzt() - konto.gesichertAm >= SICHERUNG_ABSTAND_MS) await sichere(kontoId, konto, env, jetzt);
    return snapshotVon(konto);
  } catch {
    return null;
  }
}

/** Aktueller Stand fuer die Kontoansicht. Sichert vorher, damit beide gleich sind. */
export async function verbrauchSnapshot(kontoId, env = process.env, jetzt = () => Date.now()) {
  if (!kontoId) return leeresKonto(heutigerTag(jetzt));
  const konto = await ladeKonto(kontoId, env, jetzt);
  if (konto.tag !== heutigerTag(jetzt)) return leeresKonto(heutigerTag(jetzt));
  return snapshotVon(konto);
}

/** Nur fuer Tests. */
export function __leereVerbrauchsSpeicher() {
  konten.clear();
}

// ---- intern ------------------------------------------------------------------

async function ladeKonto(kontoId, env, jetzt) {
  const vorhanden = konten.get(kontoId);
  if (vorhanden) return vorhanden;
  // Beim ersten Zaehlen nach einem Neustart den gespeicherten Tagesstand
  // holen — sonst faengt der Zaehler nach jedem Deploy wieder bei null an und
  // ein Tageslimit waere durch einen Neustart aushebelbar.
  let gespeichert = null;
  try {
    gespeichert = await getProviderCredential(kontoId, USAGE_PROVIDER, env);
  } catch {
    gespeichert = null;
  }
  const tag = heutigerTag(jetzt);
  const passend = gespeichert && gespeichert.tag === tag ? gespeichert : null;
  const konto = {
    tag,
    anfragen: sichereZahl(passend?.anfragen),
    promptTokens: sichereZahl(passend?.promptTokens),
    completionTokens: sichereZahl(passend?.completionTokens),
    zuletztAm: String(passend?.zuletztAm || ""),
    zuletztModell: String(passend?.zuletztModell || ""),
    zuletztKeyId: String(passend?.zuletztKeyId || ""),
    gesichertAm: 0
  };
  konten.set(kontoId, konto);
  return konto;
}

async function sichere(kontoId, konto, env, jetzt) {
  konto.gesichertAm = jetzt();
  await putProviderCredential(kontoId, USAGE_PROVIDER, {
    enabled: true,
    apiKey: "",
    tag: konto.tag,
    anfragen: konto.anfragen,
    promptTokens: konto.promptTokens,
    completionTokens: konto.completionTokens,
    zuletztAm: konto.zuletztAm,
    zuletztModell: konto.zuletztModell,
    zuletztKeyId: konto.zuletztKeyId
  }, env).catch(() => {});
}

function snapshotVon(konto) {
  return {
    tag: konto.tag,
    anfragen: konto.anfragen,
    promptTokens: konto.promptTokens,
    completionTokens: konto.completionTokens,
    gesamtTokens: konto.promptTokens + konto.completionTokens,
    zuletztAm: konto.zuletztAm,
    zuletztModell: konto.zuletztModell
  };
}

function leeresKonto(tag) {
  return { tag, anfragen: 0, promptTokens: 0, completionTokens: 0, gesamtTokens: 0, zuletztAm: "", zuletztModell: "" };
}

function sichereZahl(wert) {
  const zahl = Number(wert);
  return Number.isFinite(zahl) && zahl > 0 ? Math.floor(zahl) : 0;
}
