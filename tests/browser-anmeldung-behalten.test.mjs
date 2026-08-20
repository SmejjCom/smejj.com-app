// smejj.com — der Fern-Browser verhaelt sich wie ein Browser, nicht wie ein
// Wegwerf-Fenster.
//
// BETREIBER-ANSAGE 2026-08-20 ("mach 1 zu 1 wie Chrome browser, Passwort
// einfuegen erlauben, angemeldet bleiben"). Drei Dinge machten Anmeldungen
// im Panel vorher praktisch unmoeglich:
//   1. Nach 90 s Untaetigkeit wurde der Browser GESCHLOSSEN — wer sein
//      Passwort sucht oder auf einen Code wartet, ist laenger still.
//   2. Tastenkombinationen wurden verworfen: ein Passwort aus dem Manager
//      liess sich nicht einfuegen, nur abtippen.
//   3. Ohne Profil begann jede Sitzung bei null — man war nie angemeldet.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { SESSION_DEFAULTS, SESSION_ALLOWED_COMBOS, validateSessionAction } from "../workers/remote-browser/session-engine.js";
import { profilKennung, validateSessionRequest } from "../control-server/src/routes/browserSessionRoutes.js";

test("die Zeitgrenzen erlauben eine echte Anmeldung", () => {
  // Untaetigkeit: mindestens eine Viertelstunde — Passwort suchen, Code
  // abwarten, zurueckkommen.
  assert.ok(SESSION_DEFAULTS.idleTimeoutMs >= 900_000,
    `Untaetigkeitsgrenze zu knapp: ${SESSION_DEFAULTS.idleTimeoutMs} ms`);
  // Gesamtdauer: mindestens eine Stunde.
  assert.ok(SESSION_DEFAULTS.hardLimitMs >= 3_600_000,
    `Gesamtdauer zu knapp: ${SESSION_DEFAULTS.hardLimitMs} ms`);
  // ... aber ENDLICH: jede Sitzung haelt einen echten Chrome offen.
  assert.ok(Number.isFinite(SESSION_DEFAULTS.hardLimitMs) && SESSION_DEFAULTS.hardLimitMs > 0);
});

test("Passwort einfuegen geht — gefaehrliche Kuerzel nicht", () => {
  assert.ok(SESSION_ALLOWED_COMBOS.has("ControlOrMeta+v"), "Einfuegen muss durchkommen");
  assert.equal(validateSessionAction({ type: "key", key: "ControlOrMeta+v" }).ok, true);
  // Nicht aufgefuehrte Kombinationen bleiben draussen (fail-closed).
  assert.equal(validateSessionAction({ type: "key", key: "ControlOrMeta+t" }).ok, false);
  assert.equal(validateSessionAction({ type: "key", key: "F12" }).ok, false);
  // Die Buehne im Browser schickt sie auch wirklich los.
  const buehne = fs.readFileSync("public/browser-stage.js", "utf8");
  assert.match(buehne, /ControlOrMeta\+/);
});

test("jedes Konto bekommt sein EIGENES Profil — und nur der Server vergibt es", () => {
  const a = profilKennung({ userId: "konto-a" });
  const b = profilKennung({ userId: "konto-b" });
  assert.ok(a && b);
  assert.notEqual(a, b, "zwei Konten duerfen nie dasselbe Profil teilen");
  assert.equal(a, profilKennung({ userId: "konto-a" }), "dasselbe Konto bekommt dasselbe Profil");
  assert.doesNotMatch(a, /konto-a/, "die Kennung darf niemanden verraten");
  // Ohne Anmeldung KEIN Profil — lieber fluechtig als fremde Cookies.
  assert.equal(profilKennung(null), null);
  assert.equal(profilKennung({}), null);
  // Ein Profil aus dem Anfragekoerper wird ignoriert: sonst koennte jemand
  // das Profil eines fremden Kontos anfordern.
  const gefaelscht = validateSessionRequest("open", { url: "https://example.com", profil: a }, null);
  assert.equal(gefaelscht.forward.profil, undefined);
  // Serverseitig abgeleitet geht es mit.
  assert.equal(validateSessionRequest("open", { url: "https://example.com" }, a).forward.profil, a);
});

test("ein Profilname mit Pfadanteilen bricht nicht aus dem Ordner aus", () => {
  const engine = fs.readFileSync("workers/remote-browser/session-engine.js", "utf8");
  // Strenge Form: nur Hex, keine Punkte, keine Schraegstriche.
  assert.match(engine, /\^\[a-f0-9\]\{16,64\}\$/);
});


// --- Die Falle, die die Verlaengerung selbst aufgestellt hat ----------------
//
// Betreiber 2026-08-20, direkt nach dem Ausrollen: "geht nicht, passwort feld
// kommt nicht". Der Netzmitschnitt zeigte /api/browser/session -> 429 und
// danach den Rueckfall auf den Standbild-Worker: in einem Standbild gibt es
// nichts zu tippen. Ursache war NICHT die Anmeldeseite, sondern das
// Sitzungslimit — solange Sitzungen nach 90 s starben, raeumten sie sich von
// selbst weg; mit 30 Minuten blockierten zwei vergessene beide Plaetze.
test("eine volle Sitzungsliste verdraengt die aelteste, statt abzulehnen", async () => {
  const engine = fs.readFileSync("workers/remote-browser/session-engine.js", "utf8");
  // Kein hartes Nein mehr beim Oeffnen ...
  assert.doesNotMatch(engine, /if \(sessions\.size >= cfg\.maxSessions\) return fail\(429/);
  // ... sondern Aufraeumen der aeltesten.
  assert.match(engine, /while \(sessions\.size >= cfg\.maxSessions\)/);
  assert.match(engine, /sort\(\(a, b\) => a\.createdAt - b\.createdAt\)/);
  assert.match(engine, /await destroy\(aelteste\.id\)/);
  // Und genug Plaetze, damit Verdraengung die Ausnahme bleibt.
  assert.ok(SESSION_DEFAULTS.maxSessions >= 4, `zu wenige Plaetze: ${SESSION_DEFAULTS.maxSessions}`);
});


// --- Tarnung ja, aber niemals auf Kosten der Verfuegbarkeit ----------------
//
// Recherche 2026-08-20: Google blockiert Anmeldungen aus automatisierten
// Browsern seit Januar 2021 ausdruecklich; headless ist das lauteste Signal,
// und navigator.webdriver meldet zusaetzlich von selbst "automatisiert".
// Deshalb laeuft der Fern-Browser headful auf einem virtuellen Bildschirm.
test("der Fern-Browser tarnt sich — und stirbt trotzdem nie am Bildschirm", () => {
  const engine = fs.readFileSync("workers/remote-browser/session-engine.js", "utf8");
  // Anti-Erkennung: das Flag setzt navigator.webdriver in der Engine auf false.
  assert.match(engine, /--disable-blink-features=AutomationControlled/);
  // Nicht mehr fest verdrahtet, sondern ueber die Umgebung schaltbar.
  assert.match(engine, /SMEJJ_BROWSER_HEADFUL/);
  assert.doesNotMatch(engine, /headless: true/, "kein fest verdrahtetes headless mehr");
  // --single-process ist raus: mit echtem Fensterbaum ist er instabil.
  // Geprueft wird die STARTLISTE, nicht die Datei — sonst schlaegt schon der
  // Kommentar an, der erklaert, warum das Flag fehlt.
  const liste = engine.slice(engine.indexOf("const startArgs = ["), engine.indexOf("];", engine.indexOf("const startArgs = [")));
  assert.doesNotMatch(liste, /--single-process/);
  assert.match(liste, /--disable-blink-features=AutomationControlled/);
  // DER NOTAUSGANG deckt den GANZEN Aufbau ab, nicht nur den Start:
  // gemessen 2026-08-21 startete headful sauber und starb erst beim ersten
  // Seitenaufbau. Ein Notausgang um launch() allein greift dann nicht.
  assert.match(engine, /async function baueAuf\(ohneBildschirm\)/);
  assert.match(engine, /baueAuf\(true\)/, "Rueckfall auf headless nach misslungenem Aufbau");
  assert.match(engine, /await b\.close\(\)/, "der misslungene Versuch wird aufgeraeumt, sonst bleibt ein Chrome zurueck");
  // Der Container startet den Worker DIREKT. Ein xvfb-run-Wrapper im CMD hat
  // am 2026-08-20 den ganzen Dienst am Hochkommen gehindert (live 502) —
  // der virtuelle Bildschirm gehoert in den Worker, wo sein Fehlschlag nur
  // den Browser kostet und nicht die Erreichbarkeit.
  const dockerfile = fs.readFileSync("workers/remote-browser/Dockerfile", "utf8");
  assert.doesNotMatch(dockerfile, /CMD \[.*xvfb-run/);
});
