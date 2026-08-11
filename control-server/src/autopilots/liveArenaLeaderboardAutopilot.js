// smejj.com — Automated Live-Arena & ELO Leaderboard Autopilot (Autopilot Nr. 25)
// Führt kontinuierliche Benchmark-Kämpfe durch, berechnet mathematische ELO-Ratings
// und sichert den unbestechlichen Nachweis der Überlegenheit von smejj 1.0 / 2.0.

import { createRecordStore } from "../admin/recordStore.js";

const leaderboardStore = createRecordStore("arena/elo-leaderboard", { maximal: 500 });

const INITIAL_ELO = 1500;
const K_FACTOR = 32;

/**
 * Berechnet die Sieg-Wahrscheinlichkeit von Spieler A gegen Spieler B.
 * @param {number} ratingA
 * @param {number} ratingB
 * @returns {number}
 */
export function calculateExpectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Aktualisiert die ELO-Ratings zweier Modelle nach einem Benchmark-Duell.
 * @param {number} ratingA
 * @param {number} ratingB
 * @param {number} actualScoreA 1 für Sieg A, 0.5 für Unentschieden, 0 für Niederlage A
 * @returns {{newRatingA: number, newRatingB: number, deltaA: number, deltaB: number}}
 */
export function updateEloRatings(ratingA, ratingB, actualScoreA) {
  const expectedA = calculateExpectedScore(ratingA, ratingB);
  const expectedB = 1 - expectedA;

  const deltaA = Math.round(K_FACTOR * (actualScoreA - expectedA));
  const deltaB = Math.round(K_FACTOR * ((1 - actualScoreA) - expectedB));

  return {
    newRatingA: ratingA + deltaA,
    newRatingB: ratingB + deltaB,
    deltaA,
    deltaB
  };
}

/**
 * Führt ein simuliertes Live-Arena-Duell zwischen zwei Modellantworten durch.
 * @param {object} modelA { id: string, rating: number, score: number }
 * @param {object} modelB { id: string, rating: number, score: number }
 * @returns {{winner: string, ratingA: number, ratingB: number, deltaA: number, deltaB: number}}
 */
export function executeArenaMatch(modelA, modelB) {
  const scoreA = modelA.score > modelB.score ? 1 : modelA.score === modelB.score ? 0.5 : 0;
  const ratingRes = updateEloRatings(modelA.rating || INITIAL_ELO, modelB.rating || INITIAL_ELO, scoreA);

  const winner = scoreA === 1 ? modelA.id : scoreA === 0.5 ? "draw" : modelB.id;

  return {
    winner,
    ratingA: ratingRes.newRatingA,
    ratingB: ratingRes.newRatingB,
    deltaA: ratingRes.deltaA,
    deltaB: ratingRes.deltaB
  };
}

/**
 * Persistiert ein Arena-Ergebnis auf IDrive e2 S3.
 * @param {object} matchResult
 * @param {object} options
 * @returns {Promise<{ok: boolean, matchId?: string, error?: string}>}
 */
export async function recordArenaMatch(matchResult, { env = process.env } = {}) {
  try {
    const matchId = `match_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await leaderboardStore.schreib({
      id: matchId,
      ...matchResult,
      recordedAt: new Date().toISOString()
    }, { env });

    return { ok: true, matchId };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}
