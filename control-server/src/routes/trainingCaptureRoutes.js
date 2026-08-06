// smejj.com — Teil 3 der Fragen-Erfassung: die Route, die im Betrieb entscheidet.
//
// Bis hierher war `pruefeFrage()` gebaut, getestet und ausgeliefert — aber von
// nichts aufgerufen. Diese Route ruft sie auf, und sie ist der einzige Ort, an
// dem eine Nutzerfrage ueberhaupt zu Trainingsmaterial werden kann.
//
// WARUM EIN EIGENER ENDPUNKT UND KEIN HAKEN IM CHAT-PFAD:
// Ein Haken im Chat-Pfad haette zwei Nachteile, die beide teuer sind. Erstens
// laege eine Einwilligungs-Aufloesung (ein Netzabruf gegen den Ledger) und ein
// Objekt-Schreibvorgang auf dem heissen Pfad jeder einzelnen Frage. Zweitens
// koennte ein Fehler in der Erfassung den Chat kaputt machen — also die
// Kernfunktion fuer eine Nebenfunktion riskieren. Getrennt ist die Erfassung
// einzeln testbar, einzeln abschaltbar und kann den Chat nicht beruehren.
//
// WAS DER KLIENT NICHT ENTSCHEIDET:
// Der Klient loest die Erfassung aus, aber er bestimmt nichts. Die Einwilligung
// wird hier SERVERSEITIG aus dem Ledger aufgeloest, nie aus der Anfrage
// uebernommen. Ein Klient, der `{"eingewilligt": true}` schickt, erreicht
// damit genau nichts.
//
// FAIL-CLOSED, und zwar in dieser Reihenfolge:
//   1. Anmeldung        fehlt -> 401, nichts passiert
//   2. Schalter         aus   -> 503, nichts passiert
//   3. Einwilligung     Ledger sagt nein -> 200 mit Grund, nichts gespeichert
//   4. Form und Inhalt  pruefeFrage() entscheidet
//   5. Speicher         nicht verfuegbar -> 503, NICHTS gespeichert
//
// Stufe 5 ist der Punkt, an dem man leicht das Falsche tut. Wenn der Speicher
// fehlt, waere es bequem, 200 zu melden und die Frage zu verwerfen — die
// Oberflaeche saehe zufrieden aus. Dann meldet die Erfassung aber Erfolg, ohne
// dass etwas erfasst wurde, und niemand merkt monatelang, dass nichts ankommt.
// Darum 503: ein sichtbarer Fehler ist besser als eine stille Luege.
//
// WAS NIE ZURUECKKOMMT: die Frage selbst, der Objektschluessel, die
// Einwilligungs-Innereien. Die Antwort sagt, OB erfasst wurde und warum nicht —
// mehr braucht die Oberflaeche nicht, und mehr gehoert nicht ueber die Leitung.
import { ROUTES } from "../../../src/shared/platform.js";
// authenticatedConsentSubject wird IMPORTIERT, nicht nachgebaut. Ein eigener
// Nachbau griff zuerst auf `user.id` statt `user.userId` zu — die Bindung
// haette dann nie zugetroffen, und zwar lautlos: die Einwilligung waere
// erteilt, die Erfassung haette sie nur nie gefunden.
import {
  authenticatedConsentSubject,
  bindConsentScope,
  trainingConsentConfig
} from "../../../src/training/consent.js";
import { isCaptureEnabled, TRAINING_CONSENT_REPOSITORY } from "../../../src/training/constants.js";
import { ABLEHNUNG, pruefeFrage } from "../../../src/training/fragenerfassung.js";
import {
  createConditionalIdriveWriter,
  createImmutableTrainingObject,
  readTrainingIdriveConfig
} from "../../../src/training/idrive-conditional-writer.js";
import { json, readJson } from "../http/respond.js";
import { createIdriveConsentLedger } from "../training/consentLedger.js";

/** Wohin erfasste Fragen gehen. Nach Tag getrennt, damit eine Sichtung handhabbar bleibt. */
export const CAPTURE_KEY_PREFIX = "training/fragen";

const defaultLedgerFactory = (env, config) => createIdriveConsentLedger(env, { config });

const defaultWriterFactory = (env) => {
  // Fehlt die Speicher-Konfiguration, gibt es KEINEN Schreiber — nicht einen,
  // der still ins Leere schreibt. readTrainingIdriveConfig wirft dann.
  const config = readTrainingIdriveConfig(env);
  return createConditionalIdriveWriter(config);
};

/**
 * Der Objektschluessel einer erfassten Frage.
 *
 * Er traegt KEINE Kennung des Fragenden — weder Konto noch Sitzung. Ein
 * Schluessel ist Metadaten und wird in Auflistungen sichtbar, auch dort, wo der
 * Inhalt es nicht ist. Wer erfasst hat, steht ausschliesslich im Beleg IM
 * Objekt, und auch dort nur als undurchsichtiger Verweis.
 */
export function captureObjectKey(erfasstAm, id) {
  const tag = String(erfasstAm || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tag)) throw new Error("capture_timestamp_invalid");
  if (!/^[a-f0-9-]{36}$/i.test(String(id || ""))) throw new Error("capture_id_invalid");
  return `${CAPTURE_KEY_PREFIX}/${tag.slice(0, 4)}/${tag.slice(5, 7)}/${tag.slice(8, 10)}/${id}.json`;
}

export async function handleTrainingCaptureRoute(req, url, res, dependencies = {}) {
  if (url.pathname === ROUTES.api.trainingCapture && req.method === "POST") {
    return handleCapture(req, res, dependencies);
  }
  return json(res, 404, { ok: false, error: "training_capture_route_not_found" });
}

export async function handleCapture(req, res, {
  env = process.env,
  now = new Date().toISOString(),
  randomUUID = () => globalThis.crypto.randomUUID(),
  ledgerFactory = defaultLedgerFactory,
  writerFactory = defaultWriterFactory
} = {}) {
  // 1. Anmeldung. Ohne sie gibt es kein Subjekt und damit keine Einwilligung,
  //    die man aufloesen koennte.
  if (!req?.authUser) return json(res, 401, { ok: false, error: "authentication_required" });

  // 2. Der projektweite Schalter, vor allem anderen. Steht er nicht auf YES,
  //    wird nichts geprueft, nichts aufgeloest und nichts geschrieben.
  if (!isCaptureEnabled(env)) return json(res, 503, { ok: false, error: "capture_disabled" });

  const config = trainingConsentConfig(env);
  if (!config?.ready) return json(res, 503, { ok: false, error: "consent_configuration_incomplete" });

  let body;
  try {
    body = await readJson(req);
  } catch {
    return json(res, 400, { ok: false, error: "capture_body_invalid" });
  }

  // 3. Die Einwilligung, serverseitig aufgeloest. Was der Klient dazu meint,
  //    wird nicht gelesen.
  let entscheidung;
  try {
    const ledger = ledgerFactory(env, config);
    const scope = bindConsentScope({
      subjectId: authenticatedConsentSubject(req.authUser),
      repository: TRAINING_CONSENT_REPOSITORY,
      privacyNoticeSha256: config.privacyNoticeSha256
    }, config);
    entscheidung = await ledger.resolve(scope, { now });
  } catch {
    // Ein Ledger, der nicht antwortet, ist ein Nein — kein "vielleicht".
    return json(res, 503, { ok: false, error: "consent_service_unavailable" });
  }

  // 4. Form und Inhalt. pruefeFrage() prueft die Einwilligung selbst noch
  //    einmal ueber capturePersistenceAllowed; hier wird sie nur beschafft.
  const ergebnis = pruefeFrage(body?.frage, { consentDecision: entscheidung, env, now });
  if (!ergebnis.erfassen) {
    return json(res, 200, { ok: true, erfasst: false, grund: ergebnis.grund });
  }

  // 5. Ablegen. Erst hier entsteht ueberhaupt ein Objekt.
  let schreiber;
  try {
    schreiber = writerFactory(env);
  } catch {
    return json(res, 503, { ok: false, error: "capture_storage_unavailable" });
  }

  try {
    const ergebnisAblage = await schreiber.putObject(createImmutableTrainingObject({
      key: captureObjectKey(ergebnis.satz.erfasstAm, randomUUID()),
      contentType: "application/json; charset=utf-8",
      body: `${JSON.stringify({ schemaVersion: 1, ...ergebnis.satz }, null, 2)}\n`,
      statusLast: false
    }));
    // Dieselbe Beweisfuehrung wie im Einwilligungs-Ledger: ein Schreibvorgang
    // gilt erst als erfolgt, wenn die Unveraenderlichkeits-Bedingung
    // NACHWEISLICH durchgesetzt und der Inhalt zurueckgeprueft wurde. Ein
    // blosses "kein Fehler geworfen" hiesse nur, dass niemand widersprochen
    // hat — nicht, dass etwas angekommen ist.
    if (ergebnisAblage?.conditionEnforced !== true || ergebnisAblage?.contentVerified !== true ||
        ergebnisAblage?.created !== true) {
      return json(res, 503, { ok: false, error: "capture_not_persisted" });
    }
  } catch {
    // Auch ein bereits belegter Schluessel landet hier. Das ist kein Fehler des
    // Nutzers — aber eben auch kein Erfolg, und wird ehrlich so gemeldet.
    return json(res, 503, { ok: false, error: "capture_not_persisted" });
  }

  return json(res, 201, { ok: true, erfasst: true });
}

export { ABLEHNUNG };
