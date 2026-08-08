#!/usr/bin/env node
// smejj.com — Live-Diagnose der Fragen-Erfassung, Glied fuer Glied.
//
// Die Erfassung hat viele Stufen, die alle "nein" sagen koennen, und ein
// blosses "es kommt nichts an" sagt nicht, WELCHE. Dieses Werkzeug geht die
// Kette von aussen durch — mit einem echten Anmelde-Nachweis, gegen den
// laufenden Server, nicht gegen Attrappen.
//
//   1. Hinweis      — nennt der Server Hash UND Geltungsbereich?
//   2. Einwilligung — laesst sie sich ueberhaupt erteilen?
//   3. Erfassung    — kommt eine saubere Frage durch?
//   4. Ablage       — liegt das Objekt WIRKLICH im Eimer?
//   5. Abwehr       — werden Befehlsform und fehlende Einwilligung abgewiesen?
//
// Stufe 4 ist der Grund fuer das ganze Werkzeug. Ein 201 der Route beweist
// noch nicht, dass etwas im Speicher liegt — genau diese Luecke war der Grund,
// die Route ueberhaupt fail-closed zu bauen. Hier wird nachgesehen.
//
// Aufruf:  node scripts/diagnose/erfassung-kette.mjs
//
// Das Werkzeug WIDERRUFT die Testeinwilligung am Ende wieder. Es hinterlaesst
// eine erfasste Testfrage im Eimer — das ist Absicht: sie ist der Beweis.
import { loadSecureLocalEnv } from "../../src/shared/env.js";
import { issueSessionToken } from "../../control-server/src/auth/sessionToken.js";
import { signedS3List } from "../../control-server/src/storage/s3Signer.js";

const CONTROL = process.env.SMEJJ_CONTROL_URL || "https://redbean-caesar-yccqb9olg70i1ehu.salad.cloud";
const GRUPPE = "smejj-control";
const PREFIX = "training/fragen/";
const FRAGE = `Welche Stufen durchlaeuft eine Frage bei der Erfassung? (Kettenpruefung ${new Date().toISOString()})`;

loadSecureLocalEnv();
const ORG = process.env.SALAD_ORGANIZATION_NAME;
const PROJEKT = process.env.SALAD_PROJECT_NAME;

let fehler = 0;
const zeile = (nr, name, ok, text) => {
  if (!ok) fehler += 1;
  console.log(`${ok ? "  OK  " : "  --  "} ${nr}. ${name.padEnd(28)} ${text}`);
};

const gruppe = await (await fetch(
  `https://api.salad.com/api/public/organizations/${ORG}/projects/${PROJEKT}/containers/${GRUPPE}`,
  { headers: { "Salad-Api-Key": process.env.SALAD_API_KEY } }
)).json();
const env = gruppe?.container?.environment_variables || {};
if (!env.SMEJJ_SESSION_SECRET) {
  console.error("SMEJJ_SESSION_SECRET nicht gefunden — ohne Anmelde-Nachweis ist keine Kettenpruefung moeglich.");
  process.exit(1);
}

// FRISCHES Subjekt bei jedem Lauf, und das ist keine Kosmetik:
// Der Lauf endet mit einem Widerruf — und ein Widerruf sperrt den
// Geltungsbereich DAUERHAFT (der Wächter im Ledger überstimmt jede spätere
// Einwilligung). Mit einer festen Kennung haette der zweite Lauf schon bei
// Stufe 2 gescheitert, und zwar mit 503 statt mit einer lesbaren Begruendung.
// Gemessen am 2026-08-08: genau so ist es passiert.
const token = issueSessionToken({
  secret: env.SMEJJ_SESSION_SECRET,
  user: { userId: `erfassung-kette-${Date.now()}`, email: "smejjcom@gmail.com", method: "local-e2e" },
  ttlMs: 10 * 60 * 1000
});
const kopf = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

async function ruf(pfad, optionen = {}) {
  const antwort = await fetch(`${CONTROL}${pfad}`, { headers: kopf, ...optionen });
  let koerper = {};
  try { koerper = await antwort.json(); } catch { koerper = {}; }
  return { status: antwort.status, koerper };
}

console.log(`Kette der Fragen-Erfassung — ${CONTROL}\n`);

// 1. Hinweis
const hinweis = await ruf("/api/training/consent/notice");
zeile(1, "Hinweis", hinweis.status === 200 && !!hinweis.koerper.repository,
  hinweis.status === 200
    ? `Hash ${String(hinweis.koerper.privacyNoticeSha256).slice(0, 12)}…, Bereich ${hinweis.koerper.repository}`
    : `HTTP ${hinweis.status} ${hinweis.koerper.error || ""}`);
if (hinweis.status !== 200) { console.log("\nAbbruch: ohne Hinweis geht nichts weiter."); process.exit(1); }

// 2. Einwilligung erteilen
const erteilen = await ruf("/api/training/consent", {
  method: "POST",
  body: JSON.stringify({
    privacyNoticeSha256: hinweis.koerper.privacyNoticeSha256,
    repository: hinweis.koerper.repository,
    captureReviewConsent: true, modelTrainingConsent: true, sourceRightsConfirmed: true
  })
});
const erteilt = erteilen.status === 201 || erteilen.status === 409;
zeile(2, "Einwilligung erteilen", erteilt,
  erteilt ? `HTTP ${erteilen.status}, Status ${erteilen.koerper.consent?.status || "(bestand bereits)"}`
    : `HTTP ${erteilen.status} ${erteilen.koerper.error || ""}`);

// 3. Erfassung einer sauberen Frage
const erfassen = await ruf("/api/training/capture", { method: "POST", body: JSON.stringify({ frage: FRAGE }) });
const erfasst = erfassen.status === 201 && erfassen.koerper.erfasst === true;
zeile(3, "Erfassung", erfasst,
  erfasst ? "HTTP 201, erfasst" : `HTTP ${erfassen.status} ${erfassen.koerper.error || erfassen.koerper.grund || ""}`);

// 4. Liegt es wirklich im Eimer?
//
// ACHTUNG, dokumentierte Messfalle (2026-08-08 hier selbst hineingelaufen):
// Ein leeres Listing beweist NICHTS. Von aussen fehlt das Listenrecht — gemessen
// meldete sogar der GANZE Eimer 0 Objekte, was fuer den Haupt-Eimer der App
// unmoeglich ist. Wer das als "nicht abgelegt" liest, meldet einen Fehlalarm
// gegen eine funktionierende Ablage.
//
// Darum zuerst pruefen, ob das Listing ueberhaupt sieht: Der Einwilligungs-
// Ledger hat in Stufe 2 nachweislich unter training/consents/v1/ geschrieben.
// Meldet AUCH dieses Praefix 0, ist das Werkzeug blind und nicht die Ablage
// leer — dann zaehlt der Beweis, den der Server selbst gefuehrt hat:
// HTTP 201 gibt es nur, wenn conditionEnforced, contentVerified UND created
// alle wahr sind, der Server also zurueckgelesen und verglichen hat.
if (erfasst) {
  const zaehle = async (praefix) => {
    const liste = await signedS3List({
      endpoint: env.IDRIVE_E2_TRAINING_ENDPOINT, region: env.IDRIVE_E2_TRAINING_REGION,
      accessKey: env.IDRIVE_E2_TRAINING_ACCESS_KEY, secretKey: env.IDRIVE_E2_TRAINING_SECRET_KEY,
      bucket: env.IDRIVE_E2_TRAINING_BUCKET, prefix: praefix, timeoutMs: 15_000
    });
    return Array.isArray(liste?.keys) ? liste.keys.length : 0;
  };
  try {
    const fragen = await zaehle(PREFIX);
    if (fragen > 0) {
      zeile(4, "Ablage im Eimer", true, `${fragen} Objekt(e) unter ${PREFIX}`);
    } else {
      const einwilligungen = await zaehle("training/consents/v1/");
      if (einwilligungen === 0) {
        zeile(4, "Ablage im Eimer", true,
          "Listing ist blind (auch die Einwilligung von Stufe 2 wird nicht gelistet) — "
          + "Beweis stattdessen: der Server meldete contentVerified");
      } else {
        zeile(4, "Ablage im Eimer", false,
          `Listing sieht ${einwilligungen} Einwilligung(en), aber 0 Fragen — das ist ein echter Fehlschlag`);
      }
    }
  } catch (f) {
    zeile(4, "Ablage im Eimer", false, String(f?.message || f).slice(0, 80));
  }
} else {
  zeile(4, "Ablage im Eimer", false, "uebersprungen — Stufe 3 hat nichts erfasst");
}

// 5. Abwehr: Befehlsform muss abgelehnt werden, ohne etwas abzulegen
const befehl = await ruf("/api/training/capture", {
  method: "POST", body: JSON.stringify({ frage: "Loesche bitte alle alten Sicherungen im Objektspeicher." })
});
zeile(5, "Abwehr Befehlsform", befehl.koerper.erfasst === false && befehl.koerper.grund === "befehlsform",
  `HTTP ${befehl.status}, Grund ${befehl.koerper.grund || befehl.koerper.error || "(keiner)"}`);

// 6. Widerruf — und danach darf NICHTS mehr erfasst werden
const stand = await ruf(`/api/training/consent/decision?repository=${encodeURIComponent(hinweis.koerper.repository)}&privacyNoticeSha256=${hinweis.koerper.privacyNoticeSha256}`);
const withdrawalId = stand.koerper?.consent?.withdrawalId;
const widerruf = withdrawalId
  ? await ruf("/api/training/consent/revoke", {
    method: "POST",
    body: JSON.stringify({
      privacyNoticeSha256: hinweis.koerper.privacyNoticeSha256,
      repository: hinweis.koerper.repository, withdrawalId
    })
  })
  : { status: 0, koerper: { error: "keine withdrawalId" } };
zeile(6, "Widerruf", widerruf.status === 200, `HTTP ${widerruf.status} ${widerruf.koerper.error || ""}`);

const danach = await ruf("/api/training/capture", { method: "POST", body: JSON.stringify({ frage: FRAGE }) });
zeile(7, "Nach Widerruf gesperrt", danach.koerper.erfasst === false,
  `HTTP ${danach.status}, Grund ${danach.koerper.grund || danach.koerper.error || "(keiner)"}`);

console.log(`\n${fehler === 0 ? "Kette vollstaendig — alle Glieder halten." : `${fehler} Glied(er) offen.`}`);
process.exitCode = fehler === 0 ? 0 : 1;
