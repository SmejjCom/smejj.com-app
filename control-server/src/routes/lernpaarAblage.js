// smejj.com — Daumen hoch -> Lernpaar (17.09.2026, Betreiber: "Im Chat echte
// Frage-Antwort-Paare sammeln ... nur mit Einwilligung").
//
// Eigene Datei statt Erweiterung von trainingCaptureRoutes.js: jene Route steht
// unter dem Einwilligungs-Lock. Die Einwilligung wird hier mit DENSELBEN
// importierten Bausteinen aufgeloest (authenticatedConsentSubject,
// bindConsentScope, Ledger) — nichts davon ist nachgebaut, sonst koennte die
// Bindung lautlos danebengreifen (Lehre aus trainingCaptureRoutes.js).
//
// Wird von /api/feedback gerufen und wirft NIE: das Feedback-Signal selbst darf
// an der Lernpaar-Ablage nicht scheitern. Ergebnis ist immer {erfasst, grund}.
import { authenticatedConsentSubject, bindConsentScope, trainingConsentConfig } from "../../../src/training/consent.js";
import { isCaptureEnabled, TRAINING_CONSENT_REPOSITORY } from "../../../src/training/constants.js";
import { lernpaarObjektSchluessel, pruefeLernpaar } from "../../../src/training/lernpaare.js";
import {
  createConditionalIdriveWriter,
  createImmutableTrainingObject,
  readTrainingIdriveConfig
} from "../../../src/training/idrive-conditional-writer.js";
import { createIdriveConsentLedger } from "../training/consentLedger.js";

const standardLedger = (env, config) => createIdriveConsentLedger(env, { config });
const standardSchreiber = (env) => createConditionalIdriveWriter(readTrainingIdriveConfig(env));

export async function sichereLernpaar(authUser, { frage, antwort, modell = "" }, {
  env = process.env,
  now = new Date().toISOString(),
  randomUUID = () => globalThis.crypto.randomUUID(),
  ledgerFactory = standardLedger,
  writerFactory = standardSchreiber
} = {}) {
  try {
    if (!authUser) return { erfasst: false, grund: "anmeldung_fehlt" };
    if (!isCaptureEnabled(env)) return { erfasst: false, grund: "erfassung_abgeschaltet" };
    const config = trainingConsentConfig(env);
    if (!config?.ready) return { erfasst: false, grund: "einwilligung_nicht_eingerichtet" };

    let entscheidung;
    try {
      const scope = bindConsentScope({
        subjectId: authenticatedConsentSubject(authUser),
        repository: TRAINING_CONSENT_REPOSITORY,
        privacyNoticeSha256: config.privacyNoticeSha256
      }, config);
      entscheidung = await ledgerFactory(env, config).resolve(scope, { now });
    } catch {
      return { erfasst: false, grund: "einwilligung_nicht_erreichbar" };
    }

    const ergebnis = pruefeLernpaar(frage, antwort, { consentDecision: entscheidung, env, now, modell });
    if (!ergebnis.erfassen) return { erfasst: false, grund: ergebnis.grund };

    const ablage = await writerFactory(env).putObject(createImmutableTrainingObject({
      key: lernpaarObjektSchluessel(now, randomUUID(), { trainingsrecht: ergebnis.satz.quelle.trainingsrecht }),
      contentType: "application/json; charset=utf-8",
      body: `${JSON.stringify({ schemaVersion: 1, ...ergebnis.satz }, null, 2)}\n`,
      statusLast: false
    }));
    // Erst ein NACHWEISLICH unveraenderlich abgelegtes und zurueckgeprueftes
    // Objekt gilt als erfasst — wie bei den Fragen.
    const bewiesen = ablage?.conditionEnforced === true && ablage?.contentVerified === true && ablage?.created === true;
    // trainingsrecht sagt dem Klienten ehrlich, ob das Paar smejj 1 je
    // trainieren darf — gespeichert ist es in beiden Faellen.
    return bewiesen
      ? { erfasst: true, grund: null, trainingsrecht: ergebnis.satz.quelle.trainingsrecht }
      : { erfasst: false, grund: "nicht_gespeichert" };
  } catch {
    return { erfasst: false, grund: "nicht_gespeichert" };
  }
}
