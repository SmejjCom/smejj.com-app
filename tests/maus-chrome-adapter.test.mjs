// smejj.com Maus-Engine — Tests fuer den Chrome-Adapter (Teil 3).
// Der wichtigste Beweis hier ist ein negativer: derselbe Interpreter, dasselbe
// fail-closed Tor. Ein Plan, der im eigenen Browser an der Allowlist scheitert,
// muss im Chrome-Adapter GENAUSO scheitern — sonst gaebe es zwei Wahrheiten.
import test from "node:test";
import assert from "node:assert/strict";
import { createChromeAdapter } from "../workers/maus-engine/adapters/chrome-adapter.mjs";
import { baueBefehl, deuteAntwort, herkunftFreigegeben, CHROME_AKTIONEN } from "../workers/maus-engine/adapters/chrome-befehl.mjs";
import { createInterpreter } from "../workers/maus-engine/interpreter.mjs";

// --- Befehlssprache (rein) ---------------------------------------------------

test("baueBefehl: nur die fuenf zugesagten Aktionen", () => {
  assert.deepEqual(CHROME_AKTIONEN, ["navigate", "click", "type", "assert", "screenshot"]);
  assert.match(baueBefehl({ action: "download" }).error, /kann_aktion_nicht/);
  assert.match(baueBefehl({ action: "uploadFile" }).error, /kann_aktion_nicht/);
  assert.match(baueBefehl({ action: "evaluate" }).error, /kann_aktion_nicht/);
});

test("baueBefehl: im fremden Chrome nur https", () => {
  assert.equal(baueBefehl({ action: "navigate", url: "https://smejj.com/" }).ok, true);
  assert.match(baueBefehl({ action: "navigate", url: "http://smejj.com/" }).error, /nur_https/);
});

test("baueBefehl: Secrets verlassen den Vault NICHT Richtung Erweiterung", () => {
  const mitSecret = baueBefehl({
    action: "type",
    target: { selector: { strategy: "css", value: "#pw" } },
    secretRef: "login"
  });
  assert.equal(mitSecret.ok, false);
  assert.match(mitSecret.error, /keine_secrets/);
});

test("baueBefehl: xpath ist bewusst nicht erlaubt", () => {
  const ergebnis = baueBefehl({ action: "click", target: { selector: { strategy: "xpath", value: "//a" } } });
  assert.match(ergebnis.error, /selektor_nicht_erlaubt/);
});

test("deuteAntwort: alles ausser einem klaren ok gilt als Fehlschlag", () => {
  assert.equal(deuteAntwort(null).ok, false);
  assert.equal(deuteAntwort({}).ok, false);
  assert.equal(deuteAntwort({ ok: "ja" }).ok, false);
  assert.equal(deuteAntwort({ ok: true, ergebnis: { url: "x" } }).ok, true);
});

test("herkunftFreigegeben: exakte Herkunft, keine Teiltreffer", () => {
  assert.equal(herkunftFreigegeben("https://smejj.com/pfad", ["https://smejj.com"]), true);
  assert.equal(herkunftFreigegeben("https://boese-smejj.com/", ["https://smejj.com"]), false);
  assert.equal(herkunftFreigegeben("https://smejj.com/", []), false);
  assert.equal(herkunftFreigegeben("kaputt", ["https://smejj.com"]), false);
});

// --- Adapter-Bau -------------------------------------------------------------

test("ohne sichtbare Einwilligung entsteht gar kein Adapter", () => {
  assert.throws(
    () => createChromeAdapter({ transport: { senden: async () => ({ ok: true }) } }),
    /ohne_sichtbare_einwilligung/
  );
});

test("ohne Transport entsteht gar kein Adapter", () => {
  assert.throws(() => createChromeAdapter({ einwilligungBestaetigt: true }), /transport_fehlt/);
});

// --- Durch dasselbe Tor ------------------------------------------------------

function plan(steps, allowlist = ["smejj.com"]) {
  return {
    schemaVersion: 1,
    planId: "chrome-test-1",
    createdAt: "2026-07-31T00:00:00Z",
    capsuleRef: "maus-chrome-test",
    planner: { modelId: "beliebig", promptTemplateVersion: "v1" },
    policy: {
      domainAllowlist: allowlist,
      budget: {
        maxActions: 10, maxLocalRetries: 0, maxPlannerRoundtrips: 0,
        maxDurationMs: 30_000, defaultActionTimeoutMs: 1000
      }
    },
    steps
  };
}

function adapterMitProtokoll(freigegebeneHerkuenfte = ["https://smejj.com"]) {
  const gesendet = [];
  const transport = {
    async senden(befehl) {
      gesendet.push(befehl);
      if (befehl.typ === "navigate") return { ok: true, ergebnis: { url: befehl.url, status: 200 } };
      if (befehl.typ === "screenshot") return { ok: true, ergebnis: { pngBase64: Buffer.from("PNG").toString("base64") } };
      // anzahl:0 = "Element nicht da". Wichtig fuer eine realistische Seite:
      // navigate fragt ueber cookie-banner.mjs eine Reihe Banner-Kandidaten ab.
      // Meldet der Mock ueberall einen Treffer, klickt die Heuristik einen
      // Banner, den es nicht gibt — dann misst der Test den Mock, nicht den Adapter.
      if (befehl.typ === "assert") return { ok: true, ergebnis: { anzahl: 0, titel: "smejj.com" } };
      return { ok: true, ergebnis: {} };
    }
  };
  return {
    gesendet,
    browserFactory: createChromeAdapter({ transport, freigegebeneHerkuenfte, einwilligungBestaetigt: true })
  };
}

test("Chrome-Adapter laeuft durch denselben Interpreter", async () => {
  const { gesendet, browserFactory } = adapterMitProtokoll();
  const ergebnis = await createInterpreter(
    plan([
      { id: "c1", action: "openBrowser" },
      { id: "c2", action: "navigate", url: "https://smejj.com/" },
      { id: "c3", action: "click", target: { selector: { strategy: "role", value: "button", name: "Senden" } } },
      { id: "c4", action: "screenshot", name: "chrome-beweis" }
    ]),
    { browserFactory, retryDelayFn: async () => {} }
  ).run();
  assert.equal(ergebnis.ok, true, JSON.stringify(ergebnis.actionLog));
  // Zwischen navigate und click liegt eine assert-Abfrage: navigate schliesst
  // ueber cookie-banner.mjs heuristisch Zustimmungsbanner. Das ist erwuenscht
  // und laeuft ebenfalls durch die Befehlssprache — deshalb wird hier auf die
  // Reihenfolge der TRAGENDEN Befehle geprueft, nicht auf blosse Gleichheit.
  const tragend = gesendet.filter((b) => b.typ !== "assert").map((b) => b.typ);
  assert.deepEqual(tragend, ["navigate", "click", "screenshot"]);
  const klick = gesendet.find((b) => b.typ === "click");
  assert.equal(klick.ziel.strategie, "role");
  assert.equal(klick.ziel.name, "Senden");
});

test("KERNBEWEIS: die Allowlist gilt im Chrome-Adapter genauso", () => {
  // Sie greift sogar frueher als im Lauf: der Plan-Validator lehnt den Schritt
  // ab, bevor ueberhaupt ein Adapter gebaut wird. Ein Weg am Tor vorbei
  // existiert damit nicht — auch nicht fuer den Chrome des Betreibers.
  const { gesendet, browserFactory } = adapterMitProtokoll(["https://fremde-seite.example"]);
  assert.throws(
    () => createInterpreter(
      plan([
        { id: "c1", action: "openBrowser" },
        { id: "c2", action: "navigate", url: "https://fremde-seite.example/" }
      ], ["smejj.com"]),
      { browserFactory, retryDelayFn: async () => {} }
    ),
    /Domain-Allowlist/
  );
  assert.equal(gesendet.length, 0, "die Erweiterung darf den Befehl nie zu sehen bekommen");
});

test("zweite Schranke: Allowlist erlaubt, Herkunft aber nicht freigegeben", async () => {
  // Der Interpreter laesst die Domain durch — der Adapter blockt trotzdem,
  // weil der Betreiber diese Herkunft nie sichtbar bestaetigt hat.
  const { gesendet, browserFactory } = adapterMitProtokoll([]);
  const ergebnis = await createInterpreter(
    plan([
      { id: "c1", action: "openBrowser" },
      { id: "c2", action: "navigate", url: "https://smejj.com/" }
    ]),
    { browserFactory, retryDelayFn: async () => {} }
  ).run();
  assert.equal(ergebnis.ok, false);
  assert.match(ergebnis.abortReason, /herkunft_nicht_freigegeben/);
  // Nach einem Abbruch holt der Interpreter einen Beweis-Screenshot — das ist
  // der einzige Befehl, der die Erweiterung erreichen darf.
  assert.deepEqual(gesendet.map((b) => b.typ), ["screenshot"]);
});

test("Budget gilt auch hier: zu viele Schritte kommen gar nicht erst los", () => {
  const { gesendet, browserFactory } = adapterMitProtokoll();
  const knapp = plan([
    { id: "c1", action: "openBrowser" },
    { id: "c2", action: "navigate", url: "https://smejj.com/" },
    { id: "c3", action: "screenshot", name: "a" }
  ]);
  knapp.policy.budget.maxActions = 2;
  assert.throws(
    () => createInterpreter(knapp, { browserFactory, retryDelayFn: async () => {} }),
    /maxActions/
  );
  assert.equal(gesendet.length, 0);
});

test("nicht unterstuetzte Aktionen scheitern ehrlich statt halb zu laufen", async () => {
  const { browserFactory } = adapterMitProtokoll();
  const ergebnis = await createInterpreter(
    plan([
      { id: "c1", action: "openBrowser" },
      { id: "c2", action: "navigate", url: "https://smejj.com/" },
      { id: "c3", action: "extract", name: "x", target: { strategy: "css", value: "h1" } }
    ]),
    { browserFactory, retryDelayFn: async () => {} }
  ).run();
  assert.equal(ergebnis.ok, false);
  assert.match(ergebnis.abortReason, /chrome_adapter_kann_nicht/);
});
