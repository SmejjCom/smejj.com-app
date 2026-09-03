// smejj.com — Bau-Wache (Autopilot Nr. 76), Audit A bis Z 2026-09-03.
//
// WARUM ES SIE GIBT: Ein Push ist kein Deploy. Am 13.08. lösten drei Pushes
// keinen einzigen Bau aus, am 02.09. war der Zeabur-Token tot (401) und damit
// jede Bau-Kontrolle per Skript blind. Diese Wache misst von innen, was ein
// Mensch sonst im Portal nachsieht: Läuft der Container mit dem Commit, der
// zuletzt auf den Bauzweig kam — und hat GitHub für diesen Commit einen
// erfolgreichen Zeabur-Bau verbucht?
//
// GEMESSEN, NICHT GESCHÄTZT: der laufende Commit kommt aus der Umgebung
// (ZEABUR_GIT_COMMIT_SHA, je Bau von Zeabur gesetzt), der jüngste Commit und
// die Check-Runs aus der öffentlichen GitHub-API (das Repo ist öffentlich,
// kein Token nötig; 4 Anfragen je Stunde bleiben weit unter dem Limit von 60).
import { aktuellerStand as laufendenCommit } from "./rueckRollerAutopilot.js";

export const REPO = "SmejjCom/smejj.com-app";
export const BAUZWEIG = "feature/auth-redesign-github-magiclink";
/** So lange darf ein Push ohne laufenden Bau sein, bevor die Ampel rot wird. */
export const BAU_FRIST_MS = 30 * 60 * 1000;

/**
 * Beurteilt Bau-Lage. Getrennt testbar (kaputt + gesund).
 * @param {{laufend:string, juengster:string, juengsterAm:number, checkRun:{status?:string, conclusion?:string}|null, jetztMs:number}} lage
 */
export function beurteileBau({ laufend = "", juengster = "", juengsterAm = 0, checkRun = null, jetztMs = Date.now() } = {}) {
  if (!laufend) return { ok: false, grund: "laufender Commit unbekannt (ZEABUR_GIT_COMMIT_SHA fehlt) — Bau-Lage nicht messbar" };
  if (!juengster) return { ok: false, grund: "jüngster Commit des Bauzweigs nicht lesbar" };
  const kurzL = laufend.slice(0, 8);
  const kurzJ = juengster.slice(0, 8);
  const alterMin = Number.isFinite(juengsterAm) && juengsterAm > 0 ? Math.round((jetztMs - juengsterAm) / 60_000) : null;
  if (juengster.startsWith(laufend) || laufend.startsWith(juengster)) {
    return { ok: true, grund: `Container läuft mit dem jüngsten Commit ${kurzL}` + (checkRun?.conclusion ? ` (Zeabur: ${checkRun.conclusion})` : "") };
  }
  const bau = checkRun ? `${checkRun.status || "?"}/${checkRun.conclusion || "offen"}` : "kein Check-Run";
  if (checkRun?.conclusion === "failure" || checkRun?.conclusion === "cancelled" || checkRun?.conclusion === "timed_out") {
    return { ok: false, grund: `Bau für ${kurzJ} ist ${checkRun.conclusion} — Container läuft noch mit ${kurzL}` };
  }
  if (alterMin !== null && alterMin > BAU_FRIST_MS / 60_000) {
    return { ok: false, grund: `Push ${kurzJ} seit ${alterMin} min ohne laufenden Container (${bau}) — Container trägt ${kurzL}; Portal prüfen (Auto-Deploy, Token)` };
  }
  return { ok: true, grund: `Push ${kurzJ} vor ${alterMin ?? "?"} min, Bau ${bau} — Container noch auf ${kurzL}, Frist ${BAU_FRIST_MS / 60_000} min läuft` };
}

/** Selbsttest: kaputte UND gesunde Probe. */
export function fuehreSelbsttestAus() {
  const fehler = [];
  const t = 1_800_000_000_000;
  if (!beurteileBau({ laufend: "abc123def", juengster: "abc123def", jetztMs: t }).ok) fehler.push("gleicher Commit gilt fälschlich als ungebaut");
  const alt = beurteileBau({ laufend: "aaa", juengster: "bbb", juengsterAm: t - 2 * BAU_FRIST_MS, checkRun: null, jetztMs: t });
  if (alt.ok) fehler.push("alter Push ohne Bau muss rot sein");
  const frisch = beurteileBau({ laufend: "aaa", juengster: "bbb", juengsterAm: t - 60_000, checkRun: { status: "in_progress" }, jetztMs: t });
  if (!frisch.ok) fehler.push("frischer Push innerhalb der Frist darf nicht rot sein");
  const kaputt = beurteileBau({ laufend: "aaa", juengster: "bbb", juengsterAm: t - 60_000, checkRun: { status: "completed", conclusion: "failure" }, jetztMs: t });
  if (kaputt.ok) fehler.push("gescheiterter Bau muss rot sein");
  if (beurteileBau({ laufend: "", juengster: "bbb", jetztMs: t }).ok) fehler.push("ohne laufenden Commit darf es kein Grün geben");
  return { bestanden: fehler.length === 0, fehler, geprueft: 5 };
}

async function github(pfad, fetchImpl) {
  const antwort = await fetchImpl(`https://api.github.com/repos/${REPO}/${pfad}`, {
    signal: AbortSignal.timeout(12_000),
    headers: { Accept: "application/vnd.github+json", "User-Agent": "smejj-bau-wache" }
  });
  if (!antwort.ok) throw new Error(`GitHub HTTP ${antwort.status}`);
  return antwort.json();
}

/** Der Lauf im Takt: Selbsttest, dann Umgebung + GitHub. */
export async function laufBauWache({ mitNetz = true, env = process.env, fetchImpl = fetch, jetztMs = Date.now() } = {}) {
  const probe = fuehreSelbsttestAus();
  if (!probe.bestanden) return { ok: false, meldung: `Bau-Wache beurteilt bekannte Lagen falsch: ${probe.fehler.join("; ")}` };
  const laufend = laufendenCommit(env);
  if (!mitNetz) return { ok: true, meldung: `Netz-Takt abgewartet — Container trägt ${laufend ? laufend.slice(0, 8) : "unbekannt"}` };
  let juengster = "";
  let juengsterAm = 0;
  let checkRun = null;
  try {
    const commit = await github(`commits/${encodeURIComponent(BAUZWEIG)}`, fetchImpl);
    juengster = String(commit?.sha || "");
    juengsterAm = Date.parse(commit?.commit?.committer?.date || commit?.commit?.author?.date || "") || 0;
    if (juengster) {
      const runs = await github(`commits/${juengster}/check-runs`, fetchImpl);
      checkRun = (runs?.check_runs || []).find((r) => /zeabur/i.test(r.name || "")) || (runs?.check_runs || [])[0] || null;
    }
  } catch (f) {
    return { ok: false, meldung: `GitHub nicht lesbar (${String(f?.message || f).slice(0, 50)}) — Bau-Lage nicht messbar; Container trägt ${laufend ? laufend.slice(0, 8) : "unbekannt"}` };
  }
  const urteil = beurteileBau({ laufend, juengster, juengsterAm, checkRun, jetztMs });
  return { ok: urteil.ok, meldung: `Selbsttest ${probe.geprueft}/${probe.geprueft}; ${urteil.grund}` };
}
