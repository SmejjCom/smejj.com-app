// Der Live-Browser haengt an EINER Frage: welchen Anmelde-Nachweis schickt
// der Panel-Client mit? Diese Datei haelt fest, was am 2026-08-17 zweimal
// schiefging — einmal in die eine, einmal in die andere Richtung.
import test from "node:test";
import assert from "node:assert/strict";
import { createBrowserSessionClient } from "../public/browser-pane-session.js";

const SCHLUESSEL = "smejj.auth.accessToken.v1";
const ROUTEN = { api: {
  browserSession: "https://api.example.com/api/browser/session",
  browserSessionAct: "https://api.example.com/api/browser/session/act",
  browserSessionClose: "https://api.example.com/api/browser/session/close"
} };

function speicher(wert) {
  return { getItem: (k) => (k === SCHLUESSEL ? wert : null), setItem() {}, removeItem() {} };
}

/** Nimmt genau `gueltig` an, alles andere 401. Protokolliert die Versuche. */
function server(gueltig) {
  const versuche = [];
  const fetchImpl = async (_url, opts) => {
    const auth = String(opts?.headers?.Authorization || "");
    versuche.push(auth.replace("Bearer ", "") || "(ohne)");
    const ok = auth === `Bearer ${gueltig}`;
    return {
      ok,
      status: ok ? 200 : 401,
      json: async () => (ok
        ? { ok: true, sessionId: "s1", screenshot: "data:image/jpeg;base64,x", title: "T" }
        : { ok: false, error: "authentication_required" })
    };
  };
  return { versuche, fetchImpl };
}

// DIE REGRESSION, die der Betreiber gesehen hat: Der Live-Browser lief, dann
// war er weg — Amazon erschien wieder als Standbild. Ursache war NICHT der
// Fern-Browser, sondern dass die neue Nachweis-Suche sessionStorage ZUERST
// ansah und beim ersten Fund stehenblieb. Lag dort ein abgelaufener Wert,
// gewann der falsche, und der gute in localStorage kam nie zum Zug.
test("ein abgelaufener Nachweis verdraengt den guten nicht", async () => {
  globalThis.localStorage = speicher("GUT");
  globalThis.sessionStorage = speicher("ABGELAUFEN");
  const { versuche, fetchImpl } = server("GUT");
  const client = createBrowserSessionClient({ routes: ROUTEN, fetchImpl });

  const daten = await client.open("https://amazon.com/", { width: 1365, height: 900 });
  assert.ok(daten?.ok, "die Sitzung muss zustande kommen — der gueltige Nachweis liegt vor");
  assert.equal(versuche[0], "GUT", "localStorage zuerst: die Quelle, die nachweislich getragen hat");
});

// Die Gegenrichtung — der urspruengliche Fehler, wegen dessen ueberhaupt
// umgebaut wurde: liegt der gueltige Wert in sessionStorage (dorthin legt ihn
// der Auffrischer in account-sessions.js), muss er ebenfalls gefunden werden.
test("ein Nachweis aus sessionStorage wird auch gefunden", async () => {
  globalThis.localStorage = speicher("ABGELAUFEN");
  globalThis.sessionStorage = speicher("GUT");
  const { versuche, fetchImpl } = server("GUT");
  const client = createBrowserSessionClient({ routes: ROUTEN, fetchImpl });

  const daten = await client.open("https://amazon.com/", { width: 1365, height: 900 });
  assert.ok(daten?.ok, "beide Speicher muessen probiert werden, nicht nur der erste");
  assert.ok(versuche.includes("GUT"));
});

test("ohne jeden Nachweis wird sauber aufgegeben, nicht endlos versucht", async () => {
  globalThis.localStorage = speicher(null);
  globalThis.sessionStorage = speicher(null);
  const { versuche, fetchImpl } = server("NIE");
  const client = createBrowserSessionClient({ routes: ROUTEN, fetchImpl });

  const daten = await client.open("https://amazon.com/", { width: 1365, height: 900 });
  assert.equal(daten, null, "der Aufrufer faellt dann auf die Standbild-Ansicht zurueck");
  assert.ok(versuche.length <= 3, `hoechstens drei Versuche, waren ${versuche.length}: ${versuche.join(",")}`);
});

// Ein gesperrter Speicher (Privatmodus, Richtlinie) darf nichts umwerfen.
test("gesperrter Speicher wirft nicht", async () => {
  const gesperrt = { getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("SecurityError"); } };
  globalThis.localStorage = gesperrt;
  globalThis.sessionStorage = gesperrt;
  const { fetchImpl } = server("NIE");
  const client = createBrowserSessionClient({ routes: ROUTEN, fetchImpl });
  assert.equal(await client.open("https://amazon.com/", {}), null);
});
