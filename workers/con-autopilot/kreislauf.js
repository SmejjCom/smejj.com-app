// con-Autopilot — DER Kreislauf (Single Responsibility: ein Takt = beobachten, entscheiden, hoechstens EINEN Job bewegen).
//
//   UEBERWACHEN -> FEHLER ANALYSIEREN -> SCHWAECHE ERKENNEN -> TRAININGSPLAN
//   -> DATEN PRUEFEN -> TRAINIEREN (Salad) -> BEWERTEN -> VERGLEICHEN
//   -> FREIGEBEN/VERWERFEN -> CANARY -> UEBERWACHEN ...
//
// Alles Bleibende liegt in e2: Zustand (con/autopilot/zustand.json), Aufgaben
// (con/logs/tasks/), Kosten (con/logs/kosten/), Register (con/registry.json).
// Ein Neustart des Dienstes verliert nichts. Es laeuft nie mehr als ein
// Salad-Job zugleich — die einfachste Kostenbremse.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { bewerteAntworten, schwaechsteKategorie, vergleiche } from "./bewertung.js";
import { bucheEnde, bucheStart, darfStarten, leseGesamtverbrauch, leseTagesbuch, minutenFuer } from "./budget.js";
import { leseRegistry, naechsteVersion, promote, reject, schreibeRegistry, stabileVersion, trageKandidatEin, findeVersion } from "./registry.js";
import { bereiteJobVor, gruppenZustand } from "./salad.js";
import { rollbackWennNoetig, setzeCanary } from "./canary.js";

export const ZUSTAND_KEY = "con/autopilot/zustand.json";
export const PHASEN = Object.freeze(["ueberwachen", "job_laeuft", "warten_auf_daten", "gestoppt"]);
const NACHFRIST_MINUTEN = 20;

export async function ladeSuiten(dir) {
  const namen = (await readdir(dir)).filter((n) => n.endsWith(".json")).sort();
  return Promise.all(namen.map(async (n) => JSON.parse(await readFile(path.join(dir, n), "utf8"))));
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
  await e2.putJson(`con/logs/tasks/${task.id}.json`, task);
  const index = (await e2.getJson("con/logs/tasks/index.json", null)) || { tasks: [] };
  const i = index.tasks.findIndex((t) => t.id === task.id);
  const kurz = { id: task.id, ziel: task.ziel, status: task.status, jobId: task.jobId || null, aktualisiert: task.aktualisiert, ergebnis: task.ergebnisKurz || null };
  if (i >= 0) index.tasks[i] = kurz; else index.tasks.push(kurz);
  index.tasks = index.tasks.slice(-200);
  await e2.putJson("con/logs/tasks/index.json", index);
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
  const status = await e2.getJson(`con/logs/jobs/${job.jobId}/status.json`, null);
  const ergebnis = await e2.getJson(`con/logs/jobs/${job.jobId}/ergebnis.json`, null);
  const gruppe = salad ? await gruppenZustand(salad) : { ok: false, zustand: "kein_salad_client" };
  job.letzterStatus = status ? { phase: status.phase, aktualisiert: status.aktualisiert, laufzeitMinuten: status.laufzeitMinuten,
    fortschritt: status.erledigt != null ? `${status.erledigt}/${status.von}` : (status.fertigDateien != null ? `${status.fertigDateien}/${status.vonDateien} Dateien` : null),
    schritt: status.schritt || null, loss: status.loss ?? null } : null;
  job.gruppe = gruppe.zustand;
  if (ergebnis) {
    log(`Job ${job.jobId} fertig: ok=${ergebnis.ok} grund=${ergebnis.grund || "-"}`);
    await beendeJob(ctx, z, ergebnis.ok ? "fertig" : `fehler:${ergebnis.grund || "unbekannt"}`, ergebnis);
    return;
  }
  const alterMin = (jetzt().getTime() - new Date(job.gestartet).getTime()) / 60_000;
  if (alterMin > job.maxMinuten + NACHFRIST_MINUTEN) {
    await beendeJob(ctx, z, "zeitgrenze_ueberschritten_ohne_ergebnis", null);
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
  job.beendet = jetzt().toISOString();
  job.grund = grund;
  job.kosten = kosten;
  const task = (await e2.getJson(`con/logs/tasks/${job.taskId}.json`, null)) || { id: job.taskId, ziel: job.ziel, plan: [], status: "laeuft" };
  task.status = grund === "fertig" ? "fertig" : "fehlgeschlagen";
  task.fehler = grund === "fertig" ? null : grund;
  task.kosten = kosten;
  task.ergebnis = ergebnis || null;
  let bewertung = null;
  if (ergebnis?.ok && ergebnis.messung?.prefix) {
    bewertung = await bewerteUndEntscheide(ctx, z, job, ergebnis);
    task.ergebnisKurz = bewertung ? `gesamt ${bewertung.gesamt} · kritisch ${bewertung.kritisch} · ${z.letzteEntscheidung?.entscheidung || "-"}` : null;
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
  const training = await e2.getJson(`con/versions/${kandidat}/training.json`, null);
  if (!training) return null;
  const adapterPrefix = `con/versions/${kandidat}/adapter`;
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
    eintrag.benchmarks = { gesamt: bewertung.gesamt, kritisch: bewertung.kritisch, faelle: bewertung.faelle, kategorien: bewertung.kategorien, leistung: bewertung.leistung, jobId: job.jobId, bewertetAm: bewertung.bewertetAm };
    z.letzteEntscheidung = { version, entscheidung: "REGRESSIONSLAUF", gruende: ["stabile_version_erneut_gemessen"], zeit: new Date().toISOString() };
  } else {
    const urteil = vergleiche(bewertung, stabil?.benchmarks ? { ...stabil.benchmarks } : null);
    if (urteil.entscheidung === "PROMOTE") { promote(registry, version, urteil, bewertung); await setzeCanary(e2, registry, version); }
    else reject(registry, version, urteil, bewertung);
    z.letzteEntscheidung = { version, ...urteil, zeit: new Date().toISOString(), gegen: stabil?.version || null };
    log(`Entscheidung ${version}: ${urteil.entscheidung} (${urteil.gruende.join(", ")})`);
  }
  await schreibeRegistry(e2, registry);
  z.schwaechste = schwaechsteKategorie(bewertung);
  notiere(z, `Bewertung ${version}: gesamt ${bewertung.gesamt}, kritisch ${bewertung.kritisch}, Entscheidung ${z.letzteEntscheidung.entscheidung}`);
  return bewertung;
}

/** Plant den naechsten Schritt und startet hoechstens EINEN Job. */
async function planeUndStarte(ctx, z) {
  const { e2, konfig, log = () => {} } = ctx;
  const registry = await leseRegistry(e2);
  const stabil = stabileVersion(registry);
  await rollbackWennNoetig(ctx, z, registry);
  const plan = await planeNaechstenSchritt(ctx, z, registry);
  z.plan = plan;
  if (!plan.job) {
    z.phase = plan.phase || "warten_auf_daten";
    return;
  }
  const gestartet = await starteJob(ctx, z, plan.job);
  if (!gestartet.ok) {
    z.phase = "ueberwachen";
    z.startBlockiert = { zeit: new Date().toISOString(), gruende: gestartet.gruende };
    notiere(z, "Start blockiert: " + gestartet.gruende.join("; "));
  }
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

export async function planeNaechstenSchritt(ctx, z, registry) {
  const { e2, konfig } = ctx;
  const stabil = stabileVersion(registry);
  const basisManifest = await e2.getJson(`${konfig.basis.prefix}/manifest.json`, null);
  const basisKomplett = Boolean(basisManifest?.komplett);
  // 1. Keine stabile Version: Messlatte con-1.0.0 setzen (Basismodell unveraendert).
  if (!stabil) {
    const version = "con-1.0.0";
    const vorhanden = findeVersion(registry, version);
    if (vorhanden?.status === "rejected") return { phase: "gestoppt", grund: "con-1.0.0 wurde verworfen — Betreiber-Entscheidung noetig" };
    return { schritt: "messlatte", job: { modus: basisKomplett ? "messung" : "spiegel+messung", version, ziel: `Messlatte ${version} (Basis ${konfig.basis.repo}${basisKomplett ? "" : ", erst spiegeln"})`,
      parameter: { CON_VERSION: version, CON_WIEDERHOLUNGEN: konfig.wiederholungen } } };
  }
  // 1b. Latte hat sich geaendert: die stabile Version zuerst neu messen. Ein Kandidat gegen eine
  // Note zu halten, die mit einer anderen Suite entstanden ist, waere ein unfairer Vergleich.
  const aktuell = await suitenStand(konfig.suitesDir);
  const veraendert = abweichendeSuiten(stabil.benchmarks?.suitenStand, aktuell);
  if (veraendert.length) {
    return { schritt: "latte_neu_messen", job: { modus: "messung", version: stabil.version, adapterPrefix: stabil.adapterPrefix || null,
      ziel: `Stabile Version ${stabil.version} mit geaenderter Latte neu messen (${veraendert.join(", ")})`,
      parameter: { CON_VERSION: stabil.version, ...(stabil.adapterPrefix ? { CON_ADAPTER_PREFIX: stabil.adapterPrefix } : {}), CON_WIEDERHOLUNGEN: konfig.wiederholungen } } };
  }
  // 2. Kandidat mit Adapter, aber ohne Bewertung: messen.
  const kandidat = registry.versions.find((v) => v.status === "candidate" && v.adapterPrefix && !v.benchmarks);
  if (kandidat) {
    return { schritt: "kandidat_messen", job: { modus: "messung", version: kandidat.version, adapterPrefix: kandidat.adapterPrefix, ziel: `Kandidat ${kandidat.version} messen`,
      parameter: { CON_VERSION: kandidat.version, CON_ADAPTER_PREFIX: kandidat.adapterPrefix, CON_WIEDERHOLUNGEN: konfig.wiederholungen } } };
  }
  // 3. Schwaeche -> Trainingsplan -> Daten pruefen -> Training.
  const schwaeche = z.schwaechste || (stabil.benchmarks ? schwaechsteKategorie(stabil.benchmarks) : null);
  const daten = await findeDatensatz(e2, schwaeche?.kategorie);
  const minPaare = Number(process.env.CON_MIN_PAARE) > 0 ? Number(process.env.CON_MIN_PAARE) : 3000;
  if (!daten) return { schritt: "trainingsplan", phase: "warten_auf_daten", schwaeche, grund: `Kein freigegebener Datensatz unter con/datasets/ fuer ${schwaeche?.kategorie || "allgemein"} (manifest.json mit qualitaet.ok=true, paare>=${minPaare})` };
  if ((daten.paare || 0) < minPaare) return { schritt: "trainingsplan", phase: "warten_auf_daten", schwaeche, grund: `Datensatz ${daten.name} hat ${daten.paare} Paare, noetig ${minPaare} (CON_MIN_PAARE)` };
  if (stabil.datensatz === daten.name && stabil.trainingsKonfig) return { schritt: "trainingsplan", phase: "warten_auf_daten", schwaeche, grund: `Datensatz ${daten.name} wurde fuer ${stabil.version} schon benutzt — neue Daten noetig` };
  const version = naechsteVersion(stabil, { basisPrefix: konfig.basis.prefix, art: "minor" });
  const trainKonfig = JSON.parse(process.env.CON_TRAIN_KONFIG || '{"r":16,"alpha":32,"lr":0.0001,"epochen":1,"maxLen":1024,"checkpointMinuten":15}');
  return { schritt: "training", schwaeche, job: { modus: "training+messung", version, kandidat: version, datensatz: daten.name, trainingsKonfig: trainKonfig,
    ziel: `Training ${version} gegen Schwaeche ${schwaeche?.kategorie || "allgemein"} mit ${daten.name} (${daten.paare} Paare)`,
    parameter: { CON_VERSION: stabil.version, CON_KANDIDAT: version, CON_DATENSATZ_PREFIX: daten.prefix, CON_TRAIN_KONFIG: JSON.stringify(trainKonfig), CON_WIEDERHOLUNGEN: konfig.wiederholungen } } };
}

async function findeDatensatz(e2, kategorie) {
  const index = await e2.getJson("con/datasets/index.json", null);
  const liste = (index?.datensaetze || []).filter((d) => d.qualitaet?.ok === true && d.freigegeben === true);
  if (!liste.length) return null;
  const passend = liste.filter((d) => !kategorie || (d.kategorien || []).includes(kategorie) || (d.kategorien || []).includes("allgemein"));
  const wahl = (passend.length ? passend : liste).sort((a, b) => String(b.erstellt || "").localeCompare(String(a.erstellt || "")))[0];
  return wahl;
}

async function starteJob(ctx, z, jobPlan) {
  const { e2, konfig, salad, log = () => {}, jetzt = () => new Date() } = ctx;
  if (!salad) return { ok: false, gruende: ["kein_salad_client"] };
  const tagesbuch = await leseTagesbuch(e2, jetzt());
  const gesamt = await leseGesamtverbrauch(e2);
  // Nur so viel Zeit reservieren, wie diese Betriebsart wirklich braucht.
  const minuten = minutenFuer(jobPlan.modus, konfig.grenzen);
  const pruefung = darfStarten({ grenzen: konfig.grenzen, tagesbuch, gesamt, gpuKlassen: konfig.salad.gpuKlassen, prioritaet: konfig.salad.prioritaet, minuten });
  if (!pruefung.ok) return { ok: false, gruende: pruefung.gruende };
  const jobId = `con-${jetzt().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${jobPlan.modus.replace(/[^a-z]/g, "")}`;
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
