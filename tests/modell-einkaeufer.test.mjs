// smejj.com — Modell-Einkäufer (Nr. 34): die EMPFEHLUNGS-REGEL ist der
// Prüfgegenstand. Ein Einkäufer, der bei jedem Windhauch das Modell wechseln
// will, richtet mehr Schaden an als einer, der gar nicht misst: jeder
// Wechsel verändert Verhalten, Prompts und Kosten.
import test from "node:test";
import assert from "node:assert/strict";

import {
  PROBEN,
  sseZuText,
  messeModell,
  bewerteEinkauf,
  laufModellEinkauf
} from "../control-server/src/autopilots/modellEinkaeufer.js";

const messung = (modell, treffer, medianMs) => ({ modell, treffer, gesamt: 6, medianMs, einzel: [] });

test("Gleichstand gehoert dem Amtsinhaber — kein Wechsel ohne echten Vorsprung", () => {
  const u = bewerteEinkauf([messung("champ", 5, 900), messung("neu", 5, 800)], "champ");
  assert.equal(u.empfehlung, null, "12 % schneller ist kein Grund fuer einen Modellwechsel");
  assert.match(u.meldung, /champ bleibt vorn/);
});

test("MEHR Treffer schlagen den Amtsinhaber", () => {
  const u = bewerteEinkauf([messung("champ", 4, 500), messung("neu", 6, 1500)], "champ");
  assert.equal(u.empfehlung, "neu", "Qualitaet schlaegt Geschwindigkeit");
  assert.match(u.meldung, /EMPFEHLUNG: Wechsel zu neu/);
});

test("Gleich gut und DEUTLICH schneller (<=60 %) rechtfertigt den Wechsel", () => {
  const u = bewerteEinkauf([messung("champ", 5, 2000), messung("neu", 5, 1000)], "champ");
  assert.equal(u.empfehlung, "neu");
});

test("Die Meldung traegt die Zahlen ALLER Modelle — nachpruefbar, nicht nur ein Urteil", () => {
  const u = bewerteEinkauf([messung("a", 6, 700), messung("b", 3, 400)], "a");
  assert.match(u.meldung, /a 6\/6 700ms/);
  assert.match(u.meldung, /b 3\/6 400ms/);
});

test("sseZuText setzt den Bruecken-Strom korrekt zusammen und ignoriert Muell", () => {
  const roh = [
    'data: {"choices":[{"delta":{"content":"Can"}}]}',
    "event: status",
    'data: {"choices":[{"delta":{"content":"berra"}}]}',
    "data: [DONE]"
  ].join("\n");
  assert.equal(sseZuText(roh), "Canberra");
});

test("Jede Probe erkennt richtige und falsche Antworten", () => {
  const richtige = {
    wissen: "Canberra", rechnen: "391",
    code: "function summe(a, b) { return a + b; }",
    logik: "Carl", deutsch: "Häuser", disziplin: '{"bereit": true}'
  };
  for (const p of PROBEN) {
    assert.equal(p.pruefe(richtige[p.id]), true, `${p.id}: richtige Antwort abgelehnt`);
    assert.equal(p.pruefe("Ich bin ein Sprachmodell und kann dazu nichts sagen."), false,
      `${p.id}: Ausweich-Antwort faelschlich akzeptiert`);
  }
});

test("messeModell: HTTP-Fehler und leere Antworten sind KEIN Treffer", async () => {
  const kaputt = await messeModell("x", {
    token: "t",
    fetchImpl: async () => ({ ok: false, status: 503, text: async () => "" })
  });
  assert.equal(kaputt.treffer, 0);
  assert.equal(kaputt.einzel[0].grund, "HTTP 503");

  const leer = await messeModell("x", {
    token: "t",
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => "data: [DONE]" })
  });
  assert.equal(leer.treffer, 0);
  assert.equal(leer.einzel[0].grund, "leere Antwort");
});

test("laufModellEinkauf: ohne Secret ehrlich rot; Voll-Ausfall der Kette ebenfalls", async () => {
  const ohne = await laufModellEinkauf({ env: {} });
  assert.equal(ohne.ok, false);
  assert.match(ohne.meldung, /SMEJJ_SESSION_SECRET/);

  const tot = await laufModellEinkauf({
    env: { SMEJJ_SESSION_SECRET: "geheim-lang-genug-fuer-die-probe" },
    holeModelle: async () => ({ modelle: ["a", "b"], champion: "a" }),
    fetchImpl: async () => ({ ok: false, status: 503, text: async () => "" })
  });
  assert.equal(tot.ok, false, "wenn KEIN Modell eine Probe schafft, ist die Kette kaputt — nicht die Modelle");
  assert.match(tot.meldung, /Kette prüfen/);
});

test("Zwischenmeldung: ein uebersprungener Takt MELDET sich (Befund 2026-08-13: grau verdeckte den fehlenden Start)", async () => {
  const { pruefeEinkaufsTakt, __einkaufAblageLeeren, __einkaufAblageSchreiben } = await import("../control-server/src/autopilots/modellEinkaeufer.js");
  __einkaufAblageLeeren();
  const jetzt = Date.parse("2026-08-13T18:00:00Z");
  await __einkaufAblageSchreiben({ id: "einkauf-2026-08-13", createdAt: "2026-08-13T09:00:00Z" });

  const meldungen = [];
  const uebersprungen = await pruefeEinkaufsTakt({
    env: {},
    jetztMs: jetzt,
    melde: (id, e) => meldungen.push({ id, ...e }),
    einkauf: async () => { throw new Error("Arena darf bei frischem Einkauf NICHT laufen"); }
  });
  assert.equal(uebersprungen.gelaufen, false);
  assert.equal(meldungen.length, 1, "auch das Ueberspringen ist eine Meldung");
  assert.equal(meldungen[0].status, "ok");
  assert.match(meldungen[0].meldung, /vor 0 Tag/);
  assert.match(meldungen[0].meldung, /naechste Wochen-Arena am 2026-08-19/);

  // Ist der letzte Einkauf aelter als die Woche, laeuft die Arena wirklich.
  __einkaufAblageLeeren();
  await __einkaufAblageSchreiben({ id: "einkauf-alt", createdAt: "2026-08-01T09:00:00Z" });
  const gelaufen = await pruefeEinkaufsTakt({
    env: {},
    jetztMs: jetzt,
    melde: (id, e) => meldungen.push({ id, ...e }),
    einkauf: async () => ({ ok: true, meldung: "Arena gelaufen: Champion bleibt" })
  });
  assert.equal(gelaufen.gelaufen, true);
  assert.match(meldungen[meldungen.length - 1].meldung, /Arena gelaufen/);
});

test("start.js ruft jeden importierten starte*-Dienst auch auf — Importe ohne Aufruf sind der Fehler von heute", async () => {
  const { readFile } = await import("node:fs/promises");
  const quelle = await readFile(new URL("../control-server/src/autopilots/start.js", import.meta.url), "utf8");
  const importiert = [...quelle.matchAll(/import\s*\{([^}]+)\}/g)]
    .flatMap((m) => m[1].split(","))
    .map((name) => name.trim().split(/\s+as\s+/).pop())
    .filter((name) => /^starte[A-Z]/.test(name));
  assert.ok(importiert.length >= 5, "start.js muss die starte*-Dienste importieren");
  for (const name of importiert) {
    const aufrufe = quelle.split(name).length - 1;
    assert.ok(aufrufe >= 2, `${name} wird importiert, aber nie aufgerufen — genau so blieb der Einkaeufer unsichtbar stehen`);
  }
});

test("429-fest: bei Rate-Limit wird gewartet und EINMAL wiederholt; Rest-429 heisst 'nicht messbar', nie 'kann nichts'", async () => {
  const { messeModell, bewerteEinkauf, PROBEN } = await import("../control-server/src/autopilots/modellEinkaeufer.js");
  const wartezeiten = [];
  let aufrufe = 0;

  // Erster Aufruf je Probe: 429 mit Retry-After — der Wiederholungsversuch liefert.
  const einmal429 = await messeModell("test-modell", {
    token: "t",
    proben: PROBEN.slice(0, 2),
    pauseMs: 0,
    warte: async (ms) => { wartezeiten.push(ms); },
    fetchImpl: async () => {
      aufrufe += 1;
      if (aufrufe % 2 === 1) return { ok: false, status: 429, headers: { get: () => "7" } };
      return { ok: true, status: 200, text: async () => 'data: {"choices":[{"delta":{"content":"Canberra 391"}}]}\n\ndata: [DONE]\n' };
    }
  });
  assert.equal(einmal429.treffer, 2, "nach der Wartezeit zaehlt der zweite Versuch");
  assert.equal(einmal429.nichtMessbar, 0);
  assert.ok(wartezeiten.includes(7000), "Retry-After der Bruecke (7 s) muss respektiert werden");

  // Dauerhaft 429: nicht messbar — und bewerteEinkauf verurteilt NICHT.
  const dauer429 = await messeModell("gedrosselt", {
    token: "t",
    proben: PROBEN.slice(0, 2),
    pauseMs: 0,
    warte: async () => {},
    fetchImpl: async () => ({ ok: false, status: 429, headers: { get: () => null } })
  });
  assert.equal(dauer429.treffer, 0);
  assert.equal(dauer429.nichtMessbar, 2, "beide Proben sind ungemessen, nicht durchgefallen");

  const urteil = bewerteEinkauf([
    { modell: "champion", treffer: 6, gesamt: 6, medianMs: 2000 },
    { ...dauer429, modell: "gedrosselt" }
  ], "champion");
  assert.deepEqual(urteil.nichtMessbar, ["gedrosselt"]);
  assert.equal(urteil.rangliste.includes("gedrosselt"), false, "Ungemessene stehen in keiner Rangliste");
  assert.match(urteil.meldung, /gedrosselt nicht messbar \(Rate-Limit\)/);
  assert.equal(/gedrosselt 0\//.test(urteil.meldung), false, "das falsche 0/6-Urteil darf nie wieder auftauchen");
});
