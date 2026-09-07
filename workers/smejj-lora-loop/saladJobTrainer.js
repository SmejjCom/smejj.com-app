// smejj.com Dauertrainings-Schleife — Trainer-Anschluss ueber SALAD-JOBS.
//
// WARUM ES DIESE ZWEITE FASSUNG GIBT, und das ist keine Geschmacksfrage:
//
// Der urspruengliche Anschluss (trainerClient.js) spricht mit einem DAUERDIENST
// unter fester Adresse. Dieser Weg ist am 2026-08-03 nachweislich gescheitert
// (task-capsules/2026/08/job_training_stillstand_20260803/): der Container lief,
// die Anwendung darin bediente nicht, Salad meldete trotzdem "ready", und weil
// keine Sonde eingerichtet war, blieb der Stillstand 28 Stunden unbemerkt. Die
// Schleife hat in ihrer ganzen Lebenszeit NULL Zyklen gefahren — zyklusIndex 0,
// letzteGruende ["trainer_nicht_erreichbar"].
//
// Der Job-Weg schliesst genau diesen Fehler STRUKTURELL aus, nicht durch mehr
// Sorgfalt:
//
//   * Es gibt keine Adresse, die stehenbleiben und Miete kosten kann. Zwischen
//     zwei Laeufen laeuft nichts.
//   * "Bedient der Prozess?" wird nicht mehr geraten. Der Job schreibt jede
//     Minute einen Herzschlag nach e2 (con/logs/jobs/<id>/status.json). Bleibt
//     er aus, ist das sichtbar — ohne Sonde, ohne Portal.
//   * Ein Job hat eine eigene Zeitgrenze und schaltet sich selbst ab.
//
// Der Weg ist seit dem 2026-09-03 im con-Autopiloten und seit dem 2026-09-05
// fuer smejj im Einsatz (Laeufe 1.2, 1.3, 1.4). Er ist erprobt, der andere ist
// widerlegt.
//
// VERTRAG: Dieses Modul erfuellt exakt dieselben vier Funktionen wie
// trainerClient.js, damit cycle.js nicht wissen muss, welcher Weg gerade
// benutzt wird — starteTraining, trainingZustand, brichTrainingAb,
// trainerErreichbar. Wer den Vertrag aendert, muss beide Fassungen aendern;
// tests/lora-loop-salad-job.test.mjs prueft, dass sie deckungsgleich bleiben.
//
// FAIL-CLOSED gilt unveraendert: jeder Fehler ist ein NEIN, nie ein
// "vermutlich schon gelaufen". Ein unklarer Zustand heisst "unbekannt" und wird
// vom Aufrufer wie ein Fehlschlag behandelt (mit Toleranz, siehe cycle.js).

import { saladClient, bereiteJobVor, gruppenZustand } from "../con-autopilot/salad.js";

/** Der Modus, unter dem der Job-Container trainiert (job.py kennt ihn). */
export const MODUS_TRAINING = "training";

/**
 * Job-Kennung aus Version und Zeit. Gleiche Form wie im con-Autopiloten und in
 * den smejj-Skripten, damit die Protokolle unter con/logs/jobs/ einheitlich
 * bleiben und ein Job seiner Version ansehbar ist.
 */
export function neueJobId(version, jetzt = () => new Date()) {
  const stempel = jetzt().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const kurz = String(version || "smejj").replace(/[^a-z0-9]/gi, "").toLowerCase();
  return `${kurz}-${stempel}-training`;
}

/**
 * Uebersetzt eine Sweep-Konfiguration in die Trainingsparameter des Jobs.
 *
 * Rein und testbar — das ist die Stelle, an der die systematische Suche
 * (sweep.js) tatsaechlich beim Trainer ankommt. Ging sie hier verloren, liefe
 * die Schleife 27 Zyklen lang mit identischen Einstellungen und der Vergleich
 * waere reines Rauschen.
 *
 * minutenJeSchritt 0.3 ist GEMESSEN (05.09., 16 s je Schritt auf dem 4B-Modell),
 * nicht vom 27B-Modell geerbt. Der geerbte Wert 2,5 liess einen bezahlten Lauf
 * 416 von 16.234 Paaren sehen.
 */
export function jobParameterAus(konfiguration, { version, datensatzName, maxZeilen = 20000 } = {}) {
  if (!version) throw new Error("jobParameterAus: version fehlt");
  if (!datensatzName) throw new Error("jobParameterAus: datensatzName fehlt");
  return {
    CON_KANDIDAT: version,
    CON_DATENSATZ_PREFIX: `datasets/${datensatzName}`,
    CON_CHECKPOINT_PREFIX: "checkpoints/smejj",
    CON_VERSION: version,
    CON_TRAIN_KONFIG: JSON.stringify({
      rang: konfiguration?.loraRang ?? 16,
      alpha: konfiguration?.loraAlpha ?? 32,
      epochen: konfiguration?.epochen ?? 1,
      lernrate: konfiguration?.lernrate ?? 0.0001,
      maxZeilen,
      minutenJeSchritt: 0.3,
      // Dieser Lauf trainiert nur; die Bewertung ist ein eigener Job.
      messReserveMinuten: 5
    })
  };
}

/**
 * Ist der Weg zur GPU offen? Beim Job-Betrieb heisst das: antwortet die
 * Salad-API.
 *
 * WICHTIG UND ABSICHTLICH: Ein 404 auf die Gruppe ist ein JA. Die Gruppe wird
 * beim ersten Lauf angelegt (bereiteJobVor); sie noch nicht zu haben ist der
 * normale Anfangszustand und kein Hindernis. Ein 404 als Nein zu werten haette
 * die Schleife vor ihrem ersten Zyklus fuer immer gesperrt — genau die Art
 * Fehler, an der die alte Fassung starb.
 */
export async function trainerErreichbar({ client } = {}) {
  if (!client) return false;
  try {
    const r = await client.lese();
    return r.ok === true || r.status === 404;
  } catch {
    return false;
  }
}

/**
 * Startet einen Trainingslauf als Salad-Job.
 *
 * Rueckgabe wie trainerClient.starteTraining: {ok, laufId} oder
 * {ok:false, gruende, aktiverLauf}. `aktiverLauf` traegt hier die Job-Kennung
 * eines verwaisten Containers, damit der Aufrufer ihn aufraeumen kann.
 */
export async function starteTraining({
  client,
  e2,
  konfig,
  konfiguration,
  version,
  datensatzName,
  maxMinuten = 420,
  jetzt = () => new Date(),
  warteUndStarte,
  log = () => {}
} = {}) {
  if (!client || !konfig) return { ok: false, gruende: ["salad_client_oder_konfig_fehlt"] };
  if (!version) return { ok: false, gruende: ["version_fehlt"] };
  if (!datensatzName) return { ok: false, gruende: ["datensatz_fehlt"] };

  const jobId = neueJobId(version, jetzt);
  let parameter;
  try {
    parameter = jobParameterAus(konfiguration, { version, datensatzName });
  } catch (fehler) {
    return { ok: false, gruende: [`job_parameter_ungueltig:${String(fehler?.message || fehler).slice(0, 120)}`] };
  }

  const vorbereitet = await bereiteJobVor({
    client, konfig, e2, jobId, modus: MODUS_TRAINING, parameter, maxMinuten, log
  }).catch((fehler) => ({ ok: false, gruende: [`job_vorbereiten_fehler:${String(fehler?.message || fehler).slice(0, 160)}`] }));

  if (!vorbereitet.ok) {
    // bereiteJobVor stoppt einen verwaisten Container selbst und meldet das als
    // Grund. Der naechste Takt setzt dann sauber an — hier ist nichts mehr zu tun.
    return { ok: false, gruende: vorbereitet.gruende || ["job_vorbereiten_fehlgeschlagen"] };
  }

  // Eine frisch angelegte Gruppe ist kurz "Pending" und weist den Start mit
  // HTTP 400 ab. Gemessen 06.09.: das kostete einen ganzen Lauf, weil der
  // Fehlschlag wie ein echter aussah. Darum wird der Zustand abgewartet.
  const start = warteUndStarte ? await warteUndStarte(client) : await client.starte();
  if (!start?.ok) {
    return {
      ok: false,
      gruende: [`job_start_fehlgeschlagen:${start?.status || "unbekannt"}`],
      aktiverLauf: null
    };
  }
  log(`[smejj-lora-loop] Trainings-Job ${jobId} gestartet (Gruppe ${konfig?.salad?.gruppe}, Frist ${maxMinuten} min)`);
  return { ok: true, laufId: jobId };
}

/**
 * Fragt den Zustand ab.
 *
 * ZWEI QUELLEN, und die Reihenfolge ist der Kern dieses Moduls:
 *
 *   1. Der HERZSCHLAG des Jobs in e2 (status.json) ist die WAHRHEIT. Er kommt
 *      aus dem Prozess selbst; nur er weiss, ob wirklich gerechnet wird.
 *   2. Der Gruppenzustand von Salad ist nur der RAHMEN. Ein "running" von
 *      Salad bedeutet ausschliesslich "Prozess gestartet" — die Lehre vom
 *      2026-08-03, wortgleich in der Kapsel: ein 'running, ready=true' ohne
 *      Sonde ist eine inhaltsleere Aussage.
 *
 * Daraus folgt die Rangfolge: sagt der Herzschlag "fertig", ist es fertig, auch
 * wenn Salad die Gruppe noch abbaut. Sagt Salad "stopped", waehrend kein
 * Herzschlag ein Ende meldet, ist der Lauf abgestuerzt — nicht fertig.
 */
export async function trainingZustand({ client, e2, laufId, version } = {}) {
  if (!client || !e2 || !laufId) return { zustand: "unbekannt", fehler: "aufruf_unvollstaendig" };

  const status = await e2.getJson(`con/logs/jobs/${laufId}/status.json`, null).catch(() => null);
  const gruppe = await gruppenZustand(client).catch(() => ({ ok: false, zustand: "unbekannt" }));

  // 1. Herzschlag meldet ein Ende — das schlaegt alles andere.
  if (status?.fertig === true) {
    if (status.ok === true || status.phase === "fertig") {
      const training = version
        ? await e2.getJson(`con/versions/${version}/training.json`, null).catch(() => null)
        : null;
      return {
        zustand: "fertig",
        adapterSchluessel: training?.adapterPrefix || null,
        messEndpunkt: null,
        gelaufeneMinuten: minutenAus(status)
      };
    }
    return {
      zustand: "fehlgeschlagen",
      fehler: String(status.fehler || status.phase || "job_fehler").slice(0, 160),
      gelaufeneMinuten: minutenAus(status)
    };
  }

  // 2. Kein Ende gemeldet, aber Salad hat die Gruppe beendet: abgestuerzt.
  //    Ausnahme "fehlt"/404 — dann ist die Gruppe noch gar nicht angelegt und
  //    der Start laeuft gerade erst an.
  if (gruppe.ok && ["stopped", "failed"].includes(String(gruppe.zustand))) {
    return {
      zustand: "fehlgeschlagen",
      fehler: `gruppe_${gruppe.zustand}_ohne_abschluss`,
      gelaufeneMinuten: minutenAus(status)
    };
  }

  // 3. Salad antwortet nicht — unbekannt, NICHT fehlgeschlagen. Am 06.08.
  //    starben drei bezahlte Laeufe an Aussetzern der Zugangsschicht von 7 bis
  //    78 Minuten, waehrend die Karte normal weiterrechnete.
  if (!gruppe.ok && !status) return { zustand: "unbekannt", fehler: `gruppe_status_${gruppe.status || "?"}` };

  return { zustand: "laeuft", gelaufeneMinuten: minutenAus(status), phase: status?.phase || null };
}

/** Minuten seit Jobstart aus dem Herzschlag; ohne Angabe 0 statt geraten. */
function minutenAus(status) {
  const roh = Number(status?.minuten);
  if (Number.isFinite(roh) && roh >= 0) return roh;
  const gestartet = Date.parse(status?.gestartet || "");
  if (!Number.isFinite(gestartet)) return 0;
  return Math.max(0, (Date.now() - gestartet) / 60_000);
}

/**
 * Bricht den Lauf ab: die Container-Gruppe wird gestoppt.
 *
 * Gibt nur bei bestaetigtem Stopp true zurueck. Ein "vermutlich beendet" waere
 * hier die teuerste Luege des ganzen Moduls — eine Karte, die niemand mehr
 * beobachtet, laeuft bis zur Zeitgrenze weiter und kostet.
 */
export async function brichTrainingAb({ client } = {}) {
  if (!client) return false;
  try {
    const r = await client.stoppe();
    return r?.ok === true;
  } catch {
    return false;
  }
}

/**
 * Baut den Adapter in der Form, die cycle.js einreicht: die vier
 * Vertragsfunktionen, aber mit fest verdrahtetem Client, e2 und Konfiguration.
 *
 * Der Grund fuer diese Klammer: cycle.js reicht `basisUrl` und `apiKey` durch,
 * weil der HTTP-Weg das braucht. Der Job-Weg braucht stattdessen einen Client
 * und eine Ablage. Statt cycle.js beide Welten beizubringen, bindet dieser
 * Bauplan die Unterschiede hier — cycle.js sieht nur noch vier Funktionen.
 */
export function baueSaladJobTrainer({ client, e2, konfig, version, datensatzName, maxMinuten, warteUndStarte, jetzt, log } = {}) {
  return Object.freeze({
    art: "salad-job",
    trainerErreichbar: () => trainerErreichbar({ client }),
    starteTraining: ({ konfiguration } = {}) => starteTraining({
      client, e2, konfig, konfiguration, version, datensatzName, maxMinuten, warteUndStarte, jetzt, log
    }),
    trainingZustand: ({ laufId } = {}) => trainingZustand({ client, e2, laufId, version }),
    brichTrainingAb: () => brichTrainingAb({ client })
  });
}

/** Client aus der Konfiguration — duenne Klammer, damit Tests ihn ersetzen koennen. */
export function clientFuer(konfig, optionen = {}) {
  return saladClient(konfig.salad, optionen);
}
