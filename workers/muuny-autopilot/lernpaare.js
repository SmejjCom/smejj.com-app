// muuny AI — Teil 1: echte Lernpaare sammeln, nur mit Einwilligung
// (Owner-Auftrag 21.09.2026, uebernommen vom System bei smejj.com).
//
// Ein Daumen HOCH schickt Frage + Antwort. Ob daraus Trainingsmaterial wird,
// entscheidet ALLEIN der Server; was der Klient behauptet, wird nie geglaubt.
// Reihenfolge, fail-closed — beim ersten Nein ist Schluss:
//   1. angemeldet?                 (ein vom muuny-Dienst gepruefter Nutzer)
//   2. Erfassung eingeschaltet?    (MUUNY_ERFASSUNG=YES, Standard AUS)
//   3. Einwilligung vorhanden, gueltig, nicht widerrufen?  (signiertes Register)
//   4. Laenge: Frage 8-2000, Antwort 3-4000 Zeichen
//   5. Antwort ist kein Fehler- oder Rueckfalltext
//   6. keine sensiblen Daten (Schluessel, Passwoerter, E-Mail, Telefon, IP) — verworfen, nicht maskiert
//
// Die Pruefungen 2 und 4-6 sind NICHT nachgebaut, sondern dieselben Bausteine wie
// bei smejj (src/training/lernpaare.js, policy.js, sanitize.js). Ein Nachbau haette
// lautlos danebengreifen koennen — genau das ist bei smejj einmal passiert.
//
// EIGENE SCHLUESSEL, EIGENER GELTUNGSBEREICH: die Einwilligung fuer muuny wird mit
// muuny-eigenen Schluesseln signiert und an "muuny.com/muuny" gebunden. Eine
// Einwilligung, die jemand bei smejj.com gegeben hat, gilt hier NICHT — sie galt
// fuer ein anderes Produkt (Eiserne Regel 7: Rechte vor dem ersten Lauf klaeren).
import { bindConsentScope, createConsentGrant, createConsentRevocation, trainingConsentConfig, verifyConsentEntry }
  from "../../src/training/consent.js";
import { isCaptureEnabled } from "../../src/training/constants.js";
import { createConditionalIdriveWriter, createImmutableTrainingObject, readTrainingIdriveConfig }
  from "../../src/training/idrive-conditional-writer.js";
import { pruefeLernpaar } from "../../src/training/lernpaare.js";
import { createImmutableConsentLedger } from "../../control-server/src/training/consentLedger.js";
import { L, lagerPrefix } from "./lager.js";

export const MUUNY_REPOSITORY = "muuny.com/muuny";

/**
 * Was der geteilte Pruefer von smejj NICHT erkennt.
 *
 * Gemessen am 21.09.2026 im Test: "Das Passwort lautet: Sommer2026!Sicher" ging
 * durch — der Pruefer sucht nach der Form `password=...`, nicht nach Saetzen, in
 * denen ein Mensch ein Passwort ausspricht. Ein solches Paar waere im Training
 * gelandet und das Modell haette gelernt, Passwoerter zu wiederholen.
 *
 * Bewusst hier und nicht im geteilten Baustein: eine Aenderung dort wuerde smejj
 * still mitveraendern, ohne dass dessen Tests es verlangt haben.
 */
const ZUSAETZLICH_SENSIBEL = Object.freeze([
  // "... lautet/ist X" — aber nur, wenn X nach einem Geheimnis AUSSIEHT (Ziffer oder
  // Sonderzeichen). Sonst waere "Ein gutes Passwort ist lang" ein Treffer.
  /\b(pass(wort|word|wd)?|kennwort|pwd|pin|geheimzahl|zugangscode|zugangsdaten|login)\b[^\n]{0,24}?\b(lautet|lauten|ist|is|sind|are|war|was)\b\s*[:=]?\s*["\u201e']?(?=\S*[\d!@#$%^&*_+=?])\S{4,}/i,
  /\b(pass(wort|word|wd)?|kennwort|pwd|pin|geheimzahl|zugangscode)\s*[:=]\s*\S{4,}/i
]);

export function zusaetzlichSensibel(...texte) {
  return texte.some((t) => ZUSAETZLICH_SENSIBEL.some((muster) => muster.test(String(t || ""))));
}

/**
 * Die Umgebung, die die geteilten Bausteine lesen — gebaut NUR aus muuny-Werten.
 * Kein SMEJJ_*-Wert aus der echten Umgebung darf hier durchsickern, sonst koennte
 * eine smejj-Einwilligung mit smejj-Schluesseln fuer muuny gelten.
 */
export function einwilligungsEnv(env = process.env) {
  return {
    SMEJJ_TRAINING_CAPTURE_ENABLED: String(env.MUUNY_ERFASSUNG || "NO"),
    SMEJJ_TRAINING_CONSENT_SIGNING_KEY_ID: env.MUUNY_EINWILLIGUNG_SIGNATUR_ID || "",
    SMEJJ_TRAINING_CONSENT_SIGNING_KEY_B64: env.MUUNY_EINWILLIGUNG_SIGNATUR_B64 || "",
    SMEJJ_TRAINING_CONSENT_BINDING_KEY_ID: env.MUUNY_EINWILLIGUNG_BINDUNG_ID || "",
    SMEJJ_TRAINING_CONSENT_BINDING_KEY_B64: env.MUUNY_EINWILLIGUNG_BINDUNG_B64 || "",
    SMEJJ_TRAINING_PRIVACY_NOTICE_SHA256: env.MUUNY_DATENSCHUTZ_SHA256 || ""
  };
}

export function einwilligungsKonfig(env = process.env) {
  return trainingConsentConfig(einwilligungsEnv(env));
}

/** Eine Nutzerkennung, wie der muuny-Dienst sie nach der Anmeldung durchreicht. */
export function subjektAus(nutzerId) {
  const id = String(nutzerId ?? "").trim();
  return /^[A-Za-z0-9_-]{6,128}$/.test(id) ? `muuny:${id}` : null;
}

/** Objektschluessel: nach Tag getrennt, OHNE jede Kennung des Menschen. */
export function lernpaarSchluessel(erfasstAm, id) {
  const tag = String(erfasstAm || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tag)) throw new Error("lernpaar_zeitpunkt_ungueltig");
  if (!/^[a-f0-9-]{36}$/i.test(String(id || ""))) throw new Error("lernpaar_id_ungueltig");
  return `${L.paare}/${tag.slice(0, 4)}/${tag.slice(5, 7)}/${tag.slice(8, 10)}/${id}.json`;
}

/**
 * Der Schreiber fuer unveraenderliche Objekte — nur im Bereich <lager>/training/.
 * Er bestaetigt einen Schreibvorgang erst, wenn die Bedingung "darf nicht schon
 * existieren" durchgesetzt UND der Inhalt zurueckgelesen wurde.
 */
export function ablageSchreiber(e2Konfig, env = process.env) {
  return createConditionalIdriveWriter(readTrainingIdriveConfig({
    IDRIVE_E2_TRAINING_ENDPOINT: e2Konfig.endpoint,
    IDRIVE_E2_TRAINING_REGION: e2Konfig.region,
    IDRIVE_E2_TRAINING_BUCKET: e2Konfig.bucket,
    IDRIVE_E2_TRAINING_ACCESS_KEY: e2Konfig.accessKey,
    IDRIVE_E2_TRAINING_SECRET_KEY: e2Konfig.secretKey,
    IDRIVE_E2_TRAINING_ALLOWED_PREFIXES: `${lagerPrefix(env)}training/`
  }));
}

/**
 * Das Einwilligungs-Register, abgelegt unter <lager>/training/consents/v1/.
 * Der Baustein von smejj schreibt nach training/consents/v1/ — hier wird jeder
 * Schluessel um das muuny-Lager ergaenzt, damit beide Register getrennt bleiben.
 */
export function einwilligungsRegister({ config, schreiber, e2, env = process.env }) {
  const p = lagerPrefix(env);
  return createImmutableConsentLedger({
    config,
    putImmutable: (objekt) => schreiber.putObject({ ...objekt, key: `${p}${objekt.key}` }),
    listObjects: async (prefix) => (await e2.liste(`${p}${prefix}`)).map((o) => o.key.slice(p.length)),
    getObject: async (key) => {
      const text = await e2.getText(`${p}${key}`);
      if (text === null || text === undefined) throw new Error("einwilligung_eintrag_fehlt");
      return text;
    }
  });
}

function bereichFuer(subjekt, config) {
  return bindConsentScope({ subjectId: subjekt, repository: MUUNY_REPOSITORY, privacyNoticeSha256: config.privacyNoticeSha256 }, config);
}

/**
 * Daumen hoch -> vielleicht ein Lernpaar. Wirft NIE: das Daumen-Signal darf am
 * Speichern nicht scheitern, der Chat laeuft weiter.
 * @returns {Promise<{erfasst: boolean, grund: string|null}>}
 */
export async function sichereLernpaar(nutzerId, { frage, antwort } = {}, {
  env = process.env, now = new Date().toISOString(), randomUUID = () => globalThis.crypto.randomUUID(),
  register, schreiber
} = {}) {
  try {
    const subjekt = subjektAus(nutzerId);
    if (!subjekt) return { erfasst: false, grund: "anmeldung_fehlt" };
    const umgebung = einwilligungsEnv(env);
    if (!isCaptureEnabled(umgebung)) return { erfasst: false, grund: "erfassung_abgeschaltet" };
    const config = trainingConsentConfig(umgebung);
    if (!config?.ready) return { erfasst: false, grund: "einwilligung_nicht_eingerichtet" };
    if (!register || !schreiber) return { erfasst: false, grund: "ablage_nicht_eingerichtet" };

    let entscheidung;
    try {
      entscheidung = await register.resolve(bereichFuer(subjekt, config), { now });
    } catch {
      // Ein Register, das nicht antwortet, ist ein Nein — kein "vielleicht".
      return { erfasst: false, grund: "einwilligung_nicht_erreichbar" };
    }

    const ergebnis = pruefeLernpaar(frage, antwort, { consentDecision: entscheidung, env: umgebung, now });
    if (!ergebnis.erfassen) return { erfasst: false, grund: ergebnis.grund };
    if (zusaetzlichSensibel(ergebnis.satz.frage, ergebnis.satz.antwort)) return { erfasst: false, grund: "sensible_daten_erkannt" };

    let ablage;
    try {
      ablage = await schreiber.putObject(createImmutableTrainingObject({
        key: lernpaarSchluessel(now, randomUUID()),
        contentType: "application/json; charset=utf-8",
        body: `${JSON.stringify({ schemaVersion: 1, ...ergebnis.satz }, null, 2)}\n`,
        statusLast: false
      }));
    } catch {
      return { erfasst: false, grund: "nicht_gespeichert" };
    }
    // Erst ein NACHWEISLICH neu angelegtes und zurueckgeprueftes Objekt zaehlt.
    const bewiesen = ablage?.conditionEnforced === true && ablage?.contentVerified === true && ablage?.created === true;
    return bewiesen ? { erfasst: true, grund: null } : { erfasst: false, grund: "nicht_gespeichert" };
  } catch {
    return { erfasst: false, grund: "nicht_gespeichert" };
  }
}

/** Einwilligung erteilen: ein eigener, signierter, unveraenderlicher Eintrag. */
export async function erteileEinwilligung(nutzerId, { datenschutzSha256, trainingJa, pruefungJa, rechteJa } = {}, {
  env = process.env, now = new Date().toISOString(), register
} = {}) {
  const subjekt = subjektAus(nutzerId);
  if (!subjekt) return { ok: false, grund: "anmeldung_fehlt" };
  const config = einwilligungsKonfig(env);
  if (!config?.ready) return { ok: false, grund: "einwilligung_nicht_eingerichtet" };
  // Ausdruecklich, alle drei. Ein fehlendes Ja ist ein Nein.
  if (trainingJa !== true || pruefungJa !== true || rechteJa !== true) return { ok: false, grund: "ausdrueckliches_ja_fehlt" };
  let eintrag;
  try {
    eintrag = createConsentGrant({ subjectId: subjekt, repository: MUUNY_REPOSITORY, privacyNoticeSha256: datenschutzSha256,
      captureReviewConsent: pruefungJa, modelTrainingConsent: trainingJa, sourceRightsConfirmed: rechteJa }, { config, now });
  } catch (fehler) {
    return { ok: false, grund: String(fehler?.message || "einwilligung_ungueltig").slice(0, 80) };
  }
  try {
    await register.appendGrant(eintrag);
  } catch {
    return { ok: false, grund: "nicht_gespeichert" };
  }
  return { ok: true, grund: null, widerrufId: eintrag.withdrawalId };
}

/** Jederzeit widerrufbar. Danach wird kein weiteres Paar dieser Person erfasst. */
export async function widerrufeEinwilligung(nutzerId, { env = process.env, now = new Date().toISOString(), register } = {}) {
  const subjekt = subjektAus(nutzerId);
  if (!subjekt) return { ok: false, grund: "anmeldung_fehlt" };
  const config = einwilligungsKonfig(env);
  if (!config?.ready) return { ok: false, grund: "einwilligung_nicht_eingerichtet" };
  let eintraege;
  try {
    eintraege = await register.readEntries(bereichFuer(subjekt, config));
  } catch {
    return { ok: false, grund: "einwilligung_nicht_erreichbar" };
  }
  const zuWiderrufen = eintraege
    .filter((e) => e?.eventType === "grant" && verifyConsentEntry(e, config))
    .sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt)))[0];
  if (!zuWiderrufen) return { ok: true, grund: "keine_einwilligung_vorhanden" };
  try {
    const paar = createConsentRevocation({ grant: zuWiderrufen, subjectId: subjekt, repository: MUUNY_REPOSITORY }, { config, now });
    await register.appendRevocation(paar);
  } catch (fehler) {
    return { ok: false, grund: String(fehler?.message || "widerruf_fehlgeschlagen").slice(0, 80) };
  }
  return { ok: true, grund: null };
}
