// Pruefer fuer das ARIA-Auge (workers/maus-engine/aria-baum.mjs).
// TUEV-Regel (Memory: smejj-waechter-tuev): jeder Waechter bekommt eine
// GESUNDE und eine KAPUTTE Probe. Kaputte Probe hier = genau die Seite, an
// der der alte Beobachter blind war (Anmeldefeld tief im Baum, ohne die
// Attribute, nach denen observer.mjs sucht).
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatAriaBaum, buildAriaObservation, ARIA_BAUM_MAX_NODES } from "../workers/maus-engine/aria-baum.mjs";
import { validateSessionAction } from "../workers/remote-browser/session-engine.js";

// Baut einen Knoten wie Chromiums accessibility.snapshot() ihn liefert.
const knoten = (role, name, extra = {}) => ({ role, name, ...extra });

test("gesunde Probe: Rolle, Name und Zustand landen im Baum", () => {
  const wurzel = knoten("WebArea", "Anmelden", {
    children: [
      knoten("heading", "Willkommen", { level: 1 }),
      knoten("textbox", "E-Mail", { value: "wof@smejj.com", required: true }),
      knoten("button", "Weiter")
    ]
  });
  const { text, knoten: anzahl, gekappt } = formatAriaBaum(wurzel);
  assert.equal(gekappt, false);
  assert.equal(anzahl, 4);
  assert.match(text, /- heading "Willkommen" \[level=1\]/);
  assert.match(text, /- textbox "E-Mail" \[required\]: "wof@smejj\.com"/);
  assert.match(text, /- button "Weiter"/);
  // Hierarchie bleibt erhalten: Kinder sind eingerueckt.
  assert.match(text, /\n {2}- button "Weiter"/);
});

test("kaputte Probe: das Passwortfeld wird NIE im Klartext ausgeliefert", () => {
  const wurzel = knoten("WebArea", "Anmelden", {
    children: [knoten("textbox", "Passwort", { value: "geheim123" })]
  });
  const { text } = formatAriaBaum(wurzel);
  assert.ok(!text.includes("geheim123"), "Passwortwert steht im Baum");
  assert.match(text, /- textbox "Passwort": "\*\*\*"/);
});

test("durchsichtige Huellen ohne Namen verschwinden, ihre Kinder bleiben", () => {
  const wurzel = knoten("WebArea", "", {
    children: [
      knoten("generic", "", {
        children: [knoten("none", "", { children: [knoten("link", "Impressum")] })]
      })
    ]
  });
  const { text, knoten: anzahl } = formatAriaBaum(wurzel);
  assert.equal(anzahl, 2, "nur WebArea und link zaehlen");
  assert.match(text, /- link "Impressum"/);
  assert.ok(!text.includes("generic"), "leere Huelle steht noch im Baum");
});

test("die Kappung meldet sich, statt still abzuschneiden", () => {
  const kinder = [];
  for (let i = 0; i < 50; i += 1) kinder.push(knoten("link", `Ziel ${i}`));
  const { knoten: anzahl, gekappt } = formatAriaBaum(knoten("WebArea", "Viel", { children: kinder }), { maxNodes: 10 });
  assert.equal(anzahl, 10);
  assert.equal(gekappt, true);
});

test("DER BEFUND: der Baum sieht das Anmeldefeld, das ausserhalb des Bildes liegt", () => {
  // Genau die Lage aus Memory smejj-fern-browser-blind: die Google-Seite war
  // 990 KB gross, das Passwortfeld stand bei Byte 918.843 — weit unterhalb
  // des Sichtausschnitts. Der Baum kennt keinen Sichtausschnitt.
  const tiefeKinder = [];
  for (let i = 0; i < 200; i += 1) tiefeKinder.push(knoten("generic", "", { children: [] }));
  tiefeKinder.push(knoten("textbox", "Passwort eingeben"));
  const { text, gekappt } = formatAriaBaum(knoten("WebArea", "Google", { children: tiefeKinder }));
  assert.equal(gekappt, false, "die Seite passt in den Knotendeckel");
  assert.match(text, /- textbox "Passwort eingeben"/);
});

test("buildAriaObservation liefert URL, Titel und Baum (Seite attrappiert)", async () => {
  const seite = {
    url: () => "https://smejj.com/login",
    title: async () => "Anmelden — smejj",
    accessibility: {
      snapshot: async ({ interestingOnly }) => {
        assert.equal(interestingOnly, true);
        return knoten("WebArea", "Anmelden", { children: [knoten("button", "Los")] });
      }
    }
  };
  const ergebnis = await buildAriaObservation(seite);
  assert.equal(ergebnis.url, "https://smejj.com/login");
  assert.equal(ergebnis.titel, "Anmelden — smejj");
  assert.equal(ergebnis.gekappt, false);
  assert.match(ergebnis.baum, /- button "Los"/);
});

test("das Zeichenlimit greift zusaetzlich zum Knotendeckel", async () => {
  const kinder = [];
  for (let i = 0; i < 100; i += 1) kinder.push(knoten("paragraph", "x".repeat(100)));
  const seite = {
    url: () => "https://example.com",
    title: async () => "Lang",
    accessibility: { snapshot: async () => knoten("WebArea", "", { children: kinder }) }
  };
  const ergebnis = await buildAriaObservation(seite, { limitChars: 500 });
  assert.equal(ergebnis.gekappt, true);
  assert.match(ergebnis.baum, /am Zeichenlimit gekappt/);
});

test("die Session-Engine laesst ariaObserve durch — und Unbekanntes nicht", () => {
  assert.deepEqual(validateSessionAction({ type: "ariaObserve" }), {
    ok: true,
    action: { type: "ariaObserve" }
  });
  // Fail-closed bleibt fail-closed: der neue Fall reisst kein Loch auf.
  assert.equal(validateSessionAction({ type: "ariaSnapshotXY" }).ok, false);
  // Der alte Weg ist unveraendert gueltig.
  assert.deepEqual(validateSessionAction({ type: "observe" }), { ok: true, action: { type: "observe" } });
});

test("der Knotendeckel ist eine bewusste Zahl, keine Zufallszahl", () => {
  assert.equal(ARIA_BAUM_MAX_NODES, 800);
});
