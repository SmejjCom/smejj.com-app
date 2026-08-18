#!/usr/bin/env node
// smejj.com — prueft den Groq-Zugang und sagt, WAS mit ihm los ist.
//
// WARUM ES DAS GIBT (2026-08-18): Der Maus-Planer laeuft ueber GLM (23-25 s),
// obwohl Groq in der Anbieterliste steht und in Sekunden antworten wuerde.
// Gemessen: BEIDE Katalogmodelle liefern HTTP 404.
//
//   groq/llama-3.1-8b-instant:    http_404
//   groq/llama-3.3-70b-versatile: http_404
//
// Zwei Modelle, derselbe Fehler — das deutet auf den ZUGANG, nicht auf den
// Modellnamen. Dieses Skript beantwortet die Frage endgueltig, statt weiter
// Namen zu raten:
//   401/403 -> Schluessel ungueltig oder gesperrt
//   200     -> Schluessel gut; die Liste zeigt, WELCHE Modelle er darf
//
// DER SCHLUESSEL WIRD NIE AUSGEGEBEN — nur Laenge und SHA-256-Anfang, genau
// wie beim Maus-Token. Er wird aus der laufenden Zeabur-Umgebung gelesen,
// damit geprueft wird, was der Server WIRKLICH benutzt, und nicht eine
// lokale Kopie, die davon abweicht.
//
// Aufruf: node scripts/diagnose/groq-zugang-pruefen.mjs
import crypto from "node:crypto";
import { zeaburAbfrage } from "./zeabur-api.mjs";

const CONTROL_ID = "6a697bf60d0b094201bcc1ee";
const UMGEBUNG = "6a6666895f062718bc7b1ab2";
const SCHLUESSELNAME = "SMEJJ_LLM_GROQ_API_KEY";

const finger = (wert) => wert
  ? `laenge=${wert.length} sha=${crypto.createHash("sha256").update(wert).digest("hex").slice(0, 8)}`
  : "(nicht gesetzt)";

const daten = await zeaburAbfrage(
  `query($s:ObjectID!,$e:ObjectID!){ service(_id:$s){ variables(environmentID:$e){ key value } } }`,
  { s: CONTROL_ID, e: UMGEBUNG }
);
const eintrag = (daten?.service?.variables || []).find((v) => v.key === SCHLUESSELNAME);
const key = eintrag?.value || "";

console.log(`${SCHLUESSELNAME}: ${finger(key)}`);
if (!key) {
  console.log("\nErgebnis: Es ist gar kein Groq-Schluessel hinterlegt.");
  console.log("Zu tun: einen Schluessel auf console.groq.com/keys erzeugen und");
  console.log("bei Zeabur am Dienst smejj-control als SMEJJ_LLM_GROQ_API_KEY setzen.");
  process.exit(2);
}

// Der Modell-Endpunkt ist der ehrlichste Test: er braucht keine Rechenzeit,
// kostet nichts und trennt "Schluessel kaputt" sauber von "Modell gibt es
// nicht" — genau die zwei Faelle, die ein 404 beim Chatten vermischt.
let antwort;
try {
  antwort = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(20_000)
  });
} catch (fehler) {
  console.log(`\nErgebnis: Groq war nicht erreichbar (${String(fehler?.message || fehler).slice(0, 80)}).`);
  console.log("Das ist ein Netzproblem, keine Aussage ueber den Schluessel.");
  process.exit(2);
}

console.log(`Antwort von Groq: HTTP ${antwort.status}`);

if (antwort.status === 401 || antwort.status === 403) {
  console.log("\nErgebnis: DER SCHLUESSEL WIRD ABGELEHNT.");
  console.log("Zu tun: auf console.groq.com/keys einen neuen erzeugen und bei");
  console.log("Zeabur am Dienst smejj-control als SMEJJ_LLM_GROQ_API_KEY ersetzen.");
  process.exit(2);
}
if (!antwort.ok) {
  console.log(`\nErgebnis: Unerwartete Antwort (${antwort.status}). Kein Urteil ueber den Schluessel.`);
  process.exit(2);
}

const liste = await antwort.json().catch(() => null);
const modelle = (liste?.data || []).map((m) => m.id).sort();
console.log(`\nErgebnis: DER SCHLUESSEL IST GUELTIG. ${modelle.length} Modelle verfuegbar:`);
for (const m of modelle) console.log("  -", m);

// Und jetzt der Punkt, um den es eigentlich geht: kennt Groq die Modelle,
// die unser Katalog eintraegt?
const gewuenscht = ["llama-3.1-8b-instant", "llama-3.3-70b-versatile"];
console.log("\nUnsere Katalog-Eintraege:");
for (const m of gewuenscht) {
  console.log(`  ${modelle.includes(m) ? "vorhanden" : "FEHLT"}  ${m}`);
}
const fehlend = gewuenscht.filter((m) => !modelle.includes(m));
if (fehlend.length) {
  console.log("\nDann liegt es doch am NAMEN, nicht am Zugang: einen der oben");
  console.log("verfuegbaren Namen als SMEJJ_LLM_GROQ_MODEL_FAST setzen.");
}
