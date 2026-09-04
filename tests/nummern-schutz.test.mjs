// smejj.com — TUEV der beiden Nummern-Sperren (Betreiber-Freigabe 2026-09-04).
//
// Eine Sperre, die nur die gesunde Probe sieht, beweist nichts: sie koennte
// klaglos "OK" sagen, weil sie gar nicht hinschaut. Deshalb bekommt jede Regel
// hier BEIDE Proben — eine heile und eine absichtlich kaputte
// (Lehre "Waechter-TUEV", siehe docs/memory).
import assert from "node:assert/strict";
import test from "node:test";
import { pruefe as pruefeAutopiloten, nummernAusDerQuelle } from "../scripts/check-autopilot-nummern.mjs";
import { pruefe as pruefeMenue, tabelle } from "../scripts/check-menue-nummern.mjs";
import { registrierteSeiten } from "../scripts/deploy/sync_admin_console_pages.mjs";
import { readFileSync } from "node:fs";

const AP_MANIFEST = JSON.parse(readFileSync(new URL("../docs/security/autopilot-nummern-lock.json", import.meta.url), "utf8"));
const MENUE_MANIFEST = JSON.parse(readFileSync(new URL("../docs/security/adminmenue-nummern-lock.json", import.meta.url), "utf8"));

// ---- Autopiloten-Nummern ---------------------------------------------------

test("Autopiloten: der echte Bestand deckt sich mit dem Manifest", async () => {
  const bestand = await nummernAusDerQuelle();
  const { befunde } = pruefeAutopiloten(bestand, AP_MANIFEST);
  assert.deepEqual(befunde, [], `unerwartete Befunde: ${befunde.join(" | ")}`);
});

test("Autopiloten: eine umnummerierte Zeile faellt auf", async () => {
  const bestand = await nummernAusDerQuelle();
  const kaputt = bestand.map((a) => (a.nummer === "01" ? { ...a, id: "ein-anderer" } : a));
  const { befunde } = pruefeAutopiloten(kaputt, AP_MANIFEST);
  assert.ok(befunde.some((b) => b.includes("Nummer 01") && b.includes("zeigt jetzt")), befunde.join(" | "));
});

test("Autopiloten: eine geloeschte Nummer faellt auf", async () => {
  const bestand = await nummernAusDerQuelle();
  const kaputt = bestand.filter((a) => a.nummer !== "32");
  const { befunde } = pruefeAutopiloten(kaputt, AP_MANIFEST);
  assert.ok(befunde.some((b) => b.includes("Nummer 32") && b.includes("verschwunden")), befunde.join(" | "));
});

test("Autopiloten: eine doppelt vergebene Nummer faellt auf", async () => {
  const bestand = await nummernAusDerQuelle();
  const kaputt = bestand.map((a) => (a.nummer === "02" ? { ...a, nummer: "01" } : a));
  const { befunde } = pruefeAutopiloten(kaputt, AP_MANIFEST);
  assert.ok(befunde.some((b) => b.includes("zweimal vergeben")), befunde.join(" | "));
});

test("Autopiloten: ein Autopilot ohne Nummer faellt auf", async () => {
  const bestand = await nummernAusDerQuelle();
  const kaputt = bestand.map((a) => (a.nummer === "05" ? { ...a, nummer: "" } : a));
  const { befunde } = pruefeAutopiloten(kaputt, AP_MANIFEST);
  assert.ok(befunde.some((b) => b.includes("hat keine Nummer")), befunde.join(" | "));
});

test("Autopiloten: ein NEUER Autopilot mit neuer Nummer bleibt erlaubt", async () => {
  const bestand = await nummernAusDerQuelle();
  const erweitert = [...bestand, { nummer: "99", id: "probe-neu", name: "Probe" }];
  const { befunde, neu } = pruefeAutopiloten(erweitert, AP_MANIFEST);
  assert.deepEqual(befunde, [], befunde.join(" | "));
  // "enthaelt" statt "ist gleich": zwischen zwei Einfrieren stehen auch echte
  // neue Autopiloten in dieser Liste — sie sind erlaubt, genau darum geht es.
  assert.ok(neu.some((n) => n.nummer === "99" && n.id === "probe-neu"), JSON.stringify(neu));
});

// ---- Admin-Menue -----------------------------------------------------------

const SEITEN = tabelle("SEITEN_NUMMERN");
const GRUPPEN = tabelle("GRUPPEN_NUMMERN");

test("Menue: die Tabellen stehen wirklich in console.js", () => {
  assert.equal(GRUPPEN["Überblick"], "1");
  assert.equal(SEITEN.cockpit, "1.1");
  assert.equal(Object.keys(SEITEN).length, registrierteSeiten().length);
});

test("Menue: der echte Stand deckt sich mit dem Manifest", () => {
  const { befunde } = pruefeMenue(SEITEN, GRUPPEN, registrierteSeiten(), MENUE_MANIFEST);
  assert.deepEqual(befunde, [], befunde.join(" | "));
});

test("Menue: eine umnummerierte Seite faellt auf", () => {
  const { befunde } = pruefeMenue({ ...SEITEN, cockpit: "9.9" }, GRUPPEN, registrierteSeiten(), MENUE_MANIFEST);
  assert.ok(befunde.some((b) => b.includes("cockpit") && b.includes("traegt jetzt")), befunde.join(" | "));
});

test("Menue: eine geloeschte Seite faellt auf", () => {
  const ohne = { ...SEITEN };
  delete ohne.autopiloten;
  const { befunde } = pruefeMenue(ohne, GRUPPEN, registrierteSeiten(), MENUE_MANIFEST);
  assert.ok(befunde.some((b) => b.includes("autopiloten") && b.includes("verschwunden")), befunde.join(" | "));
});

test("Menue: eine verschobene Gruppen-Ueberschrift faellt auf", () => {
  const { befunde } = pruefeMenue(SEITEN, { ...GRUPPEN, "Sicherheit": "7" }, registrierteSeiten(), MENUE_MANIFEST);
  assert.ok(befunde.some((b) => b.includes("Sicherheit") && b.includes("traegt jetzt")), befunde.join(" | "));
});

test("Menue: eine doppelt vergebene Nummer faellt auf", () => {
  const { befunde } = pruefeMenue({ ...SEITEN, regeln: "1.1" }, GRUPPEN, registrierteSeiten(), MENUE_MANIFEST);
  assert.ok(befunde.some((b) => b.includes("zweimal vergeben")), befunde.join(" | "));
});

test("Menue: eine registrierte Seite ohne Nummer faellt auf", () => {
  const { befunde } = pruefeMenue(SEITEN, GRUPPEN, [...registrierteSeiten(), "neue-seite"], MENUE_MANIFEST);
  assert.ok(befunde.some((b) => b.includes("neue-seite") && b.includes("keine Nummer")), befunde.join(" | "));
});

test("Menue: eine Karteileiche (Nummer ohne Seite) faellt auf", () => {
  const { befunde } = pruefeMenue({ ...SEITEN, gibtsnicht: "8.9" }, GRUPPEN, registrierteSeiten(), MENUE_MANIFEST);
  assert.ok(befunde.some((b) => b.includes("gibtsnicht") && b.includes("registriert")), befunde.join(" | "));
});
