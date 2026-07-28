// smejj.com — Schutztests fuer die Welle-3-Behebungen im Control Server
// (QA-Bericht docs/qa/QA_WELLE_3_2026-07-27.md, Freigabe "smejj.com 100 % fertig").
//
// W3-01 Kaltstart: Infrastruktur-Fehler wiederholen mit Wartezeit und sichtbarem
//        Zustand statt sofort dreimal zu scheitern.
// W3-02 Repository-Berechtigung: JEDE Repository-URL laeuft durch die Allowlist,
//        nicht nur private Repos und Draft-PR.
// W3-03 Hydrierung: verwaiste in-flight-Jobs aus frueheren Serverlaeufen werden
//        als fehlgeschlagen markiert statt ewig auf "queued" zu stehen.
// W3-04 Jobliste: erst nach Nutzer filtern, DANN begrenzen; "total" meldet die
//        Gesamtzahl der sichtbaren Jobs.
// W3-05 Unbekannte /api/-Pfade sind keine App-Routen (404 statt index.html).
// W3-07 Die Fehlermeldung nennt Ursache und naechsten Schritt.
import test from "node:test";
import assert from "node:assert/strict";
import {
  createAutonomousRunner,
  describeFailure,
  isInfrastructureFailure
} from "../control-server/src/orchestrator/autonomousRunner.js";
import { staleInFlight } from "../control-server/src/jobs/jobHydration.js";
import { clearJobs, saveJob } from "../control-server/src/jobs/jobStore.js";
import { authenticatedUserId } from "../control-server/src/jobs/jobAccess.js";
import { handleCreateJob, handleListJobs } from "../control-server/src/routes/jobRoutes.js";
import { createStorageFirstJobEnvelope } from "../src/jobs/index.js";
import { createStaticHandlers } from "../src/http/staticServing.js";

function fakeRes() {
  return {
    statusCode: 0,
    chunks: [],
    writeHead(status) { this.statusCode = status; },
    setHeader() {},
    write(chunk) { this.chunks.push(String(chunk)); },
    end(chunk) { if (chunk) this.chunks.push(String(chunk)); },
    payload() { return JSON.parse(this.chunks.join("")); }
  };
}

function fakeReq(body = "{}", authUser = null) {
  const req = {
    headers: {},
    authUser,
    on(event, fn) {
      if (event === "data") setImmediate(() => fn(body));
      if (event === "end") setImmediate(() => fn());
    }
  };
  return req;
}

function seedRunnerJob(jobId) {
  clearJobs();
  const envelope = createStorageFirstJobEnvelope({
    body: { jobId, projectId: "project_smejj", task: "kaltstart test" },
    env: {},
    now: "2026-07-28T08:00:00Z"
  });
  const job = { ...envelope.job, status: "queued", durableTaskCapsule: true };
  saveJob(job);
  return job;
}

// --- W3-01 / W3-07: Klassifikation und Meldung --------------------------------

test("isInfrastructureFailure erkennt Kaltstart-Muster und nur diese", () => {
  assert.equal(isInfrastructureFailure({ errors: [{ source: "worker_http", detail: "status_500" }] }), true);
  assert.equal(isInfrastructureFailure({ errors: [{ source: "worker_http", detail: "status_503" }] }), true);
  assert.equal(isInfrastructureFailure({ errors: [{ source: "dispatch", detail: "ephemeral_worker_readiness_timeout" }] }), true);
  assert.equal(isInfrastructureFailure({ errors: [{ source: "dispatch", detail: "fetch failed" }] }), true);
  // Aufgaben-Fehler duerfen NICHT als Infrastruktur gelten — dort sofort wiederholen:
  assert.equal(isInfrastructureFailure({ errors: [{ source: "worker_http", detail: "status_400" }] }), false);
  assert.equal(isInfrastructureFailure({ errors: [{ source: "verification", detail: "tests_failed" }] }), false);
  // Mischfaelle fail-closed als Aufgaben-Fehler behandeln:
  assert.equal(isInfrastructureFailure({ errors: [
    { source: "worker_http", detail: "status_500" },
    { source: "verification", detail: "tests_failed" }
  ] }), false);
  assert.equal(isInfrastructureFailure({ errors: [] }), false);
  assert.equal(isInfrastructureFailure(null), false);
});

test("describeFailure nennt Ursache und naechsten Schritt (W3-07)", () => {
  const infra = describeFailure({ errors: [{ source: "worker_http", detail: "status_500" }] });
  assert.match(infra, /Rechen-Worker nicht erreichbar/);
  assert.match(infra, /status_500/);
  assert.match(infra, /erneut starten/);
  const task = describeFailure({ errors: [{ source: "verification", detail: "tests_failed" }] });
  assert.match(task, /verification: tests_failed/);
  assert.equal(describeFailure({ errors: [] }), "");
});

// --- W3-01: Verhalten der Versuchsschleife -------------------------------------

test("Kaltstart: Wartezeit vor der Wiederholung, sichtbarer Zustand, dann Erfolg", async () => {
  seedRunnerJob("job_cold_start_ok");
  const messages = [];
  let calls = 0;
  const runner = createAutonomousRunner({
    coldStartBackoffMs: [60, 60],
    dispatch: async () => {
      calls += 1;
      if (calls === 1) return { ok: false, errors: [{ source: "worker_http", detail: "status_500" }] };
      return { ok: true, errors: [], approval: {}, memoryUpdate: null };
    },
    applyTransition: (job, status, message) => {
      messages.push(`${status}:${message}`);
      return saveJob({ ...job, status, message });
    },
    persistOutcome: async () => ({ ok: true })
  });
  const started = Date.now();
  const result = await runner("job_cold_start_ok");
  assert.equal(result.ok, true);
  assert.equal(calls, 2);
  assert.ok(Date.now() - started >= 60, "Die Wartezeit vor dem zweiten Versuch fehlte.");
  assert.ok(messages.some((entry) => /Kaltstart/.test(entry) && /Versuch 2\/3/.test(entry)),
    `Der Kaltstart-Zustand war nicht sichtbar. Meldungen: ${messages.join(" | ")}`);
});

test("Aufgaben-Fehler wiederholen ohne Kaltstart-Wartezeit", async () => {
  seedRunnerJob("job_task_error");
  const messages = [];
  let calls = 0;
  const runner = createAutonomousRunner({
    coldStartBackoffMs: [60_000, 60_000], // wuerde den Test bei falscher Klassifikation sprengen
    dispatch: async () => {
      calls += 1;
      return { ok: false, errors: [{ source: "verification", detail: "tests_failed" }] };
    },
    applyTransition: (job, status, message) => {
      messages.push(String(message));
      return saveJob({ ...job, status, message });
    },
    persistOutcome: async () => ({ ok: true })
  });
  const started = Date.now();
  const result = await runner("job_task_error");
  assert.equal(result.ok, false);
  assert.equal(calls, 3);
  assert.ok(Date.now() - started < 5_000, "Aufgaben-Fehler duerfen keine Kaltstart-Wartezeit ausloesen.");
  assert.ok(!messages.some((entry) => /Kaltstart/.test(entry)));
  // W3-07: Die Endmeldung traegt das Fehlerdetail.
  assert.ok(messages.some((entry) => /failed after 3 attempt/.test(entry) && /tests_failed/.test(entry)),
    `Endmeldung ohne Ursache. Meldungen: ${messages.join(" | ")}`);
});

test("Abbruch waehrend der Kaltstart-Wartezeit greift", async () => {
  const job = seedRunnerJob("job_cold_cancel");
  let calls = 0;
  const runner = createAutonomousRunner({
    coldStartBackoffMs: [10_000],
    dispatch: async () => {
      calls += 1;
      return { ok: false, errors: [{ source: "worker_http", detail: "status_502" }] };
    },
    applyTransition: (nextJob, status, message) => saveJob({ ...nextJob, status, message }),
    persistOutcome: async () => ({ ok: true })
  });
  const run = runner("job_cold_cancel");
  setTimeout(() => saveJob({ ...job, status: "cancelled" }), 300);
  const result = await run;
  assert.equal(result.stage, "cancelled");
  assert.equal(calls, 1, "Nach dem Abbruch darf kein weiterer Versuch laufen.");
});

// --- W3-02: Repository-Allowlist gilt fuer JEDE URL ----------------------------

test("oeffentliches fremdes Repository mit diff-only wird abgelehnt (W3-02)", async () => {
  clearJobs();
  const res = fakeRes();
  const body = JSON.stringify({
    task: "Fremdes Repo testen",
    repository: { url: "https://github.com/torvalds/linux", baseRef: "main", publishMode: "diff-only", visibility: "public" }
  });
  await handleCreateJob(fakeReq(body), res, { env: { SMEJJ_GITHUB_OWNER_ALLOWLIST: "smejjcom" } });
  assert.equal(res.statusCode, 403);
  assert.equal(res.payload().error, "repository_not_allowed");
});

test("erlaubtes Repository passiert die Allowlist weiterhin", async () => {
  clearJobs();
  const res = fakeRes();
  const body = JSON.stringify({
    task: "Eigenes Repo",
    repository: { url: "https://github.com/SmejjCom/smejj-control", baseRef: "main", publishMode: "diff-only", visibility: "public" }
  });
  await handleCreateJob(fakeReq(body), res, { env: { SMEJJ_GITHUB_OWNER_ALLOWLIST: "smejjcom" } });
  assert.notEqual(res.statusCode, 403, `Eigenes Repo abgelehnt: ${res.chunks.join("")}`);
});

test("leere Allowlist lehnt fail-closed ab", async () => {
  clearJobs();
  const res = fakeRes();
  const body = JSON.stringify({
    task: "Ohne Allowlist",
    repository: { url: "https://github.com/SmejjCom/smejj-control", baseRef: "main", publishMode: "diff-only" }
  });
  await handleCreateJob(fakeReq(body), res, { env: {} });
  assert.equal(res.statusCode, 403);
});

// --- W3-03: verwaiste in-flight-Jobs -------------------------------------------

test("staleInFlight markiert nur alte in-flight-Jobs (W3-03)", () => {
  const nowMs = Date.parse("2026-07-28T12:00:00Z");
  // 15 Tage alt und queued -> verwaist:
  assert.equal(staleInFlight("queued", "2026-07-12T15:43:00Z", { nowMs }), true);
  // 10 Minuten alt und running -> lebendig lassen:
  assert.equal(staleInFlight("running", "2026-07-28T11:50:00Z", { nowMs }), false);
  // Abgeschlossene Zustaende nie anfassen, egal wie alt:
  assert.equal(staleInFlight("passed", "2026-07-01T00:00:00Z", { nowMs }), false);
  assert.equal(staleInFlight("failed", "2026-07-01T00:00:00Z", { nowMs }), false);
  assert.equal(staleInFlight("cancelled", "2026-07-01T00:00:00Z", { nowMs }), false);
  // Ohne lesbaren Zeitstempel fail-closed als verwaist:
  assert.equal(staleInFlight("queued", "", { nowMs }), true);
});

// --- W3-04: erst filtern, dann begrenzen ---------------------------------------

test("limit greift nach dem Nutzerfilter, total meldet die Gesamtzahl (W3-04)", async () => {
  clearJobs();
  // Die Besitz-Pruefung vergleicht gegen die GEHASHTE Nutzerkennung.
  const authUser = { sub: "qa-welle3@example.com" };
  const meineId = authenticatedUserId(authUser);
  // 6 eigene und 4 fremde Jobs, zeitlich verschraenkt (fremde sind die neuesten):
  for (let index = 0; index < 10; index += 1) {
    const mine = index >= 4; // die 4 NEUESTEN gehoeren jemand anderem
    saveJob({
      id: `job_list_${index}`,
      status: "passed",
      userId: mine ? meineId : "user_fremd00",
      tenantId: mine ? meineId : "user_fremd00",
      updatedAt: `2026-07-28T0${9 - Math.floor(index / 2)}:0${index % 10}:00Z`,
      createdAt: "2026-07-28T00:00:00Z",
      task: "t"
    });
  }
  const res = fakeRes();
  await handleListJobs(new URL("https://smejj.com/api/jobs?limit=5"), res, {
    env: {},
    hydrateJobs: async () => null,
    authUser
  });
  const payload = res.payload();
  assert.equal(payload.ok, true);
  assert.equal(payload.count, 5, `Erwartet 5 eigene Jobs, kam ${payload.count} — vor der Behebung schnitt limit VOR dem Filter ab.`);
  assert.equal(payload.total, 6, "total muss die Gesamtzahl der sichtbaren Jobs melden.");
  assert.ok(payload.jobs.every((job) => job.id.startsWith("job_list_")));
});

// --- W3-05: /api/ ist nie eine App-Route ---------------------------------------

test("unbekannte /api/-Pfade fallen nicht auf index.html zurueck (W3-05)", () => {
  const { isAppRoute } = createStaticHandlers({});
  assert.equal(isAppRoute("/api/worker/status"), false);
  assert.equal(isAppRoute("/api/gibtesnicht"), false);
  // App-Routen bleiben App-Routen:
  assert.equal(isAppRoute("/settings"), true);
  assert.equal(isAppRoute("/projects"), true);
  // Dateien bleiben Dateien:
  assert.equal(isAppRoute("/sw.js"), false);
});
