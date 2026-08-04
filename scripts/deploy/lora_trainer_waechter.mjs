#!/usr/bin/env node
// smejj.com — Anlaufwaechter fuer den LoRA-Trainer.
//
//   node scripts/deploy/lora_trainer_waechter.mjs            # beobachtet und stoppt
//   SMEJJ_LORA_BEREIT_FRIST_MS=1800000 node ...              # Frist auf 30 min
//   SMEJJ_WAECHTER_NUR_BEOBACHTEN=YES node ...               # meldet, stoppt nicht
//
// Beantwortet genau eine Frage im Takt: leistet die gemietete Karte etwas?
// Wenn sie laenger als die Frist nicht bereit meldet, wird die Container-Gruppe
// ueber die Salad-API GESTOPPT. Das ist die Abbruchbedingung aus der
// Betreiber-Regel — als Code, nicht als Vorsatz.
//
// Die Entscheidung selbst liegt in workers/smejj-lora-loop/waechter.js und ist
// dort ohne Netz geprueft. Dieses Skript ist nur Augen, Uhr und Hand.
//
// DAUERHAFTES ZUHAUSE: der Zeabur-Dienst smejj-training-loop. Solange dessen
// Umgebung unvollstaendig ist, laeuft der Waechter hier von Hand — eine
// laufende Karte ohne Abbruchbedingung ist die eine Lage, die nicht warten darf.

import { leseWachtGrenzen, bewerteWacht, erzeugeWachtGedaechtnis, leseSaladKoordinaten, saladBestaetigtAusfall } from "../../workers/smejj-lora-loop/waechter.js";
import { loadSecureLocalEnv } from "../../src/shared/env.js";

loadSecureLocalEnv();

function pflicht(name) {
  const wert = process.env[name];
  if (!wert) throw new Error(`${name} fehlt`);
  return wert;
}

const API_KEY = pflicht("SALAD_API_KEY");
const GRUPPE = process.env.SMEJJ_TRAINER_GRUPPE || "smejj-lora-trainer";
const BASIS = `https://api.salad.com/api/public/organizations/${pflicht("SALAD_ORGANIZATION_NAME")}`
  + `/projects/${pflicht("SALAD_PROJECT_NAME")}/containers`;
const TRAINER_URL = (process.env.SMEJJ_TRAINER_PUBLIC_URL
  || "https://lime-parsley-qr1myuiyur3yeow5.salad.cloud").replace(/\/$/, "");
const TAKT_MS = Number(process.env.SMEJJ_WAECHTER_TAKT_MS || 30_000);
const NUR_BEOBACHTEN = String(process.env.SMEJJ_WAECHTER_NUR_BEOBACHTEN || "NO").toUpperCase() === "YES";
// Dauerbetrieb: nach Erreichen von 'bereit' NICHT beenden, sondern weiter wachen.
// Der Anlaufwaechter allein deckt nur das Hochfahren ab; faellt die Karte spaeter
// aus 'bereit' heraus, wuerde das ohne diesen Modus niemand bemerken.
const DAUERBETRIEB = String(process.env.SMEJJ_WAECHTER_DAUERBETRIEB || "NO").toUpperCase() === "YES";

const grenzen = leseWachtGrenzen(process.env);
const koordinaten = leseSaladKoordinaten(process.env);
const gedaechtnis = erzeugeWachtGedaechtnis();

function zeit() {
  return new Date().toISOString().slice(11, 19);
}

/** Eine einzelne /health-Abfrage. Ein Fehlschlag ist "nicht erreichbar", nie ein Absturz. */
async function frageTrainerEinmal() {
  const steuerung = new AbortController();
  const uhr = setTimeout(() => steuerung.abort(), 15_000);
  try {
    const antwort = await fetch(`${TRAINER_URL}/health`, {
      headers: { "Salad-Api-Key": API_KEY },
      signal: steuerung.signal
    });
    if (!antwort.ok) return { erreichbar: false, bereit: false, ladezustand: `http_${antwort.status}` };
    const daten = await antwort.json();
    return {
      erreichbar: true,
      bereit: daten?.bereit === true,
      ladezustand: String(daten?.ladezustand || "?")
    };
  } catch (fehler) {
    return { erreichbar: false, bereit: false, ladezustand: String(fehler?.name === "AbortError" ? "zeitgrenze" : fehler?.message || fehler).slice(0, 80) };
  } finally {
    clearTimeout(uhr);
  }
}

/**
 * /health mit EINER Wiederholung.
 *
 * GEMESSEN AM 2026-08-04: im 60-Sekunden-Takt scheiterte etwa alle zehn Minuten
 * genau eine Abfrage mit "fetch failed", die naechste lief wieder sauber. Zehn
 * Abfragen im Abstand von 1,5 s ergaben zeitgleich 10/10 HTTP 200 bei 162-286 ms.
 * Der Dienst war also nie weg — es ist eine wiederverwendete Verbindung, die das
 * Gateway zwischenzeitlich geschlossen hat (Keep-Alive in undici).
 *
 * Eine EINZELNE Fehlmessung darf deshalb keinen Ausfall bedeuten. Sie erzeugt
 * sonst Fehlalarme, und Fehlalarme sind teuer: man gewoehnt sich an sie und
 * uebersieht den echten Ausfall. Erst wenn auch die Wiederholung scheitert,
 * gilt der Trainer als nicht erreichbar.
 */
async function frageTrainer() {
  const erste = await frageTrainerEinmal();
  if (erste.erreichbar) return erste;
  await new Promise((fertig) => setTimeout(fertig, 2000));
  const zweite = await frageTrainerEinmal();
  if (zweite.erreichbar) return { ...zweite, einmalDaneben: erste.ladezustand };
  return zweite;
}

async function stoppeGruppe(grund) {
  if (NUR_BEOBACHTEN) {
    console.log(`[waechter] ${zeit()} WUERDE STOPPEN (${grund}) — nur beobachtend, nichts getan.`);
    return false;
  }
  const antwort = await fetch(`${BASIS}/${GRUPPE}/stop`, {
    method: "POST",
    headers: { "Salad-Api-Key": API_KEY, accept: "application/json" }
  });
  const ok = antwort.ok || antwort.status === 202 || antwort.status === 204;
  console.log(`[waechter] ${zeit()} STOPP ${GRUPPE} wegen ${grund}: HTTP ${antwort.status} ${ok ? "— Karte beendet" : "— FEHLGESCHLAGEN, von Hand pruefen"}`);
  return ok;
}

async function main() {
  const fristMin = Math.round(grenzen.bereitFristMs / 60000);
  console.log(`[waechter] ${zeit()} beobachtet ${GRUPPE} (${TRAINER_URL})`);
  console.log(`[waechter] Frist ${fristMin} min, Takt ${Math.round(TAKT_MS / 1000)} s, `
    + `${NUR_BEOBACHTEN ? "NUR BEOBACHTEND" : "stoppt bei Fristablauf"}, Waechter ${grenzen.aktiv ? "scharf" : "AUS"}`
    + `, Modus ${DAUERBETRIEB ? "DAUERWACHE" : "Anlaufwache"}`);

  let letzterZustand = null;
  let warBereit = false;
  for (;;) {
    const lage = await frageTrainer();
    // Eine ueberstandene Fehlmessung wird vermerkt, aber NICHT als Ausfall
    // gewertet. Sichtbar bleiben soll sie trotzdem: haeufen sich diese Zeilen,
    // stimmt etwas mit der Leitung oder dem Gateway nicht.
    if (lage.einmalDaneben) {
      console.log(`[waechter] ${zeit()} eine Abfrage daneben (${lage.einmalDaneben}),`
        + " Wiederholung erfolgreich — kein Ausfall.");
    }
    const nichtBereitSeitMs = gedaechtnis.melde(lage.bereit);
    // Die Zweitmeinung wird nur geholt, wenn sie die Entscheidung aendern kann —
    // also wenn der Trainer unerreichbar ist UND die Frist schon abgelaufen ist.
    // Sonst waere es eine zusaetzliche Abfrage im Minutentakt ohne Nutzen.
    const ausfallBestaetigt = (!lage.erreichbar && nichtBereitSeitMs >= grenzen.bereitFristMs)
      ? await saladBestaetigtAusfall({ koordinaten })
      : true;
    const entscheidung = bewerteWacht({ ...lage, nichtBereitSeitMs, ausfallBestaetigt }, grenzen);

    // Nur Zustandswechsel protokollieren; ein Takt von 30 s wuerde sonst in
    // einer Stunde 120 identische Zeilen erzeugen und das Wesentliche zudecken.
    if (lage.ladezustand !== letzterZustand) {
      console.log(`[waechter] ${zeit()} ${lage.erreichbar ? "erreichbar" : "UNERREICHBAR"}`
        + ` bereit=${lage.bereit} ladezustand=${lage.ladezustand}`
        + ` nicht-bereit-seit=${Math.round(nichtBereitSeitMs / 60000)}min`);
      letzterZustand = lage.ladezustand;
    }

    if (lage.bereit) {
      if (!DAUERBETRIEB) {
        console.log(`[waechter] ${zeit()} TRAINER BEREIT — Karte leistet etwas, Waechter beendet sich.`);
        return;
      }
      // Im Dauerbetrieb ist 'bereit' kein Endzustand, sondern der Normalfall.
      // Nur der WECHSEL wird gemeldet, damit das Protokoll lesbar bleibt.
      if (!warBereit) {
        console.log(`[waechter] ${zeit()} TRAINER BEREIT — Dauerwache laeuft weiter (Takt ${Math.round(TAKT_MS / 1000)} s).`);
        warBereit = true;
      }
    } else if (warBereit) {
      // Der gefaehrliche Fall: die Karte WAR bereit und ist es nicht mehr.
      console.log(`[waechter] ${zeit()} ACHTUNG: Trainer aus 'bereit' herausgefallen`
        + ` (ladezustand=${lage.ladezustand}). Frist laeuft.`);
      warBereit = false;
    }

    if (entscheidung.stoppen) {
      await stoppeGruppe(entscheidung.grund);
      return;
    }

    // Kein Stopp, aber auch kein gesunder Zustand: der Waechter ist blind.
    // Das muss sichtbar sein, sonst haelt man Schweigen fuer Sicherheit.
    if (entscheidung.grund?.startsWith("unerreichbar_ohne_zweitmeinung")) {
      console.log(`[waechter] ${zeit()} Frist abgelaufen, aber die EIGENE Leitung steht nicht`
        + ` (${entscheidung.grund}). Es wird NICHTS gestoppt — der Trainer ist von hier aus`
        + " nicht beurteilbar.");
    }

    await new Promise((fertig) => setTimeout(fertig, TAKT_MS));
  }
}

main().catch((fehler) => {
  // Ein abgestuerzter Waechter ist schlimmer als keiner, weil er Sicherheit
  // vortaeuscht. Deshalb laut und mit Exitcode.
  console.error(`[waechter] FEHLER: ${String(fehler?.stack || fehler)}`);
  process.exitCode = 1;
});
