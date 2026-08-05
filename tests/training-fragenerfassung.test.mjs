// smejj.com — Tests der Nutzerfragen-Erfassung.
//
// Diese Tests bewachen eine Funktion, die personenbezogene Daten beruehrt. Sie
// pruefen darum vor allem, WANN NICHT erfasst wird. Ein Fehler in diese
// Richtung ist nicht ein schlechteres Trainingsbeispiel, sondern erfasste Daten
// ohne Deckung.
//
// Die Einwilligung wird ECHT gebaut — signierter Grant, gebundener Scope,
// aufgeloeste Entscheidung. Eine handgeschriebene Attrappe wuerde die
// eigentliche Pruefung (capturePersistenceAllowed) umgehen und genau das
// verfehlen, was hier abgesichert gehoert.
import test from "node:test";
import assert from "node:assert/strict";
import {
  bindConsentScope,
  consentDecision,
  createConsentGrant,
  createConsentRevocation,
  trainingConsentConfig
} from "../src/training/consent.js";
import {
  ABLEHNUNG,
  bucheErfassung,
  FRAGE_MAX_ZEICHEN,
  neueErfassungsStatistik,
  pruefeFrage
} from "../src/training/fragenerfassung.js";

const NOTICE_HASH = "a".repeat(64);
const ENV_CONSENT = {
  SMEJJ_TRAINING_CONSENT_API_ENABLED: "YES",
  SMEJJ_TRAINING_PRIVACY_NOTICE_SHA256: NOTICE_HASH,
  SMEJJ_TRAINING_CONSENT_SIGNING_KEY_ID: "consent-signing-v1",
  SMEJJ_TRAINING_CONSENT_SIGNING_KEY_B64: Buffer.alloc(32, 17).toString("base64"),
  SMEJJ_TRAINING_CONSENT_BINDING_KEY_ID: "consent-binding-v1",
  SMEJJ_TRAINING_CONSENT_BINDING_KEY_B64: Buffer.alloc(32, 29).toString("base64")
};
const CONFIG = trainingConsentConfig(ENV_CONSENT);
const SUBJECT = "user:test-owner";
const REPOSITORY = "smejjcom/smejj-app";
const NOW = "2026-07-10T12:00:00.000Z";
const AN = { SMEJJ_TRAINING_CAPTURE_ENABLED: "YES" };
const FRAGE = "Wo liegen bei smejj.com die Backups?";

let laufendeId = 1;
const uuid = () => `00000000-0000-4000-8000-${String(laufendeId++).padStart(12, "0")}`;

function grant(felder = {}) {
  return createConsentGrant({
    subjectId: SUBJECT,
    repository: REPOSITORY,
    privacyNoticeSha256: NOTICE_HASH,
    captureReviewConsent: true,
    modelTrainingConsent: true,
    sourceRightsConfirmed: true,
    ...felder
  }, { config: CONFIG, now: NOW, randomUUID: uuid });
}

function entscheidung(entries, now = NOW) {
  const scope = bindConsentScope({ subjectId: SUBJECT, repository: REPOSITORY, privacyNoticeSha256: NOTICE_HASH }, CONFIG);
  return consentDecision({ entries, scope }, { config: CONFIG, now });
}

test("die Testeinwilligung ist echt und erlaubt Erfassung", () => {
  const d = entscheidung([grant()]);
  assert.equal(d.status, "granted");
  assert.equal(d.captureAllowed, true);
});

test("mit Schalter, Einwilligung und sauberer Frage wird erfasst", () => {
  const e = pruefeFrage(FRAGE, { consentDecision: entscheidung([grant()]), env: AN, now: NOW });
  assert.equal(e.erfassen, true, e.grund || "");
  assert.equal(e.satz.text, FRAGE);
  assert.equal(e.satz.herkunft, "nutzerfrage", "die Herkunft ist der Schluessel fuer varianten.json");
  // Der Beleg muss mitlaufen: ohne ihn liesse sich ein Widerruf spaeter nicht
  // auf die betroffenen Saetze anwenden.
  assert.equal(e.satz.einwilligung.privacyNoticeSha256, NOTICE_HASH);
  assert.equal(e.satz.einwilligung.status, "granted");
  // Und er darf keine Klarnamen tragen.
  assert.doesNotMatch(JSON.stringify(e.satz), /test-owner|smejj-app/);
});

test("der Schalter ueberstimmt alles — auch eine gueltige Einwilligung", () => {
  const d = entscheidung([grant()]);
  for (const env of [{}, { SMEJJ_TRAINING_CAPTURE_ENABLED: "NO" }, { SMEJJ_TRAINING_CAPTURE_ENABLED: "" }]) {
    const e = pruefeFrage(FRAGE, { consentDecision: d, env, now: NOW });
    assert.equal(e.erfassen, false);
    assert.equal(e.grund, ABLEHNUNG.SCHALTER_AUS);
  }
});

test("ohne belastbare Einwilligung wird NICHT erfasst", () => {
  const widerrufen = [grant()];
  widerrufen.push(createConsentRevocation(
    { grant: widerrufen[0], subjectId: SUBJECT, repository: REPOSITORY },
    { config: CONFIG, now: NOW, randomUUID: uuid }
  ));

  const faelle = [
    ["gar keine", undefined],
    ["leeres Objekt", {}],
    ["handgebaute Attrappe", { status: "granted", captureAllowed: true, trainingAllowed: true, verified: true }],
    ["ohne Erfassungs-Einwilligung", entscheidung([grant({ captureReviewConsent: false })])],
    ["ohne Trainings-Einwilligung", entscheidung([grant({ modelTrainingConsent: false })])],
    ["widerrufen", entscheidung(widerrufen)],
    ["veraltet", entscheidung([grant()], "2026-07-10T12:00:00.000Z")]
  ];
  for (const [name, consentDecision] of faelle) {
    // Der veraltete Fall wird ueber ein spaeteres "now" gealtert.
    const now = name === "veraltet" ? "2026-07-20T12:00:00.000Z" : NOW;
    const e = pruefeFrage(FRAGE, { consentDecision, env: AN, now });
    assert.equal(e.erfassen, false, `faelschlich erfasst: ${name}`);
    assert.equal(e.grund, ABLEHNUNG.KEINE_EINWILLIGUNG, name);
    assert.equal(e.satz, null, "ohne Deckung darf kein Satz entstehen");
  }
});

test("eine Frage mit Zugangsdaten wird GANZ verworfen, nicht bereinigt", () => {
  const e = pruefeFrage("Warum lehnt mein Key sk-abcdefghijklmnop1234 ab?", {
    consentDecision: entscheidung([grant()]), env: AN, now: NOW
  });
  assert.equal(e.erfassen, false);
  assert.equal(e.grund, ABLEHNUNG.SENSIBEL);
  assert.equal(e.satz, null, "die bereinigte Fassung darf NICHT ersatzweise erfasst werden");
});

test("Befehlsformen, Nicht-Fragen und Laengen greifen", () => {
  const d = entscheidung([grant()]);
  const grund = (text) => pruefeFrage(text, { consentDecision: d, env: AN, now: NOW }).grund;
  assert.equal(grund("Loesche bitte alle alten Backups im Objektspeicher."), ABLEHNUNG.BEFEHLSFORM);
  assert.equal(grund("Die Backups liegen auf IDrive e2."), ABLEHNUNG.KEINE_FRAGE);
  assert.equal(grund("Wo?"), ABLEHNUNG.ZU_KURZ);
  assert.equal(grund(`${"a".repeat(FRAGE_MAX_ZEICHEN)}?`), ABLEHNUNG.ZU_LANG);
});

test("die Statistik trennt erfasst von abgelehnt und nennt die Gruende", () => {
  // Eine Erfassung, die staendig ablehnt, ist ein Hinweis auf einen fehlenden
  // Einwilligungsweg — nicht auf schweigsame Nutzer. Darum je Grund zaehlen.
  const d = entscheidung([grant()]);
  const s = neueErfassungsStatistik();
  bucheErfassung(s, pruefeFrage(FRAGE, { consentDecision: d, env: AN, now: NOW }));
  bucheErfassung(s, pruefeFrage(FRAGE, { consentDecision: {}, env: AN, now: NOW }));
  bucheErfassung(s, pruefeFrage("Wo?", { consentDecision: d, env: AN, now: NOW }));
  assert.equal(s.geprueft, 3);
  assert.equal(s.erfasst, 1);
  assert.equal(s.abgelehnt[ABLEHNUNG.KEINE_EINWILLIGUNG], 1);
  assert.equal(s.abgelehnt[ABLEHNUNG.ZU_KURZ], 1);
});

test("der erfasste Satz passt in das Format der Fragevarianten", async () => {
  // Der Zweck der Erfassung: varianten.json fuellen. Passt das Format nicht,
  // faellt es erst beim Pruefwerkzeug auf — also hier festhalten.
  const { pruefeEintrag } = await import("../src/training/projectcorpus/fragevarianten.js");
  const e = pruefeFrage(FRAGE, { consentDecision: entscheidung([grant()]), env: AN, now: NOW });
  assert.deepEqual(pruefeEintrag({
    quelle: "AI_Guidelines.md",
    ueberschrift: "7. Kosten-Guardrails",
    fragen: [{ text: e.satz.text, herkunft: e.satz.herkunft, erfasstAm: e.satz.erfasstAm }]
  }), { ok: true, gruende: [] });
});
