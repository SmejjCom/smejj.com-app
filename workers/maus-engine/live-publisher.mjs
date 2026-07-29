// smejj.com Maus-Engine — Live-Fortschritt (Stufe B, schriftlich freigegeben 2026-07-15).
// Single Responsibility: waehrend des Laufs nach JEDEM Schritt einen kleinen
// Status nach IDrive e2 schreiben, damit die Replay-Ansicht quasi-live
// (~1-2 s Versatz) mitlaufen kann. Kein neuer Dienst, keine neue Laufzeit —
// nur ein paar zusaetzliche kleine PUTs in die bereits bestehende Capsule.
//
// Verbindlich fail-safe: Ein Fehler beim Veroeffentlichen darf den Lauf NIEMALS
// abbrechen oder verlangsamen. Die Anzeige ist Beiwerk, der Lauf ist die Wahrheit.
// Deshalb: jeder Publish in try/catch, Screenshots gedrosselt, feuern-und-vergessen.
import { gzipSync } from "node:zlib";
import { signedS3Request, assertSafeObjectKey } from "../glm-salad/s3.js";

const LIVE_STATUS_NAME = "live/status.json";
const LIVE_SHOT_PREFIX = "live/shots";
// Weg A (Live-Bild): EIN Objekt, das laufend ueberschrieben wird — nicht ein
// Objekt je Einzelbild. Der Speicherbedarf bleibt dadurch konstant statt mit
// der Laufzeit zu wachsen, und die Anzeige kann eine einmal signierte
// Download-Adresse fuer die ganze Gueltigkeitsdauer weiterbenutzen (der
// Control Server sieht so nur einen Aufruf alle paar Minuten statt einen je Bild).
const LIVE_FRAME_NAME = "live/frame.jpg";

// Gleiche Praefix-Logik wie artifact-uploader.mjs (eine Quelle der Wahrheit fuer
// die Capsule-Ablage; bewusst dupliziert statt Export zu aendern — Non-Regression).
export function liveResultPrefix(capsuleRef, planId) {
  const safe = (value) => String(value).replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120);
  return `capsules/maus-engine/${safe(capsuleRef)}/result/${safe(planId)}`;
}

// Der Live-Status ist bewusst winzig und enthaelt NIE Rohdaten der Seite:
// nur Schrittzaehler, Aktion, maskierte Parameter und Ergebnis-Flag.
export function buildLiveStatus({ entry, index, total, startedAt, finished = false, ok = null, abortReason = null }) {
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    startedAt,
    finished,
    ok,
    abortReason,
    stepIndex: index,
    stepTotal: total,
    step: entry
      ? {
          index: entry.index,
          id: entry.id,
          action: entry.action,
          params: entry.params,
          ok: entry.ok,
          error: entry.error ?? null,
          durationMs: entry.durationMs ?? null
        }
      : null
  };
}

export function createLivePublisher({ capsuleRef, planId, total, config, putObject, clock = Date } = {}) {
  const disabled = !config && !putObject;
  const prefix = liveResultPrefix(capsuleRef, planId);
  const put = putObject || ((key, body, contentType) => signedS3Request(config, "PUT", key, body, contentType));
  const startedAt = new Date().toISOString();
  const publishedShots = new Set();
  let lastShotAt = 0;

  async function safePut(key, body, contentType) {
    if (disabled) return false;
    try {
      assertSafeObjectKey(key);
      await put(key, body, contentType);
      return true;
    } catch {
      // Fail-safe: Anzeige-Fehler duerfen den Lauf nie beeinflussen.
      return false;
    }
  }

  async function publishStatus(payload) {
    const body = Buffer.from(JSON.stringify(payload, null, 2));
    return safePut(`${prefix}/${LIVE_STATUS_NAME}`, body, "application/json");
  }

  // Screenshots waehrend des Laufs: nur bei echten screenshot-Schritten und
  // hoechstens alle 2 s, damit weder Kosten noch Laufzeit spuerbar steigen.
  async function publishShotIfAny(entry, artifacts) {
    if (!Array.isArray(artifacts) || entry?.action !== "screenshot") return false;
    const name = entry?.params?.name;
    if (!name || publishedShots.has(name)) return false;
    const artifact = artifacts.find((item) => item.name === `screenshots/${name}.png`);
    if (!artifact?.data) return false;
    const now = clock.now();
    if (now - lastShotAt < 2000) return false;
    lastShotAt = now;
    publishedShots.add(name);
    return safePut(`${prefix}/${LIVE_SHOT_PREFIX}/${name}.png.gz`, gzipSync(artifact.data), "application/gzip");
  }

  return {
    startedAt,
    // Weg A: ein Einzelbild des laufenden Browsers. Bewusst OHNE gzip — JPEG ist
    // bereits komprimiert, ein zweiter Durchgang kostet nur Rechenzeit auf dem
    // kleinen Server. Wie alles hier fail-safe.
    async publishFrame(jpeg) {
      if (!jpeg?.length) return false;
      return safePut(`${prefix}/${LIVE_FRAME_NAME}`, jpeg, "image/jpeg");
    },
    // Wird vom Interpreter nach JEDEM Schritt aufgerufen (fire-and-forget).
    async onStep({ entry, index, artifacts } = {}) {
      await publishShotIfAny(entry, artifacts);
      await publishStatus(buildLiveStatus({ entry, index, total, startedAt }));
    },
    // Am Ende einmal den Endzustand schreiben, damit die Anzeige sauber
    // vom Live-Modus ins vollstaendige Replay umschalten kann.
    async finish({ ok, abortReason = null, lastIndex = null } = {}) {
      await publishStatus(
        buildLiveStatus({ entry: null, index: lastIndex, total, startedAt, finished: true, ok, abortReason })
      );
    }
  };
}
