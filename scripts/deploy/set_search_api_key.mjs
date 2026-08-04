#!/usr/bin/env node
// smejj.com — Suchschluessel (Tavily) in die Salad-Umgebung des Control Servers
// schreiben. EIN Wert, sonst nichts.
//
// SICHERHEIT: Der Schluessel wird nie angezeigt, nie geloggt, nie in die
// Zwischenablage gelegt. Er wandert im Arbeitsspeicher von der lokalen Ablage
// (~/.config/smejj.com/env.local) zur Salad-API. Ausgegeben wird nur ein
// Fingerabdruck (erste 5 und letzte 4 Zeichen).
//
// VORGEHEN wie beim Control-Release (Memory_Bank, Billing 3b): GET der
// Container-Definition, lokaler Merge der VOLLEN Variablenliste, PATCH mit
// application/merge-patch+json. Ein Teil-Patch hat schon einmal die
// startup_probe geloescht — deshalb wird immer alles zurueckgeschrieben.
//
// Aufruf (nachdem der Schluessel in ~/.config/smejj.com/env.local steht):
//   CONFIRM_SEARCH_KEY=YES node scripts/deploy/set_search_api_key.mjs
//
// Zum Wiederentfernen:
//   CONFIRM_SEARCH_KEY=YES SMEJJ_SEARCH_KEY_REMOVE=YES node scripts/deploy/set_search_api_key.mjs
import { loadSecureLocalEnv } from "../../src/shared/env.js";

const GRUPPE = "smejj-control";
const VARIABLE = "SMEJJ_SEARCH_TAVILY_API_KEY";
const DECKEL_VARIABLE = "SMEJJ_SEARCH_API_MONTHLY_MAX";
const KEY_MUSTER = /^tvly-[A-Za-z0-9_-]{8,}$/;

function abbruch(text) {
  console.error(text);
  process.exit(1);
}

function fingerabdruck(wert) {
  return `${wert.slice(0, 5)}…${wert.slice(-4)} (${wert.length} Zeichen)`;
}

async function saladApi(method, pfad, rumpf) {
  const antwort = await fetch(`https://api.salad.com/api/public${pfad}`, {
    method,
    headers: {
      "Salad-Api-Key": process.env.SALAD_API_KEY,
      Accept: "application/json",
      ...(rumpf ? { "Content-Type": method === "PATCH" ? "application/merge-patch+json" : "application/json" } : {})
    },
    body: rumpf ? JSON.stringify(rumpf) : undefined
  });
  if (!antwort.ok) abbruch(`Salad ${method} ${pfad} -> ${antwort.status}: ${(await antwort.text()).slice(0, 200)}`);
  return antwort.status === 204 ? {} : antwort.json();
}

async function main() {
  if (process.env.CONFIRM_SEARCH_KEY !== "YES") {
    abbruch("Sicherung: CONFIRM_SEARCH_KEY=YES erforderlich (bewusster Lauf).");
  }
  const entfernen = process.env.SMEJJ_SEARCH_KEY_REMOVE === "YES";

  // VOR loadSecureLocalEnv() lesen, damit ein Wert aus der Shell Vorrang hat
  // und nicht versehentlich ein alter Wert aus der Ablage geschrieben wird.
  let schluessel = String(process.env[VARIABLE] || "").trim();
  loadSecureLocalEnv();
  if (!schluessel) schluessel = String(process.env[VARIABLE] || "").trim();

  if (!entfernen) {
    if (!schluessel) {
      abbruch(
        `${VARIABLE} ist weder in der Shell noch in ~/.config/smejj.com/env.local gesetzt.\n` +
        "So kommst du an den Schluessel:\n" +
        "  1. https://app.tavily.com aufrufen und ein kostenloses Konto anlegen.\n" +
        "  2. KEINE Zahlungsart hinterlegen — ohne Karte kann dort nichts abgerechnet werden.\n" +
        "  3. Unter 'API Keys' den Schluessel kopieren (beginnt mit tvly-).\n" +
        `  4. Zeile ${VARIABLE}=<schluessel> in ~/.config/smejj.com/env.local eintragen.\n` +
        "  5. Diesen Befehl erneut ausfuehren."
      );
    }
    if (!KEY_MUSTER.test(schluessel)) {
      abbruch(`${VARIABLE} hat nicht das Tavily-Format (tvly-…). Bitte pruefen — es wurde NICHTS geschrieben.`);
    }
  }

  if (!process.env.SALAD_API_KEY || !process.env.SALAD_ORGANIZATION_NAME || !process.env.SALAD_PROJECT_NAME) {
    abbruch("Salad-Zugang fehlt (SALAD_API_KEY / SALAD_ORGANIZATION_NAME / SALAD_PROJECT_NAME).");
  }
  const pfad = `/organizations/${process.env.SALAD_ORGANIZATION_NAME}/projects/${process.env.SALAD_PROJECT_NAME}/containers/${GRUPPE}`;

  const definition = await saladApi("GET", pfad);
  const bestand = { ...(definition.container?.environment_variables || {}) };
  const vorherVorhanden = Boolean(bestand[VARIABLE]);

  if (entfernen) {
    if (!vorherVorhanden) {
      console.log(JSON.stringify({ ok: true, hinweis: "Der Schluessel war nicht gesetzt — nichts geaendert." }, null, 2));
      return;
    }
    delete bestand[VARIABLE];
  } else {
    if (bestand[VARIABLE] === schluessel) {
      console.log(JSON.stringify({ ok: true, hinweis: "Derselbe Schluessel steht bereits dort — nichts geaendert." }, null, 2));
      return;
    }
    bestand[VARIABLE] = schluessel;
    // Deckel nur setzen, wenn er fehlt — einen bewusst gewaehlten Wert nie ueberschreiben.
    if (!bestand[DECKEL_VARIABLE]) bestand[DECKEL_VARIABLE] = "900";
  }

  // VOLLSTAENDIGE Variablenliste zurueckschreiben (Teil-Patch hat schon einmal
  // die startup_probe geloescht).
  const ergebnis = await saladApi("PATCH", pfad, { container: { environment_variables: bestand } });

  console.log(JSON.stringify({
    ok: true,
    gruppe: GRUPPE,
    version: ergebnis.version ?? null,
    aktion: entfernen ? "entfernt" : vorherVorhanden ? "ersetzt" : "neu gesetzt",
    variablen: Object.keys(bestand).length,
    schluessel: entfernen ? "(entfernt)" : fingerabdruck(schluessel),
    monatsdeckel: bestand[DECKEL_VARIABLE] || "(nicht gesetzt)",
    hinweis: "Salad startet den Container neu (~60-90 s). Danach /api/health pruefen: suchquelle.konfiguriert"
  }, null, 2));
}

await main();
