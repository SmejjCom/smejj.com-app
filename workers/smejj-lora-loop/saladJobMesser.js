// smejj.com Dauertrainings-Schleife — Mess-Anschluss ueber SALAD-JOBS.
//
// cycle.js verlangt eine Funktion `messe({konfiguration, adapterSchluessel})`,
// die {ok, kennzahlen:{punktzahl, kritischeFehler}} liefert. Dieses Modul baut
// sie fuer den Job-Betrieb.
//
// ES GIBT HIER KEINE ZWEITE MESSSTRECKE, und das ist die wichtigste Eigenschaft
// der Datei. Benotet wird ausschliesslich mit `benoteAntworten` aus
// scripts/training/smejj-1-1-messen.mjs — derselben Funktion, mit der der
// Betreiber von Hand misst, die ihrerseits runEvalSuite/buildEvalReport
// benutzt. Eine eigene Benotung im Autopiloten waere die bequemste Art, sich
// die Zahlen schoenzurechnen: Der Autopilot entscheidet ueber Befoerderungen,
// er darf nicht auch noch seine eigene Latte halten.
//
// WAS DER JOB MISST: Basis OHNE Adapter und Kandidat MIT Adapter, in EINEM
// Lauf. Zwei getrennte Laeufe waeren verfuehrerisch (halbe Kosten), aber der
// Vergleich waere wertlos — dieselbe Suite auf zwei verschiedenen Knoten
// gemessen streut, und der Unterschied landete faelschlich beim Adapter.
//
// FAIL-CLOSED, konkret an der Stelle, die am 06.09. wehgetan hat:
// benoteAntworten wirft, wenn weniger als 98 % der Faelle eine echte Antwort
// haben. Ein abgebrochener Messlauf hatte 183 von 295 Antworten leer, wurde
// mit 24 % benotet und waere als gueltiges Urteil ins Register gegangen. Ein
// Abbruch darf nicht aussehen wie ein schlechtes Modell.

import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { bereiteJobVor, gruppenZustand } from "../con-autopilot/salad.js";
import {
  BASIS_STAND,
  EVAL_PREFIX,
  BEWERTUNGEN_PREFIX,
  baueSuitenVerzeichnis,
  benoteAntworten,
  jobParameter,
  messStaende
} from "../../scripts/training/smejj-1-1-messen.mjs";

/** Der Modus, unter dem der Job-Container misst (job.py kennt ihn). */
export const MODUS_MESSUNG = "messung";

/**
 * Zeitgrenze eines Messlaufs.
 *
 * 210 Minuten sind am schlechten Fall bemessen, nicht am guten: die breite
 * Suite hat 295 Faelle, und die gemessene Antwortzeit schwankte am 06.09.
 * zwischen 19 und 150 Sekunden je Antwort — derselbe Job, verschiedene Knoten.
 * Eine am besten Fall bemessene Frist riss eine Messung ab, NACHDEM das
 * Training bereits bezahlt war.
 */
export const MESS_MAX_MINUTEN = 210;

/** Job-Kennung fuer einen Messlauf. */
export function neueMessJobId(version, jetzt = () => new Date()) {
  const stempel = jetzt().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const kurz = String(version || "smejj").replace(/[^a-z0-9]/gi, "").toLowerCase();
  return `${kurz}-${stempel}-messung`;
}

/**
 * Startet einen Messlauf.
 *
 * Die Suite wird HIER aufgeloest und fertig mitgeschickt. Die breite Suite
 * enthaelt keinen einzigen Fall selbst, sondern verweist auf evals/packs/*.json;
 * der Job liest schlicht suite["cases"]. Bekaeme er das Manifest, faende er
 * NULL Faelle — und bildete daraus eine Note, ohne dass irgendwo ein Fehler
 * auftaucht.
 */
export async function starteMessung({
  client,
  e2,
  konfig,
  version,
  adapterPrefix,
  suite,
  suiteDatei,
  nurAdapter = false,
  maxMinuten = MESS_MAX_MINUTEN,
  jetzt = () => new Date(),
  warteUndStarte,
  log = () => {}
} = {}) {
  if (!client || !konfig) return { ok: false, gruende: ["salad_client_oder_konfig_fehlt"] };
  if (!version) return { ok: false, gruende: ["version_fehlt"] };
  if (!adapterPrefix) return { ok: false, gruende: ["adapter_fehlt"] };
  if (!Array.isArray(suite?.cases) || suite.cases.length === 0) {
    // Ohne Faelle misst der Job nichts und bildet trotzdem eine Note. Das ist
    // teurer als jeder Fehlschlag, weil es wie ein Ergebnis aussieht.
    return { ok: false, gruende: ["suite_ohne_faelle"] };
  }

  const jobId = neueMessJobId(version, jetzt);
  let verzeichnis = null;
  try {
    const suiten = baueSuitenVerzeichnis(suiteDatei, suite);
    verzeichnis = suiten.verzeichnis;
    const vor = await bereiteJobVor({
      client,
      konfig: { ...konfig, suitesDir: verzeichnis },
      e2,
      jobId,
      modus: MODUS_MESSUNG,
      parameter: jobParameter({ nurAdapter, version, adapterPrefix }),
      maxMinuten,
      log
    });
    if (!vor.ok) return { ok: false, gruende: vor.gruende || ["messjob_vorbereiten_fehlgeschlagen"] };

    const start = warteUndStarte ? await warteUndStarte(client) : await client.starte();
    if (!start?.ok) return { ok: false, gruende: [`messjob_start_fehlgeschlagen:${start?.status || "unbekannt"}`] };
    log(`[smejj-lora-loop] Mess-Job ${jobId} gestartet (${suite.cases.length} Faelle, Frist ${maxMinuten} min)`);
    return { ok: true, jobId, faelle: suite.cases.length };
  } catch (fehler) {
    return { ok: false, gruende: [`messjob_fehler:${String(fehler?.message || fehler).slice(0, 160)}`] };
  } finally {
    if (verzeichnis) rmSync(verzeichnis, { recursive: true, force: true });
  }
}

/**
 * Zustand eines Messlaufs — dieselbe Rangfolge wie beim Training: der
 * Herzschlag des Jobs ist die Wahrheit, der Gruppenzustand nur der Rahmen.
 */
export async function messungZustand({ client, e2, jobId } = {}) {
  if (!client || !e2 || !jobId) return { zustand: "unbekannt", fehler: "aufruf_unvollstaendig" };
  const status = await e2.getJson(`con/logs/jobs/${jobId}/status.json`, null).catch(() => null);
  const gruppe = await gruppenZustand(client).catch(() => ({ ok: false, zustand: "unbekannt" }));

  if (status?.fertig === true) {
    if (status.ok === true || status.phase === "fertig") return { zustand: "fertig" };
    return { zustand: "fehlgeschlagen", fehler: String(status.fehler || status.phase || "messjob_fehler").slice(0, 160) };
  }
  if (gruppe.ok && ["stopped", "failed"].includes(String(gruppe.zustand))) {
    return { zustand: "fehlgeschlagen", fehler: `gruppe_${gruppe.zustand}_ohne_abschluss` };
  }
  if (!gruppe.ok && !status) return { zustand: "unbekannt", fehler: `gruppe_status_${gruppe.status || "?"}` };
  return { zustand: "laeuft", phase: status?.phase || null, erledigt: status?.erledigt ?? null, von: status?.von ?? null };
}

/**
 * Benotet einen fertigen Messlauf und legt die Bewertung ab.
 *
 * Gibt die Kennzahlen in der Form zurueck, die cycle.js#istNeuerBester
 * erwartet: `punktzahl` als Anteil (0..1), `kritischeFehler` als Zahl.
 *
 * Die Basisnote wird MITGEFUEHRT, obwohl istNeuerBester sie nicht braucht.
 * Grund: die Platzvergabe (src/shared/smejjModellPlaetze.js) verlangt nicht
 * "besser als der letzte Versuch", sondern "besser als das Basismodell ohne
 * Adapter". Am 06.09. waren zwei Versionen der beste Stand IHRER Reihe und
 * lagen trotzdem 17 bis 21 Punkte unter der nackten Basis. Ohne die Basisnote
 * saehe man das nicht.
 */
export async function bewerteLauf({
  e2,
  jobId,
  version,
  adapterPrefix,
  suite,
  benote = benoteAntworten,
  jetzt = () => new Date()
} = {}) {
  if (!e2 || !jobId || !version || !suite) return { ok: false, gruende: ["bewertung_aufruf_unvollstaendig"] };

  const berichte = new Map();
  for (const stand of messStaende({ version, adapterPrefix })) {
    const antworten = await e2.getJson(`${EVAL_PREFIX}/${stand.version}/${jobId}/antworten.json`, null).catch(() => null);
    if (!antworten) return { ok: false, gruende: [`antworten_fehlen:${stand.version}`] };
    try {
      berichte.set(stand.version, await benote(suite, antworten, stand.version));
    } catch (fehler) {
      // Der 98-Prozent-Riegel wirft hier. Eine unvollstaendige Messung ergibt
      // KEINE niedrige Note, sondern gar keine — sonst wird ein Abbruch als
      // Urteil ueber das Modell abgelegt.
      return { ok: false, gruende: [`benotung_abgelehnt:${String(fehler?.message || fehler).slice(0, 200)}`] };
    }
  }

  const kandidat = berichte.get(version);
  const basis = berichte.get(BASIS_STAND);
  if (!kandidat) return { ok: false, gruende: ["kandidat_ohne_bericht"] };

  const kennzahlen = {
    punktzahl: kandidat.summary?.weightedScore ?? null,
    basisPunktzahl: basis?.summary?.weightedScore ?? null,
    kritischeFehler: kandidat.summary?.criticalFailures ?? null,
    faelle: kandidat.summary?.cases ?? null
  };
  // NICHT Number(...) zum Pruefen benutzen: Number(null) ist 0 und
  // Number.isFinite(0) ist true. Eine FEHLENDE Note ginge damit als 0 %
  // durch — und 0 % ist keine fehlende Messung, sondern ein vernichtendes
  // Urteil ueber ein Modell, das nie gemessen wurde.
  if (typeof kennzahlen.punktzahl !== "number" || !Number.isFinite(kennzahlen.punktzahl)) {
    return { ok: false, gruende: ["note_fehlt"] };
  }

  const training = await e2.getJson(`con/versions/${version}/training.json`, null).catch(() => null);
  const datensatz = {
    id: jobId,
    art: "smejj-bewertung",
    createdAt: jetzt().toISOString(),
    // "neu" heisst: noch nicht beurteilt. Die Beurteilung ist ein eigener
    // Schritt (Platzvergabe / Nr. 83) und gehoert nicht in die Messung.
    status: "neu",
    quelle: "autopilot",
    version,
    jobId,
    suite: kandidat.suite?.suiteId || null,
    suiteSha256: kandidat.suite?.integrity?.contentSha256 || null,
    kandidatNote: kennzahlen.punktzahl,
    basisNote: kennzahlen.basisPunktzahl,
    kritisch: kennzahlen.kritischeFehler,
    faelle: kennzahlen.faelle,
    wackelig: kandidat.summary?.wackelig ?? null,
    adapterPrefix: adapterPrefix || training?.adapterPrefix || null,
    trainingJobId: training?.jobId || null
  };
  await e2.putJson(`${BEWERTUNGEN_PREFIX}/${jobId}.json`, datensatz);
  return { ok: true, kennzahlen, bewertung: datensatz };
}

/**
 * Baut die `messe`-Funktion fuer cycle.js: starten, warten, benoten.
 *
 * Das Warten liegt hier und nicht in cycle.js, weil cycle.js nur den
 * TRAININGS-Lauf beobachtet. Fuer den Zyklus ist die Messung ein einziger
 * Schritt mit Ja/Nein-Ausgang — mit eigener Zeitgrenze, damit ein haengender
 * Messjob nicht den ganzen Autopiloten anhaelt.
 */
export function baueSaladJobMesser({
  client,
  e2,
  konfig,
  version,
  suite,
  suiteDatei,
  warteUndStarte,
  maxMinuten = MESS_MAX_MINUTEN,
  abfrageAbstandMs = 60_000,
  warte = (ms) => new Promise((f) => setTimeout(f, ms)),
  jetzt = () => new Date(),
  log = () => {}
} = {}) {
  return async function messe({ adapterSchluessel } = {}) {
    const start = await starteMessung({
      client, e2, konfig, version, adapterPrefix: adapterSchluessel, suite, suiteDatei,
      maxMinuten, warteUndStarte, jetzt, log
    });
    if (!start.ok) return { ok: false, gruende: start.gruende };

    const frist = jetzt().getTime() + maxMinuten * 60_000;
    let unbekanntInFolge = 0;
    for (;;) {
      if (jetzt().getTime() > frist) {
        log(`[smejj-lora-loop] Mess-Job ${start.jobId} ueber der Frist — Gruppe wird gestoppt.`);
        await client.stoppe().catch(() => null);
        return { ok: false, gruende: ["messung_zeitgrenze"] };
      }
      await warte(abfrageAbstandMs);
      const z = await messungZustand({ client, e2, jobId: start.jobId });
      if (z.zustand === "fertig") break;
      if (z.zustand === "fehlgeschlagen") return { ok: false, gruende: [`messung_${z.fehler || "fehlgeschlagen"}`] };
      if (z.zustand === "unbekannt") {
        // Dieselbe Toleranz wie beim Training: ein Aussetzer der Salad-Zugangs-
        // schicht ist kein Grund, eine bezahlte Messung wegzuwerfen.
        unbekanntInFolge += 1;
        if (unbekanntInFolge >= 16) return { ok: false, gruende: [`messung_zustand_unbekannt:${z.fehler || ""}`] };
        continue;
      }
      unbekanntInFolge = 0;
    }

    const bewertet = await bewerteLauf({ e2, jobId: start.jobId, version, adapterPrefix: adapterSchluessel, suite, jetzt });
    if (!bewertet.ok) return { ok: false, gruende: bewertet.gruende };
    log(`[smejj-lora-loop] Messung ${start.jobId}: ${(bewertet.kennzahlen.punktzahl * 100).toFixed(1)} %`
      + ` gegen Basis ${bewertet.kennzahlen.basisPunktzahl != null ? (bewertet.kennzahlen.basisPunktzahl * 100).toFixed(1) + " %" : "?"}`
      + `, kritisch ${bewertet.kennzahlen.kritischeFehler}`);
    return { ok: true, kennzahlen: bewertet.kennzahlen, bewertung: bewertet.bewertung };
  };
}

/** Nur fuer Tests: ein leeres Suiten-Verzeichnis, damit kein echtes gebaut wird. */
export function leeresSuitenVerzeichnis() {
  return mkdtempSync(path.join(os.tmpdir(), "smejj-messer-test-"));
}
