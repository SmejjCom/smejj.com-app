// muuny AI — DER Kreislauf (Single Responsibility: ein Takt = beobachten, entscheiden, hoechstens EINEN Job bewegen).
//
//   UEBERWACHEN -> FEHLER ANALYSIEREN -> SCHWAECHE ERKENNEN -> TRAININGSPLAN
//   -> DATEN PRUEFEN -> TRAINIEREN (Salad) -> BEWERTEN -> VERGLEICHEN
//   -> FREIGEBEN/VERWERFEN -> CANARY -> UEBERWACHEN ...
//
// Alles Bleibende liegt in e2 unter dem Lager-Prefix (siehe lager.js): Zustand,
// Aufgaben, Kosten, Register. Ein Neustart des Dienstes verliert nichts.
// Ein Neustart des Dienstes verliert nichts. Es laeuft nie mehr als ein
// Salad-Job zugleich — die einfachste Kostenbremse.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { bewerteAntworten, schwaechsteKategorie } from "./bewertung.js";
import { adapterAusTraining, entscheide, schreibeFreigabe } from "./entscheidung.js";
import { baueLernpaarDatensatz } from "./datensatz.js";
import { bucheEnde, bucheStart, darfStarten, leseGesamtverbrauch, leseMonatsverbrauch, leseTagesbuch, minutenFuer } from "./budget.js";
import { leseRegistry, naechsteVersion, promote, reject, schreibeRegistry, schwaechen, stabileVersion, trageKandidatEin, findeVersion, zusammenfassung } from "./registry.js";
import { bereiteJobVor, gruppenZustand } from "./salad.js";
import { befoerdereCanaryWennBewaehrt, rollbackWennNoetig, setzeCanary } from "./canary.js";
import { FAMILIE, L, wert } from "./lager.js";

export const ZUSTAND_KEY = L.zustand;
export const PHASEN = Object.freeze(["ueberwachen", "job_laeuft", "wartet_auf_paare", "warten_auf_daten", "gestoppt"]);

/**
 * Der Name, unter dem das UNTRAINIERTE Grundmodell gemessen wird.
 *
 * Es ist keine Version und bekommt nie eine Nummer. Seine Note ist der
 * Vergleichswert, gegen den jede trainierte Version antreten muss — nicht die
 * zuletzt befoerderte. Gemessen am 21.09.2026: das Grundmodell war nur auf der
 * alten, leichten Latte (46 Faelle) bewertet worden; ob muuny-1.3 auf der
 * heutigen Latte besser ist als das nackte Qwen, wusste niemand.
 */
export const GRUNDMODELL = "muuny-grundmodell";

/** Erst ab so vielen NEUEN echten Paaren lohnt ein Lauf. Darunter: kein GPU-Start. */
export const MIN_NEUE_PAARE_STANDARD = 500;
const NACHFRIST_MINUTEN = 20;

/**
 * Wie lange darf der Herzschlag eines laufenden Jobs schweigen?
 *
 * Die WAHRHEIT ueber einen Job ist sein eigener Herzschlag (status.json, jede
 * Minute), nicht die Meldung des GPU-Anbieters: "running" heisst dort nur
 * "Prozess gestartet". Ein Job, der haengt, bleibt bei Salad "running" und
 * verbrennt Miete. Schweigt der Herzschlag 20 Minuten, ist er tot.
 */
export const HERZSCHLAG_STILL_MINUTEN = 20;

export async function ladeSuiten(dir) {
  // "._name.json" sind KEINE Pruefsuiten, sondern AppleDouble-Beiwerk, das macOS beim
  // Packen mit tar danebenlegt. Sie enden auf .json, enthalten aber Binaerdaten mit
  // "Mac OS X" darin. Am 20.09.2026 landeten 34 davon im Abbild; der Kreislauf las
  // sie als Suite, warf bei JEDEM Takt "Unexpected token" und liess einen fertig
  // trainierten Kandidaten vier Stunden unbewertet liegen.
  const namen = (await readdir(dir)).filter((n) => n.endsWith(".json") && !n.startsWith("._")).sort();
  return Promise.all(namen.map(async (n) => {
    const roh = await readFile(path.join(dir, n), "utf8");
    try { return JSON.parse(roh); }
    // Eine kaputte Suite wird NICHT uebersprungen: sie ist Teil der Messlatte, und
    // ohne sie waere jede Note eine andere. Der Name gehoert aber in die Meldung —
    // "Unexpected token" allein sagt nicht, welche Datei gemeint ist.
    catch (fehler) { throw new Error(`Pruefsuite ${n} ist kein gueltiges JSON: ${fehler.message}`); }
  }));
}

export async function leseZustand(e2) {
  return (await e2.getJson(ZUSTAND_KEY, null)) || { phase: "ueberwachen", laufenderJob: null, historie: [], ticks: 0 };
}

export async function schreibeZustand(e2, z) {
  z.aktualisiert = new Date().toISOString();
  z.historie = (z.historie || []).slice(-60);
  await e2.putJson(ZUSTAND_KEY, z);
  return z;
}

function notiere(z, text, extra = {}) {
  z.historie.push({ zeit: new Date().toISOString(), text, ...extra });
}

export function neueTaskId(art) {
  return `${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${art}`;
}

export async function schreibeTask(e2, task) {
  task.aktualisiert = new Date().toISOString();
  await e2.putJson(`${L.tasks}/${task.id}.json`, task);
  const index = (await e2.getJson(L.taskIndex, null)) || { tasks: [] };
  const i = index.tasks.findIndex((t) => t.id === task.id);
  const kurz = { id: task.id, ziel: task.ziel, status: task.status, jobId: task.jobId || null, aktualisiert: task.aktualisiert, ergebnis: task.ergebnisKurz || null };
  if (i >= 0) index.tasks[i] = kurz; else index.tasks.push(kurz);
  index.tasks = index.tasks.slice(-200);
  await e2.putJson(L.taskIndex, index);
  return task;
}

/**
 * EIN Takt. Liefert eine kurze Zusammenfassung fuer Log und Dashboard.
 * @param {object} ctx  {konfig, e2, salad, log, jetzt}
 */
export async function tick(ctx) {
  const { konfig, e2, log = () => {}, jetzt = () => new Date() } = ctx;
  const z = await leseZustand(e2);
  z.ticks = (z.ticks || 0) + 1;
  z.letzterTick = jetzt().toISOString();
  // Der Zustand beschreibt sich selbst: eine Wache von aussen kann sonst nur ihre EIGENEN
  // Standardwerte vergleichen und meldet falsches Rot (gemessen 04.09.: Deckel 2 statt 10).
  z.grenzen = {
    tagesbudgetUsd: konfig.grenzen.tagesbudgetUsd,
    monatsdeckelUsd: konfig.grenzen.monatsdeckelUsd,
    gesamtdeckelUsd: konfig.grenzen.gesamtdeckelUsd,
    jobMaxMinuten: konfig.grenzen.jobMaxMinuten,
    freigabe: konfig.grenzen.freigabe,
    notaus: konfig.grenzen.notaus,
    prioritaet: konfig.salad?.prioritaet || null,
    taktMs: konfig.taktMs
  };
  z.naechsterTick = new Date(jetzt().getTime() + konfig.taktMs).toISOString();
  try {
    if (konfig.grenzen.notaus) {
      z.phase = "gestoppt";
      if (z.laufenderJob) await beendeJob(ctx, z, "notaus", null);
      notiere(z, "NOTAUS aktiv — nichts wird gestartet");
      return await schreibeZustand(e2, z);
    }
    if (z.laufenderJob) {
      await beobachteJob(ctx, z);
    } else {
      await planeUndStarte(ctx, z);
    }
  } catch (fehler) {
    z.letzterFehler = { zeit: jetzt().toISOString(), text: String(fehler?.message || fehler).slice(0, 400) };
    notiere(z, "Takt-Fehler: " + z.letzterFehler.text);
    log("Takt-Fehler", z.letzterFehler.text);
  }
  return schreibeZustand(e2, z);
}

async function beobachteJob(ctx, z) {
  const { e2, salad, jetzt = () => new Date(), log = () => {} } = ctx;
  const job = z.laufenderJob;
  const status = await e2.getJson(`${L.jobs}/${job.jobId}/status.json`, null);
  const ergebnis = await e2.getJson(`${L.jobs}/${job.jobId}/ergebnis.json`, null);
  const gruppe = salad ? await gruppenZustand(salad) : { ok: false, zustand: "kein_salad_client" };
  job.letzterStatus = status ? { phase: status.phase, aktualisiert: status.aktualisiert, laufzeitMinuten: status.laufzeitMinuten,
    fortschritt: status.erledigt != null ? `${status.erledigt}/${status.von}` : (status.fertigDateien != null ? `${status.fertigDateien}/${status.vonDateien} Dateien` : null),
    schritt: status.schritt || null, loss: status.loss ?? null } : null;
  job.gruppe = gruppe.zustand;
  const jetztMs = jetzt().getTime();
  // Der erste Herzschlag ist der echte Start. Die Zeit davor war Warten auf einen
  // Rechner — die zaehlt nicht gegen die Zeitgrenze des Jobs.
  if (status && !job.ersterHerzschlag) job.ersterHerzschlag = jetzt().toISOString();
  if (ergebnis) {
    log(`Job ${job.jobId} fertig: ok=${ergebnis.ok} grund=${ergebnis.grund || "-"}`);
    await beendeJob(ctx, z, ergebnis.ok ? "fertig" : `fehler:${ergebnis.grund || "unbekannt"}`, ergebnis);
    return;
  }
  const alterMin = (jetztMs - new Date(job.gestartet).getTime()) / 60_000;
  const laufMin = job.ersterHerzschlag ? (jetztMs - new Date(job.ersterHerzschlag).getTime()) / 60_000 : alterMin;
  if (laufMin > job.maxMinuten + NACHFRIST_MINUTEN) {
    await beendeJob(ctx, z, "zeitgrenze_ueberschritten_ohne_ergebnis", null);
    return;
  }
  const letzterSchlag = status?.aktualisiert ? new Date(status.aktualisiert).getTime() : null;
  if (letzterSchlag && (jetztMs - letzterSchlag) / 60_000 > HERZSCHLAG_STILL_MINUTEN) {
    // Salad mag "running" sagen — der Job selbst sagt seit 20 Minuten nichts mehr.
    await beendeJob(ctx, z, "herzschlag_verstummt", null);
    return;
  }
  if (gruppe.ok && (gruppe.zustand === "stopped" || gruppe.zustand === "failed") && alterMin > 10) {
    // Gruppe steht, aber kein Ergebnis: Knoten verloren oder Start gescheitert. Job gilt als abgebrochen; Zwischenstaende bleiben in e2.
    await beendeJob(ctx, z, `gruppe_${gruppe.zustand}_ohne_ergebnis`, null);
    return;
  }
  z.phase = "job_laeuft";
}

async function beendeJob(ctx, z, grund, ergebnis) {
  const { e2, salad, konfig, jetzt = () => new Date(), log = () => {} } = ctx;
  const job = z.laufenderJob;
  if (!job) return;
  // Aeussere Bremse: Gruppe stoppen, unabhaengig davon, ob der Job sich selbst gestoppt hat.
  if (salad) {
    const gz = await gruppenZustand(salad);
    if (gz.ok && gz.zustand !== "stopped" && gz.zustand !== "failed") {
      const s = await salad.stoppe();
      log(`Gruppe gestoppt (aussen): http ${s.status}`);
      job.aussenStop = s.status;
    }
  }
  const kosten = await bucheEnde(e2, { jobId: job.jobId, gestartet: job.gestartet, beendet: jetzt() });
  // Der Zykluszaehler steigt NUR, wenn wirklich trainiert wurde — ein Messlauf,
  // ein abgebrochener Start oder ein Lauf ohne neuen Schritt ist kein Zyklus.
  if (Number(ergebnis?.training?.neueSchritte) > 0) z.zyklen = (Number(z.zyklen) || 0) + 1;
  job.beendet = jetzt().toISOString();
  job.grund = grund;
  job.kosten = kosten;
  // Wiederholte Fehlschlaege derselben Art zaehlen. Ein Job, der immer wieder an
  // derselben Stelle stirbt, kostet bei jedem Versuch Miete und wird durch Wiederholen
  // nicht besser (04.09.: dreimal "CUDA out of memory" waeren 0,09 USD fuer nichts).
  const artDesFehlers = grund === "fertig" ? null : String(ergebnis?.fehler || grund).slice(0, 120);
  if (artDesFehlers) {
    const bisher = z.fehlschlaege && z.fehlschlaege.art === artDesFehlers ? z.fehlschlaege.anzahl : 0;
    z.fehlschlaege = { art: artDesFehlers, anzahl: bisher + 1, zuletzt: jetzt().toISOString(), jobId: job.jobId };
  } else {
    z.fehlschlaege = null;
  }
  const task = (await e2.getJson(`${L.tasks}/${job.taskId}.json`, null)) || { id: job.taskId, ziel: job.ziel, plan: [], status: "laeuft" };
  task.status = grund === "fertig" ? "fertig" : "fehlgeschlagen";
  task.fehler = grund === "fertig" ? null : grund;
  task.kosten = kosten;
  task.ergebnis = ergebnis || null;
  let bewertung = null;
  // Ein Job kann mehrere Staende gemessen haben (Fundament + Kandidat, EIN Modell-Ladevorgang).
  // Reihenfolge zaehlt: das Fundament wird zuerst bewertet, damit der Kandidat gegen die
  // frische Latte antritt und nicht gegen eine alte Note.
  const messungen = Array.isArray(ergebnis?.messungen) && ergebnis.messungen.length
    ? ergebnis.messungen
    : (ergebnis?.messung?.prefix ? [ergebnis.messung] : []);
  if (ergebnis?.ok && messungen.length) {
    const kurz = [];
    for (const m of messungen) {
      const teilJob = { ...job, version: m.version || job.version, adapterPrefix: m.adapterPrefix ?? job.adapterPrefix };
      bewertung = await bewerteUndEntscheide(ctx, z, teilJob, { ...ergebnis, messung: m });
      kurz.push(bewertung ? `${teilJob.version}: ${bewertung.gesamt} (${z.letzteEntscheidung?.entscheidung || "-"})` : `${teilJob.version}: ungueltig`);
    }
    task.ergebnisKurz = kurz.join(" · ");
  } else if (ergebnis?.ok && ergebnis.spiegel) {
    task.ergebnisKurz = `Spiegel komplett: ${ergebnis.spiegel.dateien} Dateien`;
  } else {
    // Gerettete Arbeit: Ein Trainingslauf, den die Zeitgrenze abgeschnitten hat, hinterlaesst
    // trotzdem einen fertigen Adapter in e2. Ohne Registereintrag findet ihn niemand wieder und
    // der naechste Takt bezahlt dasselbe Training noch einmal.
    const gerettet = await rettteAdapter(ctx, z, job);
    task.ergebnisKurz = gerettet ? `${grund} — Adapter ${gerettet} gerettet, wird gemessen` : grund;
  }
  task.naechsterSchritt = naechsterSchrittText(z);
  await schreibeTask(e2, task);
  notiere(z, `Job ${job.jobId} beendet: ${grund}`, { kostenUsd: kosten?.usd ?? null, jobId: job.jobId });
  z.letzterJob = job;
  z.laufenderJob = null;
  z.phase = "ueberwachen";
}

/**
 * Sucht nach einem Adapter, den ein abgebrochener Trainingslauf schon nach e2 gelegt hat,
 * und traegt ihn als Kandidaten ein. Der naechste Takt misst ihn dann nur noch.
 * @returns {Promise<string|null>} die Version des geretteten Kandidaten
 */
async function rettteAdapter(ctx, z, job) {
  const { e2, konfig, log = () => {} } = ctx;
  const kandidat = job?.kandidat;
  if (!kandidat) return null;
  const training = await e2.getJson(`${L.versionen}/${kandidat}/training.json`, null);
  if (!training) return null;
  // Ein Lauf, der keinen neuen Schritt gemacht hat, hat nichts trainiert. Seinen Adapter
  // zu retten hiesse, fremde Arbeit unter neuem Namen zu messen (05.09. live passiert).
  if (training.ungueltig || training.ohneNeueSchritte || training.neueSchritte === 0) {
    notiere(z, `Adapter ${kandidat} verworfen: der Lauf machte keine neuen Schritte`);
    log(`Adapter ${kandidat} nicht gerettet — null neue Schritte`);
    return null;
  }
  // NUR den Adapter DIESES Laufs retten. Am 04.09. sammelte diese Funktion den Adapter vom
  // Vortag auf, weil er unter derselben Nummer lag: der Autopilot trug verworfene Arbeit als
  // frischen Kandidaten ein und mass sie ein drittes Mal. Ein fremder Lauf wird ignoriert.
  if (training.jobId && job.jobId && training.jobId !== job.jobId) {
    notiere(z, `Adapter unter ${kandidat} stammt aus Job ${training.jobId}, nicht aus ${job.jobId} — nicht gerettet`);
    log(`Adapter ${kandidat} gehoert zu einem fremden Lauf (${training.jobId}) — ignoriert`);
    return null;
  }
  const adapterPrefix = `${L.versionen}/${kandidat}/adapter`;
  const dateien = await e2.liste(`${adapterPrefix}/`);
  const hatGewichte = dateien.some((d) => /adapter_model\.(safetensors|bin)$/.test(d.key));
  if (!hatGewichte) return null;
  const registry = await leseRegistry(e2);
  trageKandidatEin(registry, {
    version: kandidat, basisPrefix: konfig.basis.prefix, basisRepo: konfig.basis.repo,
    adapterPrefix, datensatz: job.datensatz || training.datensatzPrefix || null,
    trainingsKonfig: job.trainingsKonfig || training.konfig || null,
    kostenUsd: job.kosten?.usd ?? null, jobId: job.jobId, training,
    hinweis: "Training an der Zeitgrenze abgebrochen — Adapter vollstaendig, Messung steht aus"
  });
  await schreibeRegistry(e2, registry);
  notiere(z, `Adapter ${kandidat} aus abgebrochenem Training gerettet (${dateien.length} Dateien) — wird gemessen`);
  log(`Adapter ${kandidat} gerettet, Messung folgt`);
  return kandidat;
}

async function bewerteUndEntscheide(ctx, z, job, ergebnis) {
  const { e2, konfig, log = () => {} } = ctx;
  const antworten = await e2.getJson(`${ergebnis.messung.prefix}/antworten.json`, null);
  if (!antworten) { notiere(z, "antworten.json fehlt — keine Bewertung"); return null; }
  const suiten = await ladeSuiten(konfig.suitesDir);
  const bewertung = bewerteAntworten(antworten, suiten);
  await e2.putJson(`${ergebnis.messung.prefix}/bewertung.json`, bewertung);
  if (!bewertung.gueltig) {
    // Messfehler: kein Registereintrag, keine Entscheidung. Der naechste Takt plant die Messung erneut.
    z.letzteEntscheidung = { version: job.version, entscheidung: "MESSUNG_UNGUELTIG", gruende: [bewertung.ungueltigGrund], zeit: new Date().toISOString(), gegen: null };
    notiere(z, `Messung ${job.version} UNGUELTIG (${bewertung.ungueltigGrund}) — kein Registereintrag`);
    log(`Messung ${job.version} ungueltig: ${bewertung.ungueltigGrund}`);
    return bewertung;
  }
  // Das Grundmodell ist KEINE Version: seine Note wird als Vergleichswert abgelegt,
  // nie ins Register eingetragen und nie befoerdert oder verworfen.
  if (job.version === GRUNDMODELL) {
    const messung = {
      schemaVersion: 1, modell: konfig.basis.repo, basisPrefix: konfig.basis.prefix,
      punktzahl: bewertung.gesamt, kritisch: bewertung.kritisch, kategorien: bewertung.kategorien,
      faelle: bewertung.faelle, suitenStand: bewertung.suitenStand || await suitenStand(konfig.suitesDir),
      jobId: job.jobId, evalPrefix: ergebnis.messung.prefix, am: new Date().toISOString()
    };
    await e2.putJson(L.grundmodell, messung);
    z.letzteEntscheidung = { version: GRUNDMODELL, entscheidung: "GRUNDMODELL_GEMESSEN",
      gruende: [`punktzahl ${messung.punktzahl}`, `kritisch ${messung.kritisch}`], zeit: messung.am, gegen: null };
    notiere(z, `Grundmodell gemessen: ${messung.punktzahl} (kritisch ${messung.kritisch}) — das ist ab jetzt der Vergleichswert`);
    log(`Grundmodell gemessen: ${messung.punktzahl}`);
    return bewertung;
  }
  const registry = await leseRegistry(e2);
  const stabil = stabileVersion(registry);
  const version = job.version;
  const eintrag = trageKandidatEin(registry, { version, basisPrefix: konfig.basis.prefix, basisRepo: konfig.basis.repo,
    adapterPrefix: job.adapterPrefix || null, datensatz: job.datensatz || null, trainingsKonfig: job.trainingsKonfig || null,
    hardware: ergebnis.gpu || null, kostenUsd: job.kosten?.usd ?? null, jobId: job.jobId, evalPrefix: ergebnis.messung.prefix,
    training: ergebnis.training || null });
  if (stabil && stabil.version === version) {
    // Erneute Messung der stabilen Version (Regressionslauf): nur Kennzahlen nachtragen.
    eintrag.status = "stable";
    // WICHTIG: dieselbe Zusammenfassung wie beim Befoerdern — sie traegt den suitenStand.
    // Ohne ihn haelt planeNaechstenSchritt die Latte weiter fuer veraltet und misst
    // dieselbe Version endlos neu (am 04.09. live passiert, 0,16 USD je Runde).
    eintrag.benchmarks = zusammenfassung(bewertung);
    eintrag.bekannteSchwaechen = schwaechen(bewertung);
    z.letzteEntscheidung = { version, entscheidung: "REGRESSIONSLAUF", gruende: ["stabile_version_erneut_gemessen"], zeit: new Date().toISOString() };
  } else {
    // Die Regel vom 21.09.2026: gegen den BESTWERT aus Grundmodell und stabiler
    // Version, beide auf derselben Latte. Ohne gemessenes Grundmodell nie befoerdern.
    const grundmodell = await e2.getJson(L.grundmodell, null);
    const rausch = Number(wert(process.env, "RAUSCHSCHWELLE"));
    const urteil = entscheide(bewertung, { grundmodell,
      stabil: stabil?.benchmarks ? { ...stabil.benchmarks, version: stabil.version } : null,
      ...(rausch > 0 && rausch < 0.2 ? { rauschschwelle: rausch } : {}) });
    if (urteil.entscheidung === "PROMOTE") {
      promote(registry, version, urteil, bewertung);
      await setzeCanary(e2, registry, version);
      // Die Laufzeit liest die Freigabe-Datei. Sie wird NUR mit vollstaendiger
      // Adapterangabe geschrieben; sonst bleibt die Laufzeit beim alten Stand und
      // der Grund steht sichtbar im Zustand.
      const training = ergebnis.training || await e2.getJson(`${L.versionen}/${version}/training.json`, null);
      const f = await schreibeFreigabe(e2, { modell: konfig.basis.repo, version, punktzahl: bewertung.gesamt,
        adapter: adapterAusTraining(training) });
      z.freigabe = f.geschrieben ? { version, am: f.freigabe.am } : { version, fehlt: f.grund };
      notiere(z, f.geschrieben ? `Freigabe ${version} geschrieben — die Laufzeit laedt sie` : `Freigabe ${version} NICHT geschrieben: ${f.grund}`);
    } else reject(registry, version, urteil, bewertung);
    z.letzteEntscheidung = { version, ...urteil, zeit: new Date().toISOString(), gegen: stabil?.version || null };
    log(`Entscheidung ${version}: ${urteil.entscheidung} (${urteil.gruende.join(", ")})`);
  }
  await schreibeRegistry(e2, registry);
  z.schwaechste = schwaechsteKategorie(bewertung);
  notiere(z, `Bewertung ${version}: gesamt ${bewertung.gesamt}, kritisch ${bewertung.kritisch}, Entscheidung ${z.letzteEntscheidung.entscheidung}`);
  return bewertung;
}

/** Plant den naechsten Schritt und startet hoechstens EINEN Job. */
export const FEHLSCHLAG_GRENZE = 3;

async function planeUndStarte(ctx, z) {
  const { e2, konfig, log = () => {} } = ctx;
  // Notbremse gegen die Wiederholungsschleife: dreimal derselbe Fehler heisst, dass
  // Wiederholen nicht hilft. Der Kreislauf haelt an und nennt den Grund, statt Miete
  // zu verbrennen. Ein neuer Stand (Deploy) oder ein Eingriff loest die Bremse.
  if (z.fehlschlaege && z.fehlschlaege.anzahl >= FEHLSCHLAG_GRENZE) {
    z.phase = "gestoppt";
    z.plan = { schritt: "angehalten", grund: `${z.fehlschlaege.anzahl}-mal derselbe Fehler: ${z.fehlschlaege.art}` };
    if (!z.fehlschlaege.gemeldet) {
      notiere(z, `ANGEHALTEN nach ${z.fehlschlaege.anzahl} gleichen Fehlschlaegen: ${z.fehlschlaege.art}`);
      log(`ANGEHALTEN: ${z.fehlschlaege.art}`);
      z.fehlschlaege.gemeldet = true;
    }
    return;
  }
  const registry = await leseRegistry(e2);
  const stabil = stabileVersion(registry);
  // Reihenfolge ist Absicht: erst pruefen, ob etwas ZURUECK muss, dann erst, ob etwas
  // nach vorn darf. Andersherum koennte eine Version in derselben Sekunde befoerdert
  // werden, in der ihre Betriebsdaten schon den Rollback verlangen.
  await rollbackWennNoetig(ctx, z, registry);
  z.alias = await befoerdereCanaryWennBewaehrt(ctx, z).then((r) => r.befoerdert ? `befoerdert ${r.von} -> ${r.nach}` : r.grund);
  const plan = await planeNaechstenSchritt(ctx, z, registry);
  z.plan = plan;
  let runde = null;
  if (plan.schritt === "tor_offen") {
    const stand = await e2.getJson(L.paarStand, { paare: 0, runde: 0 });
    runde = (Number(stand?.runde) || 0) + 1;
    const suiten = await ladeSuiten(konfig.suitesDir);
    const ds = await baueLernpaarDatensatz(e2, { suiten, runde });
    if (!ds.ok) {
      // Fail-closed: kein Datensatz, kein Training — mit Grund, nicht still.
      z.phase = "gestoppt";
      z.plan = { ...plan, grund: `Tor offen, aber Datensatz nicht gebaut: ${ds.grund}` };
      notiere(z, z.plan.grund);
      return;
    }
    plan.job = planeTraining({ konfig, registry, stabil, datensatz: ds,
      faelle: suiten.reduce((n, x) => n + (x.cases || []).length, 0) });
    plan.datensatz = ds;
    notiere(z, `Datensatz ${ds.name}: ${ds.paare} Paare (sha256 ${ds.sha256.slice(0, 12)})`);
  }
  if (!plan.job) {
    z.phase = plan.phase || "warten_auf_daten";
    // Erzeugte Trainingsdaten gibt es seit dem 21.09.2026 nicht mehr (Owner-Auftrag,
    // Eiserne Regel 3). Fehlen Paare, wird gewartet — nicht erfunden.
    // Es steht gar kein Start an, also kann auch nichts blockiert sein. Ohne
    // dieses Loeschen bliebe eine alte Startsperre fuer immer stehen und die
    // Betreiber-Wache meldete rot, obwohl nichts klemmt (Falschrot).
    delete z.startBlockiert;
    return;
  }
  const gestartet = await starteJob(ctx, z, plan.job);
  if (!gestartet.ok) {
    z.phase = "ueberwachen";
    z.startBlockiert = { zeit: new Date().toISOString(), gruende: gestartet.gruende };
    notiere(z, "Start blockiert: " + gestartet.gruende.join("; "));
    return;
  }
  // Erst NACH einem geglueckten Start gilt die Runde als verbraucht. Scheitert der
  // Start (Budget, Salad), bleiben die Paare neu und die naechste Gelegenheit nutzt sie.
  if (runde && plan.datensatz) {
    await e2.putJson(L.paarStand, { paare: plan.tor.jetzt, datensatz: plan.datensatz.name, runde, am: new Date().toISOString() });
    z.laufenderJob.runde = runde;
  }
  // Geglueckter Start hebt die Sperrmeldung auf. Die meisten Startgruende sind
  // voruebergehend (verwaister Container, Anbieter kurz weg) — sie duerfen die
  // Ampel nicht ueber den naechsten geglueckten Lauf hinaus rot faerben.
  delete z.startBlockiert;
}

/** Aktueller Stand der Pruefsuiten aus git: {suiteId: contentSha256}. */
export async function suitenStand(suitesDir) {
  const suiten = await ladeSuiten(suitesDir);
  return Object.fromEntries(suiten.map((s) => [s.suiteId, s.integrity?.contentSha256 || null]));
}

/** Welche Suiten haben sich seit dieser Note geaendert (oder sind neu)? */
export function abweichendeSuiten(gemessenerStand, aktuellerStand) {
  if (!gemessenerStand) return Object.keys(aktuellerStand);
  return Object.keys(aktuellerStand).filter((id) => gemessenerStand[id] !== aktuellerStand[id]);
}

/**
 * Kennung eines Trainingsversuchs: nur die Felder, die das ERGEBNIS bestimmen.
 *
 * Die gespeicherte Konfiguration einer Version traegt auch Laufzeitwerte —
 * restMinuten kommt vom Rechenknoten, messReserveMinuten aus der Zahl der
 * Pruefaelle, checkpointMinuten aus der Sicherungshaeufigkeit. Vergleicht man
 * die ganze Konfiguration, unterscheiden sich zwei identische Versuche schon an
 * der zweiten Nachkommastelle von restMinuten, und die Wiederholungssperre
 * greift nie. Genau das passierte am 06.09.: con-1.6 war auf v4 abgelehnt, und
 * der Planer wollte sofort con-1.7 mit demselben Datensatz und derselben
 * Konfiguration starten.
 */
export const KONFIG_FELDER = Object.freeze(["r", "alpha", "lr", "epochen", "maxLen", "batch", "gradAkk", "maxZeilen"]);

export function trainingsKennung(konfig) {
  if (!konfig || typeof konfig !== "object") return "";
  return JSON.stringify(KONFIG_FELDER.map((f) => [f, konfig[f] ?? null]));
}

/** Die Trainingskonfiguration aus der Umgebung — an EINER Stelle, damit Plan und Sperre dieselbe sehen. */
export function trainingsKonfigAusUmgebung(env = process.env) {
  return JSON.parse(wert(env, "TRAIN_KONFIG") || '{"r":16,"alpha":32,"lr":0.0001,"epochen":1,"maxLen":1024,"checkpointMinuten":15,"batch":1,"gradAkk":8,"maxZeilen":700}');
}

/**
 * Wie viele Minuten muss der Trainingsjob fuer die anschliessende Messung
 * zuruecklegen?
 *
 * Der feste Wert 35 stammt aus der Zeit mit 46 Pruefaellen. Seit dem 06.09. sind
 * es 102, und die Antwortzeit je Fall schwankt mit der zugeteilten Karte um mehr
 * als das Doppelte (gemessen am 05.09.: 7,6 s, 11,5 s, 15,2 s und 19,1 s im
 * Mittel). Ein zu kleines Polster laesst das Training die Zeit aufbrauchen, die
 * Messung wird abgeschnitten und der ganze Lauf ist umsonst — rund drei Stunden
 * und 0,37 USD ohne jedes Ergebnis.
 *
 * Gerechnet wird mit der langsamsten bisher gemessenen Karte, nicht mit dem
 * Mittel: die Karte wird zugelost, und ein Polster, das nur im Glücksfall
 * reicht, ist kein Polster. Dazu kommt ein Zuschlag, weil die Messung in einem
 * eigenen Prozess laeuft und das Modell dafuer neu laedt.
 */
export const MESS_LATENZ_SCHLECHTESTE_MS = 20_000;
export const MESS_NEULADEN_MINUTEN = 15;

export function messReserveMinuten({ faelle, wiederholungen = 1, jobMaxMinuten = 220 }) {
  const antworten = Math.max(1, faelle) * Math.max(1, wiederholungen);
  const minuten = (antworten * MESS_LATENZ_SCHLECHTESTE_MS) / 60_000 + MESS_NEULADEN_MINUTEN;
  // Nie weniger als der alte Festwert, und nie mehr als die Haelfte des Jobs —
  // sonst bliebe fuer das Training nichts uebrig und der Lauf waere sinnlos.
  return Math.min(Math.round(minuten), Math.floor(jobMaxMinuten / 2), 200) || 35;
}

export async function planeNaechstenSchritt(ctx, z, registry) {
  const { e2, konfig } = ctx;
  const stabil = stabileVersion(registry);
  const basisManifest = await e2.getJson(`${konfig.basis.prefix}/manifest.json`, null);
  const basisKomplett = Boolean(basisManifest?.komplett);
  // 1. Keine stabile Version: Messlatte con-1.0.0 setzen (Basismodell unveraendert).
  if (!stabil) {
    const version = `${FAMILIE}-1.0`;
    const vorhanden = findeVersion(registry, version);
    if (vorhanden?.status === "rejected") return { phase: "gestoppt", grund: `${version} wurde verworfen — Betreiber-Entscheidung noetig` };
    return { schritt: "messlatte", job: { modus: basisKomplett ? "messung" : "spiegel+messung", version, ziel: `Messlatte ${version} (Basis ${konfig.basis.repo}${basisKomplett ? "" : ", erst spiegeln"})`,
      parameter: { MUUNY_VERSION: version, MUUNY_WIEDERHOLUNGEN: konfig.wiederholungen } } };
  }
  // 1b. Latte hat sich geaendert: die stabile Version zuerst neu messen. Ein Kandidat gegen eine
  // Note zu halten, die mit einer anderen Suite entstanden ist, waere ein unfairer Vergleich.
  const aktuell = await suitenStand(konfig.suitesDir);
  // 0. Der Vergleichswert. Ohne eine Note des UNTRAINIERTEN Grundmodells auf der
  //    heutigen Latte wird nichts trainiert und nichts befoerdert.
  const grund = await e2.getJson(L.grundmodell, null);
  if (!grund || abweichendeSuiten(grund.suitenStand, aktuell).length) {
    return { schritt: "grundmodell_messen", job: { modus: "messung", version: GRUNDMODELL, adapterPrefix: null,
      staende: [{ version: GRUNDMODELL, adapterPrefix: null }],
      ziel: `Grundmodell ${konfig.basis.repo} ohne Adapter messen — der Vergleichswert fuer jede Version`,
      parameter: { MUUNY_VERSION: GRUNDMODELL, MUUNY_MESS_VERSIONEN: JSON.stringify([{ version: GRUNDMODELL, adapterPrefix: null }]),
        MUUNY_WIEDERHOLUNGEN: konfig.wiederholungen } } };
  }
  const veraendert = abweichendeSuiten(stabil.benchmarks?.suitenStand, aktuell);
  const kandidat = registry.versions.find((v) => v.status === "candidate" && v.adapterPrefix && !v.benchmarks);
  // Beides faellig? Dann in EINEM Job. Das 55-GB-Fundament wird einmal geholt statt zweimal;
  // gemessen 04.09.: ein zusaetzlicher Job kostet 16 Minuten Ladezeit und die halbe Jobmiete.
  const staende = [];
  if (veraendert.length) staende.push({ version: stabil.version, adapterPrefix: stabil.adapterPrefix || null });
  if (kandidat) staende.push({ version: kandidat.version, adapterPrefix: kandidat.adapterPrefix });
  if (staende.length) {
    const ziel = staende.length > 1
      ? `Fundament ${stabil.version} und Kandidat ${kandidat.version} in einem Lauf messen (Latte geaendert: ${veraendert.join(", ")})`
      : (veraendert.length ? `Stabile Version ${stabil.version} mit geaenderter Latte neu messen (${veraendert.join(", ")})` : `Kandidat ${kandidat.version} messen`);
    return { schritt: staende.length > 1 ? "latte_und_kandidat" : (veraendert.length ? "latte_neu_messen" : "kandidat_messen"),
      job: { modus: "messung", version: staende[0].version, adapterPrefix: staende[0].adapterPrefix, staende, ziel,
        parameter: { MUUNY_VERSION: staende[0].version, MUUNY_MESS_VERSIONEN: JSON.stringify(staende),
          ...(staende[0].adapterPrefix ? { MUUNY_ADAPTER_PREFIX: staende[0].adapterPrefix } : {}),
          MUUNY_WIEDERHOLUNGEN: konfig.wiederholungen } } };
  }
  // 3. Das Tor. Trainiert wird nur mit ECHTEN neuen Lernpaaren, und erst ab
  //    MUUNY_MIN_NEUE_PAARE (Standard 500). Erzeugte Beispiele gibt es nicht mehr:
  //    muuny-1.4 bis 1.11 sind alle auf erzeugten Aufgaben trainiert und alle
  //    schlechter als 1.3 (Loss gegen null — auswendig gelernt).
  const tor = await pruefeTor(e2);
  if (!tor.offen) {
    return { schritt: "tor", phase: "wartet_auf_paare", tor, grund: tor.grund };
  }
  // Das Tor ist offen. Den Datensatz baut planeUndStarte — der Planer selbst
  // schreibt nichts, damit "plan" (cli) nie etwas veraendert.
  return { schritt: "tor_offen", phase: "ueberwachen", tor, grund: `Tor offen: ${tor.neu} neue Paare` };
}

/**
 * Der Trainingsjob einer Runde. Die Nummer beginnt HINTER der letzten vergebenen
 * (heute: muuny-1.12) — eine vergebene Nummer wird nie ueberschrieben.
 */
export function planeTraining({ konfig, registry, stabil, datensatz, faelle }) {
  const version = naechsteVersion(stabil, { basisPrefix: konfig.basis.prefix, vergeben: registry.versions.map((v) => v.version) });
  const trainKonfig = trainingsKonfigAusUmgebung();
  trainKonfig.messReserveMinuten = messReserveMinuten({ faelle, wiederholungen: konfig.wiederholungen,
    jobMaxMinuten: konfig.grenzen?.jobMaxMinuten || 220 });
  return { modus: "training+messung", version, kandidat: version, datensatz: datensatz.name, trainingsKonfig: trainKonfig,
    ziel: `Training ${version} mit ${datensatz.paare} echten Lernpaaren (${datensatz.name})`,
    parameter: { MUUNY_VERSION: stabil?.version || GRUNDMODELL, MUUNY_KANDIDAT: version, MUUNY_DATENSATZ_PREFIX: datensatz.prefix,
      MUUNY_TRAIN_KONFIG: JSON.stringify(trainKonfig), MUUNY_WIEDERHOLUNGEN: konfig.wiederholungen } };
}

/**
 * Zaehlt die echten Lernpaare und vergleicht mit dem Stand der letzten Runde.
 * Fail-closed: ist die Ablage oder der Stand nicht lesbar, bleibt das Tor ZU.
 */
export async function pruefeTor(e2, { env = process.env } = {}) {
  const min = Number(wert(env, "MIN_NEUE_PAARE")) > 0 ? Number(wert(env, "MIN_NEUE_PAARE")) : MIN_NEUE_PAARE_STANDARD;
  let jetzt;
  try {
    jetzt = (await e2.liste(`${L.paare}/`)).filter((o) => o.key.endsWith(".json")).length;
  } catch (fehler) {
    return { offen: false, jetzt: null, neu: null, min, grund: `Ablage der Lernpaare nicht lesbar — kein Training (${String(fehler?.message || fehler).slice(0, 80)})` };
  }
  let stand;
  try {
    stand = await e2.getJson(L.paarStand, { paare: 0, datensatz: null, am: null });
  } catch {
    return { offen: false, jetzt, neu: null, min, grund: "Stand der letzten Runde nicht lesbar — kein Training" };
  }
  const bisher = Number(stand?.paare) >= 0 ? Number(stand.paare) : 0;
  const neu = Math.max(0, jetzt - bisher);
  return { offen: neu >= min, jetzt, bisher, neu, min,
    grund: neu >= min ? null : `wartet: ${neu} von ${min} neuen Paaren (${jetzt} gesamt)` };
}

async function starteJob(ctx, z, jobPlan) {
  const { e2, konfig, salad, log = () => {}, jetzt = () => new Date() } = ctx;
  if (!salad) return { ok: false, gruende: ["kein_salad_client"] };
  const tagesbuch = await leseTagesbuch(e2, jetzt());
  const gesamt = await leseGesamtverbrauch(e2);
  let monat = null;
  try { monat = await leseMonatsverbrauch(e2, jetzt()); } catch { monat = null; } // -> darfStarten sagt nein
  // Nur so viel Zeit reservieren, wie diese Betriebsart wirklich braucht.
  const minuten = minutenFuer(jobPlan.modus, konfig.grenzen);
  const pruefung = darfStarten({ grenzen: konfig.grenzen, tagesbuch, gesamt, monat, gpuKlassen: konfig.salad.gpuKlassen, prioritaet: konfig.salad.prioritaet, minuten });
  if (!pruefung.ok) return { ok: false, gruende: pruefung.gruende };
  const jobId = `${FAMILIE}-${jetzt().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${jobPlan.modus.replace(/[^a-z]/g, "")}`;
  const taskId = neueTaskId(jobPlan.modus.replace(/[^a-z]/g, ""));
  const task = { id: taskId, ziel: jobPlan.ziel, plan: ["Salad-Gruppe vorbereiten", `Job ${jobPlan.modus} starten (max ${minuten} min, Deckel ${pruefung.geplantUsd} USD)`, "Herzschlag beobachten", "Ergebnis bewerten", "Entscheidung ins Register"],
    status: "laeuft", jobId, abhaengigkeiten: ["e2", "salad"], werkzeuge: ["salad-job", "bewertung.js", "registry.js"], gestartet: jetzt().toISOString(), version: jobPlan.version };
  await schreibeTask(e2, task);
  const vorbereitung = await bereiteJobVor({ client: salad, konfig, e2: konfig.e2, jobId, modus: jobPlan.modus, parameter: jobPlan.parameter, maxMinuten: minuten - 10, log });
  if (!vorbereitung.ok) { task.status = "fehlgeschlagen"; task.fehler = vorbereitung.gruende.join("; "); await schreibeTask(e2, task); return { ok: false, gruende: vorbereitung.gruende }; }
  await bucheStart(e2, { jobId, gpuKlassen: konfig.salad.gpuKlassen, prioritaet: konfig.salad.prioritaet, minuten });
  const start = await salad.starte();
  if (!start.ok) {
    await bucheEnde(e2, { jobId, gestartet: jetzt().toISOString(), beendet: new Date(jetzt().getTime() + 60_000) });
    task.status = "fehlgeschlagen"; task.fehler = `salad_start_${start.status}`; await schreibeTask(e2, task);
    return { ok: false, gruende: [`salad_start_${start.status}:${JSON.stringify(start.daten).slice(0, 160)}`] };
  }
  z.laufenderJob = { jobId, taskId, modus: jobPlan.modus, version: jobPlan.version, kandidat: jobPlan.kandidat || null, adapterPrefix: jobPlan.adapterPrefix || null,
    datensatz: jobPlan.datensatz || null, trainingsKonfig: jobPlan.trainingsKonfig || null, ziel: jobPlan.ziel, gestartet: jetzt().toISOString(), maxMinuten: minuten,
    geplantUsd: pruefung.geplantUsd, buendelSha256: vorbereitung.buendelSha256 };
  z.phase = "job_laeuft";
  notiere(z, `Job ${jobId} gestartet: ${jobPlan.ziel} (max ${minuten} min, ≤ ${pruefung.geplantUsd} USD)`, { jobId });
  log(`Job ${jobId} gestartet`);
  return { ok: true, jobId };
}

export function naechsterSchrittText(z) {
  if (z.laufenderJob) return `Job ${z.laufenderJob.jobId} beobachten`;
  if (z.plan?.job) return z.plan.job.ziel;
  if (z.plan?.grund) return z.plan.grund;
  return "naechster Takt plant";
}
