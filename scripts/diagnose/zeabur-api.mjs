// smejj.com — schmaler Zugang zur Zeabur-GraphQL-API (Single Responsibility:
// Schluessel finden, Anfrage stellen, Fehler ehrlich melden).
//
// Der Schluessel wird zur Laufzeit aus der Ablage gelesen (env.local oder
// ~/.config/zeabur/cli.yaml) und NIEMALS ausgegeben oder weitergereicht.
import { schluesselKandidaten } from "./zeabur-schluessel-suchen.mjs";
import { loadSecureLocalEnv } from "../../src/shared/env.js";

const API = "https://api.zeabur.com/graphql";
let gemerkt = null;

export function zeaburSchluessel() {
  if (gemerkt) return gemerkt;
  loadSecureLocalEnv();
  const kandidat = schluesselKandidaten()[0];
  if (!kandidat) throw new Error("zeabur_schluessel_fehlt");
  gemerkt = kandidat.wert;
  return gemerkt;
}

export async function zeaburAbfrage(query, variables) {
  const antwort = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${zeaburSchluessel()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000)
  });
  // ERST den Body lesen, DANN ueber den Status urteilen.
  //
  // Vorher flog hier `zeabur_http_422` und der Body wurde verworfen — also
  // genau der Teil, der den Grund enthaelt. GraphQL antwortet auf einen
  // Feldfehler mit 422 UND einer praezisen Meldung ("Cannot query field X on
  // type Y"). Ohne sie bleibt nur Raten, und Raten ist bei Zeabur mehrfach
  // teuer geworden: dieselbe Beziehung heisst je nach Einstieg anders.
  const daten = await antwort.json().catch(() => ({}));
  if (!antwort.ok) {
    const grund = daten.errors?.[0]?.message;
    throw new Error(grund ? `zeabur_http_${antwort.status}: ${String(grund).slice(0, 160)}` : `zeabur_http_${antwort.status}`);
  }
  // Fehlertexte koennen Variablennamen enthalten, aber keine Werte — Zeabur
  // spiegelt Eingaben nicht zurueck. Trotzdem gekuerzt.
  if (daten.errors?.length) throw new Error(String(daten.errors[0]?.message || "zeabur_fehler").slice(0, 160));
  return daten.data;
}
