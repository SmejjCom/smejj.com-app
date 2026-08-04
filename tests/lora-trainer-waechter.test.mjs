import assert from "node:assert/strict";
import test from "node:test";
import {
  STANDARD_BEREIT_FRIST_MS,
  bewerteWacht,
  erzeugeWachtGedaechtnis,
  leseSaladKoordinaten,
  leseWachtGrenzen,
  saladBestaetigtAusfall,
  stoppeContainerGruppe
} from "../workers/smejj-lora-loop/waechter.js";

const STUNDE = 60 * 60 * 1000;

test("Voreinstellung ist eine Stunde und der Waechter ist scharf", () => {
  const grenzen = leseWachtGrenzen({});
  assert.equal(grenzen.bereitFristMs, STANDARD_BEREIT_FRIST_MS);
  assert.equal(grenzen.bereitFristMs, STUNDE);
  assert.equal(grenzen.aktiv, true);
});

test("der Waechter bleibt scharf, wenn der Schalter Unsinn enthaelt", () => {
  // Nur das klare Wort AUS schaltet ab. Alles andere — leer, Tippfehler,
  // versehentliches "false" — laesst ihn scharf.
  for (const wert of ["", "  ", "false", "NEIN", "0", "off"]) {
    assert.equal(leseWachtGrenzen({ SMEJJ_LORA_WAECHTER: wert }).aktiv, true, `Wert ${JSON.stringify(wert)}`);
  }
  assert.equal(leseWachtGrenzen({ SMEJJ_LORA_WAECHTER: "aus" }).aktiv, false);
  assert.equal(leseWachtGrenzen({ SMEJJ_LORA_WAECHTER: " AUS " }).aktiv, false);
});

test("eine zusaetzliche Null kann den Waechter nicht abschalten", () => {
  // 60 Stunden statt 6 — genau der Tippfehler, der eine Bremse still aushebelt.
  const grenzen = leseWachtGrenzen({ SMEJJ_LORA_BEREIT_FRIST_MS: String(60 * STUNDE) });
  assert.equal(grenzen.bereitFristMs, 6 * STUNDE);
});

test("eine bereite Karte wird nie gestoppt, auch nicht nach Tagen", () => {
  const ergebnis = bewerteWacht({ erreichbar: true, bereit: true, nichtBereitSeitMs: 3 * 24 * STUNDE });
  assert.equal(ergebnis.stoppen, false);
});

test("kurz vor der Frist wird nicht gestoppt, ab der Frist schon", () => {
  const grenzen = leseWachtGrenzen({});
  const knappDavor = bewerteWacht(
    { erreichbar: true, bereit: false, nichtBereitSeitMs: STUNDE - 1 }, grenzen
  );
  assert.equal(knappDavor.stoppen, false);

  const genau = bewerteWacht({ erreichbar: true, bereit: false, nichtBereitSeitMs: STUNDE }, grenzen);
  assert.equal(genau.stoppen, true);
  assert.match(genau.grund, /nicht_bereit_seit_60min/);
});

test("ein unerreichbarer Trainer bekommt einen eigenen, unterscheidbaren Grund", () => {
  const ergebnis = bewerteWacht({ erreichbar: false, bereit: false, nichtBereitSeitMs: 2 * STUNDE });
  assert.equal(ergebnis.stoppen, true);
  assert.match(ergebnis.grund, /unerreichbar_seit_120min/);
});

test("ein laufender Zyklus wird vom Waechter nie abgeraeumt", () => {
  // Waehrend eines Zyklus meldet der Trainer nicht zwingend bereit=true.
  // Zustaendig ist dann der Laufzeitdeckel in budget.js, der die investierte
  // Rechenzeit kennt — der Waechter wuerde sie wegwerfen.
  const ergebnis = bewerteWacht({
    erreichbar: true, bereit: false, nichtBereitSeitMs: 5 * STUNDE, zyklusLaeuft: true
  });
  assert.equal(ergebnis.stoppen, false);
});

test("ohne belastbare Zeitangabe wird nicht gestoppt", () => {
  for (const wert of [undefined, null, NaN, -1, "spaeter"]) {
    assert.equal(
      bewerteWacht({ erreichbar: true, bereit: false, nichtBereitSeitMs: wert }).stoppen,
      false,
      `Wert ${String(wert)}`
    );
  }
});

test("abgeschaltet stoppt der Waechter auch nach Tagen nichts", () => {
  const grenzen = leseWachtGrenzen({ SMEJJ_LORA_WAECHTER: "AUS" });
  assert.equal(
    bewerteWacht({ erreichbar: false, bereit: false, nichtBereitSeitMs: 3 * 24 * STUNDE }, grenzen).stoppen,
    false
  );
});

test("das Gedaechtnis zaehlt ununterbrochene Nichtbereitschaft und setzt bei bereit zurueck", () => {
  let uhr = 1_000_000;
  const gedaechtnis = erzeugeWachtGedaechtnis(() => uhr);

  assert.equal(gedaechtnis.melde(false), 0, "erste Meldung startet die Uhr");
  uhr += 30 * 60 * 1000;
  assert.equal(gedaechtnis.melde(false), 30 * 60 * 1000);

  // Ein einziges bereit=true loescht die Vorgeschichte — sonst wuerde eine
  // Karte, die zwischendurch laeuft, irgendwann grundlos abgeraeumt.
  assert.equal(gedaechtnis.melde(true), 0);
  uhr += 10 * 60 * 1000;
  assert.equal(gedaechtnis.melde(false), 0, "nach bereit beginnt die Zaehlung neu");
  uhr += 5 * 60 * 1000;
  assert.equal(gedaechtnis.melde(false), 5 * 60 * 1000);
});

test("Gedaechtnis und Bewertung ergeben zusammen den 60-Minuten-Selbststopp", () => {
  let uhr = 0;
  const gedaechtnis = erzeugeWachtGedaechtnis(() => uhr);
  const grenzen = leseWachtGrenzen({});
  const entscheidung = () => bewerteWacht(
    { erreichbar: true, bereit: false, nichtBereitSeitMs: gedaechtnis.melde(false) }, grenzen
  );

  // 59 Minuten Anlauf sind erlaubt.
  for (let minute = 0; minute < 60; minute += 1) {
    assert.equal(entscheidung().stoppen, false, `Minute ${minute}`);
    uhr += 60 * 1000;
  }
  // Die 60. Minute beendet die Karte.
  assert.equal(entscheidung().stoppen, true);
});

// ─── Der Waechter darf nicht seine eigene Leitung diagnostizieren ──────────

test("ohne bestaetigten Ausfall wird eine unerreichbare Karte NICHT gestoppt", () => {
  // Gemessen am 2026-08-04: die Dauerwache meldete "fetch failed", waehrend der
  // Trainer nachweislich gesund war (3x HTTP 200). Ein laengerer Netzausfall auf
  // der Waechterseite haette so eine gesunde, bezahlte GPU beendet.
  const ergebnis = bewerteWacht({
    erreichbar: false, bereit: false, nichtBereitSeitMs: 5 * STUNDE, ausfallBestaetigt: false
  });
  assert.equal(ergebnis.stoppen, false);
  assert.match(ergebnis.grund, /unerreichbar_ohne_zweitmeinung_seit_300min/);
});

test("mit bestaetigtem Ausfall wird dieselbe Lage sehr wohl gestoppt", () => {
  const ergebnis = bewerteWacht({
    erreichbar: false, bereit: false, nichtBereitSeitMs: 5 * STUNDE, ausfallBestaetigt: true
  });
  assert.equal(ergebnis.stoppen, true);
  assert.match(ergebnis.grund, /unerreichbar_seit_300min/);
});

test("die Zweitmeinung entschuldigt einen ERREICHBAREN, aber nicht bereiten Trainer nicht", () => {
  // Antwortet der Trainer und meldet dabei 'nicht bereit', ist das Netz
  // offensichtlich in Ordnung — der fehlende Beleg darf hier nichts retten,
  // sonst waere die Bremse mit einem Feldwert abschaltbar.
  const ergebnis = bewerteWacht({
    erreichbar: true, bereit: false, nichtBereitSeitMs: 5 * STUNDE, ausfallBestaetigt: false
  });
  assert.equal(ergebnis.stoppen, true);
  assert.match(ergebnis.grund, /nicht_bereit_seit_300min/);
});

test("die Zweitmeinung ist standardmaessig angenommen (alte Aufrufer bleiben gueltig)", () => {
  const ergebnis = bewerteWacht({ erreichbar: false, bereit: false, nichtBereitSeitMs: 2 * STUNDE });
  assert.equal(ergebnis.stoppen, true);
});

// ─── Koordinaten und der tatsaechliche Stopp ────────────────────────────────

test("fehlende Salad-Koordinaten machen den Waechter erkennbar zahnlos", () => {
  const leer = leseSaladKoordinaten({});
  assert.equal(leer.vollstaendig, false);
  assert.deepEqual([...leer.fehlend].sort(), ["SALAD_ORGANIZATION_NAME", "SALAD_PROJECT_NAME", "SMEJJ_LORA_TRAINER_KEY"]);
  // Die Gruppe hat einen brauchbaren Standard, sie fehlt nie.
  assert.equal(leer.gruppe, "smejj-lora-trainer");
});

test("der Loop-Schluessel gilt als Salad-Schluessel", () => {
  // SMEJJ_LORA_TRAINER_KEY IST der Salad-Schluessel — dieselbe Zeichenkette
  // oeffnet Gateway und API. Ohne diese Gleichsetzung waere im Zeabur-Dienst
  // eine zweite, identische Variable noetig.
  const k = leseSaladKoordinaten({
    SALAD_ORGANIZATION_NAME: "smejjcom",
    SALAD_PROJECT_NAME: "default",
    SMEJJ_LORA_TRAINER_KEY: "schluessel-123"
  });
  assert.equal(k.vollstaendig, true);
  assert.equal(k.apiKey, "schluessel-123");
});

test("ohne Koordinaten wird gar nicht erst gesendet", async () => {
  let gerufen = 0;
  const ergebnis = await stoppeContainerGruppe({
    koordinaten: leseSaladKoordinaten({}),
    fetchImpl: async () => { gerufen += 1; return { status: 202 }; }
  });
  assert.equal(ergebnis.ok, false);
  assert.equal(gerufen, 0, "ohne Schluessel darf kein Aufruf hinausgehen");
  assert.match(ergebnis.fehler, /koordinaten_fehlen/);
});

test("der Stopp trifft die richtige Adresse und akzeptiert 202", async () => {
  const gesehen = [];
  const koordinaten = leseSaladKoordinaten({
    SALAD_ORGANIZATION_NAME: "smejjcom",
    SALAD_PROJECT_NAME: "default",
    SMEJJ_LORA_TRAINER_KEY: "schluessel-123"
  });
  const ergebnis = await stoppeContainerGruppe({
    koordinaten,
    fetchImpl: async (url, optionen) => { gesehen.push({ url, optionen }); return { status: 202 }; }
  });
  assert.equal(ergebnis.ok, true, "202 Accepted ist Salads Quittung fuer den Stopp");
  assert.equal(gesehen.length, 1);
  assert.equal(
    gesehen[0].url,
    "https://api.salad.com/api/public/organizations/smejjcom/projects/default/containers/smejj-lora-trainer/stop"
  );
  assert.equal(gesehen[0].optionen.method, "POST");
  assert.equal(gesehen[0].optionen.headers["Salad-Api-Key"], "schluessel-123");
});

test("ein fehlgeschlagener Stopp wird NICHT als erledigt gemeldet", async () => {
  const koordinaten = leseSaladKoordinaten({
    SALAD_ORGANIZATION_NAME: "o", SALAD_PROJECT_NAME: "p", SMEJJ_LORA_TRAINER_KEY: "k"
  });
  const abgelehnt = await stoppeContainerGruppe({ koordinaten, fetchImpl: async () => ({ status: 500 }) });
  assert.equal(abgelehnt.ok, false);
  assert.equal(abgelehnt.fehler, "http_500");

  const geplatzt = await stoppeContainerGruppe({
    koordinaten, fetchImpl: async () => { throw new Error("netz weg"); }
  });
  assert.equal(geplatzt.ok, false);
  assert.match(geplatzt.fehler, /netz weg/);
});

// ─── Die Zweitmeinung: Salads eigenes Bereitschaftsurteil ───────────────────

const KOORD = leseSaladKoordinaten({
  SALAD_ORGANIZATION_NAME: "smejjcom", SALAD_PROJECT_NAME: "default", SMEJJ_LORA_TRAINER_KEY: "k"
});

test("Salad meldet eine bereite Instanz -> Ausfall NICHT bestaetigt", async () => {
  // Der Fall vom 2026-08-04: der Waechter kam nicht durch, Salads Sonde schon.
  const bestaetigt = await saladBestaetigtAusfall({
    koordinaten: KOORD,
    fetchImpl: async () => ({ ok: true, json: async () => ({ instances: [{ ready: true, state: "running" }] }) })
  });
  assert.equal(bestaetigt, false, "eine bediente Instanz darf nie abgeschaltet werden");
});

test("Salad meldet KEINE bereite Instanz -> Ausfall bestaetigt", async () => {
  const bestaetigt = await saladBestaetigtAusfall({
    koordinaten: KOORD,
    fetchImpl: async () => ({ ok: true, json: async () => ({ instances: [{ ready: false, state: "running" }] }) })
  });
  assert.equal(bestaetigt, true);
});

test("gar keine Instanz -> Ausfall bestaetigt", async () => {
  const bestaetigt = await saladBestaetigtAusfall({
    koordinaten: KOORD, fetchImpl: async () => ({ ok: true, json: async () => ({ instances: [] }) })
  });
  assert.equal(bestaetigt, true);
});

test("Salad-API unerreichbar -> Ausfall NICHT bestaetigt (Waechter ist blind)", async () => {
  const geplatzt = await saladBestaetigtAusfall({
    koordinaten: KOORD, fetchImpl: async () => { throw new Error("fetch failed"); }
  });
  assert.equal(geplatzt, false);

  const abgelehnt = await saladBestaetigtAusfall({
    koordinaten: KOORD, fetchImpl: async () => ({ ok: false, status: 500 })
  });
  assert.equal(abgelehnt, false, "eine kaputte API ist kein Beweis fuer einen kaputten Trainer");
});

test("ohne Koordinaten wird nichts bestaetigt und nichts gesendet", async () => {
  let gerufen = 0;
  const bestaetigt = await saladBestaetigtAusfall({
    koordinaten: leseSaladKoordinaten({}), fetchImpl: async () => { gerufen += 1; return { ok: true }; }
  });
  assert.equal(bestaetigt, false);
  assert.equal(gerufen, 0);
});

// ─── Messluecken: was nicht beobachtet wurde, zaehlt nicht ──────────────────

test("eine Messluecke setzt die Uhr zurueck statt sie weiterlaufen zu lassen", () => {
  // Beobachtet am 2026-08-04: zwischen zwei Meldungen lagen 2 h 45 min statt
  // einer Minute — der Rechner hatte geschlafen. Ohne diese Bremse stuende die
  // Uhr nach dem Aufwachen sofort ueber der Frist, und EINE danebengegangene
  // Abfrage koennte eine gesunde Karte beenden.
  let uhr = 0;
  const takt = 60 * 1000;
  const gedaechtnis = erzeugeWachtGedaechtnis(() => uhr, { maxLueckeMs: takt * 4 });

  gedaechtnis.melde(false);
  uhr += takt;
  assert.equal(gedaechtnis.melde(false), takt, "im Takt zaehlt die Uhr normal");

  // Der Rechner schlaeft 2 h 45 min.
  uhr += 165 * 60 * 1000;
  assert.equal(gedaechtnis.melde(false), 0, "nach der Luecke beginnt die Zaehlung neu");

  uhr += takt;
  assert.equal(gedaechtnis.melde(false), takt, "danach laeuft sie wieder normal");
});

test("kleine Schwankungen im Takt gelten NICHT als Luecke", () => {
  // Ein verzoegerter Takt darf die Uhr nicht zuruecksetzen, sonst kaeme eine
  // langsam schleichende Stoerung nie ueber die Frist.
  let uhr = 0;
  const takt = 60 * 1000;
  const gedaechtnis = erzeugeWachtGedaechtnis(() => uhr, { maxLueckeMs: takt * 4 });

  gedaechtnis.melde(false);
  // Fuenf Takte, jeder doppelt so lang wie geplant — aber JEDER wird gemeldet,
  // also ist keine Luecke groesser als die Grenze.
  for (let i = 0; i < 5; i += 1) {
    uhr += takt * 2;
    gedaechtnis.melde(false);
  }
  assert.equal(gedaechtnis.melde(false), takt * 10, "zaehlt durch");
});

test("ohne maxLueckeMs verhaelt sich das Gedaechtnis wie bisher", () => {
  let uhr = 0;
  const gedaechtnis = erzeugeWachtGedaechtnis(() => uhr);
  gedaechtnis.melde(false);
  uhr += 5 * 60 * 60 * 1000;
  assert.equal(gedaechtnis.melde(false), 5 * 60 * 60 * 1000);
});
