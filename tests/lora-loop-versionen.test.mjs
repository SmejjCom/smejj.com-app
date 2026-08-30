import assert from "node:assert/strict";
import test from "node:test";
import { leseKostengrenzen } from "../workers/smejj-lora-loop/budget.js";
import { fuehreZyklusAus } from "../workers/smejj-lora-loop/cycle.js";
import { erzeugeLoop } from "../workers/smejj-lora-loop/loop.js";
import {
  leseRegister,
  schreibeRegister
} from "../workers/smejj-lora-loop/state.js";
import { ladeLoopKonfiguration } from "../workers/smejj-lora-loop/config.js";
import {
  leeresRegister,
  naechsteVersion,
  registerMitEintrag,
  versionsAnzeige,
  versionsEintrag,
  VERSIONS_MUSTER
} from "../workers/smejj-lora-loop/versionen.js";

const BASIS_REPO = "Qwen/Qwen3-8B";

// --- das Schema selbst ---

test("das Schema erkennt nur die Schlüsselform smejj-<haupt>-<neben>", () => {
  assert.ok(VERSIONS_MUSTER.test("smejj-1-0"));
  assert.ok(VERSIONS_MUSTER.test("smejj-12-3"));
  assert.equal(VERSIONS_MUSTER.test("smejj-1.0"), false);
  assert.equal(VERSIONS_MUSTER.test("smejj-1-0-irgendwas"), false);
  assert.equal(VERSIONS_MUSTER.test(""), false);
});

test("Anzeigeform: smejj-1-1 wird zu smejj 1.1", () => {
  assert.equal(versionsAnzeige("smejj-1-1"), "smejj 1.1");
  assert.equal(versionsAnzeige("smejj-2-0"), "smejj 2.0");
  assert.equal(versionsAnzeige(" Unsinn"), null);
  assert.equal(versionsAnzeige(null), null);
});

test("ohne bisherigen Stand wird die erste Version smejj-1-0", () => {
  assert.deepEqual(naechsteVersion(null, BASIS_REPO).version, "smejj-1-0");
});

test("ohne Basismodell gibt es keine Version (fail-closed)", () => {
  const ergebnis = naechsteVersion(null, "");
  assert.equal(ergebnis.version, null);
  assert.ok(ergebnis.gruende.includes("kein_basismodell"));
});

test("Vor-Schema-Stand (kein Versionsfeld) zaehlt als smejj-1-0 — der Nachfolger wird smejj-1-1", () => {
  // Der reale bester-stand von vor diesem Schema: kein version, kein basismodell.
  const stand = { punktzahl: 0.9, adapterSchluessel: "checkpoints/smejj-1-0/alt/adapter.safetensors" };
  assert.deepEqual(naechsteVersion(stand, BASIS_REPO).version, "smejj-1-1");
});

test("gleiche Basis: Nebenversion waechst", () => {
  const stand = {
    version: "smejj-1-3",
    basismodell: { hfRepo: BASIS_REPO }
  };
  assert.deepEqual(naechsteVersion(stand, BASIS_REPO).version, "smejj-1-4");
});

test("neue Basis (im Stand mitgefuehrt): neue Hauptversion, Neben zurueck auf 0", () => {
  const stand = {
    version: "smejj-1-3",
    basismodell: { hfRepo: BASIS_REPO }
  };
  assert.deepEqual(naechsteVersion(stand, "Qwen/Qwen3-14B").version, "smejj-2-0");
});

test("neue Basis (explizit uebergeben): neue Hauptversion", () => {
  const stand = { version: "smejj-4-7" };
  assert.deepEqual(
    naechsteVersion(stand, "Qwen/Qwen3-14B", BASIS_REPO).version,
    "smejj-5-0"
  );
});

// --- der Metadatensatz ---

const gueltigeEingabe = () => ({
  version: "smejj-1-1",
  konfiguration: { kennung: "lr5e-5-r8-p1-e1" },
  kennzahlen: { punktzahl: 0.92, kritischeFehler: 0, faelle: 34, bestanden: 32, wiederholungen: 3 },
  adapterSchluessel: "checkpoints/smejj-1-0/lauf-9/adapter.safetensors",
  basismodell: { hfRepo: BASIS_REPO, revision: "main", lizenz: "apache-2.0" },
  datensatz: { schluessel: "datasets/smejj-1-1/v1/train.jsonl", manifestSchluessel: "datasets/smejj-1-1/v1/manifest.json" },
  freigabeId: "freigabe-2026-08-01-dauertraining",
  zyklusIndex: 9,
  gemessenAm: "2026-08-30T12:00:00.000Z"
});

test("ein Versionseintrag traegt alle Befoerderungs-Metadaten und bleibt ungeprueft (not-approved)", () => {
  const eintrag = versionsEintrag(gueltigeEingabe());
  assert.equal(eintrag.version, "smejj-1-1");
  assert.equal(eintrag.anzeige, "smejj 1.1");
  assert.equal(eintrag.promotionStatus, "not-approved");
  assert.equal(eintrag.basismodell.hfRepo, BASIS_REPO);
  assert.equal(eintrag.adapterSchluessel, gueltigeEingabe().adapterSchluessel);
  assert.equal(eintrag.kennzahlen.punktzahl, 0.92);
  assert.equal(eintrag.freigabeId, "freigabe-2026-08-01-dauertraining");
});

test("ohne dauerhaftes Artefakt KEINE Version", () => {
  // Dieselbe Regel wie motor.py: ein Lauf ohne Artefakt ist kein Ergebnis.
  const eingabe = gueltigeEingabe();
  delete eingabe.adapterSchluessel;
  assert.throws(() => versionsEintrag(eingabe), /adapter_schluessel_fehlt/);
});

test("ohne messbare Punktzahl KEINE Version", () => {
  const eingabe = gueltigeEingabe();
  eingabe.kennzahlen = { kritischeFehler: 0 };
  assert.throws(() => versionsEintrag(eingabe), /punktzahl_ungueltig/);
});

test("ein ungueltiger Versionsname wird nicht vergeben", () => {
  const eingabe = gueltigeEingabe();
  eingabe.version = "smejj 1.1";
  assert.throws(() => versionsEintrag(eingabe), /versionsname_ungueltig/);
});

// --- das Register ---

test("ein neuer Eintrag wird aktiv und steht vorn", () => {
  const erster = versionsEintrag({ ...gueltigeEingabe(), version: "smejj-1-0" });
  const zweiter = versionsEintrag({ ...gueltigeEingabe(), version: "smejj-1-1" });
  let register = registerMitEintrag(leeresRegister(), erster);
  assert.equal(register.aktiveVersion, "smejj-1-0");
  assert.equal(register.eintraege.length, 1);
  register = registerMitEintrag(register, zweiter);
  assert.equal(register.aktiveVersion, "smejj-1-1");
  assert.equal(register.eintraege[0].version, "smejj-1-1");
  assert.equal(register.eintraege[1].version, "smejj-1-0");
});

test("das Register haelt bei REGISTER_MAX Eintraegen", () => {
  let register = leeresRegister();
  for (let neben = 0; neben < 201; neben += 1) {
    register = registerMitEintrag(register, versionsEintrag({
      ...gueltigeEingabe(),
      version: `smejj-1-${neben}`
    }));
  }
  assert.equal(register.eintraege.length, 200);
});

// --- state.js: Register in der Ablage ---

function speicherAblage() {
  const map = new Map();
  return {
    map,
    request: async (config, methode, schluessel, koerper) => {
      if (methode === "GET") {
        if (!map.has(schluessel)) throw new Error(`idrive_404:${schluessel}`);
        return map.get(schluessel);
      }
      if (methode === "PUT") {
        map.set(schluessel, koerper);
        return "";
      }
      throw new Error(`unbekannte_methode:${methode}`);
    }
  };
}

const ABLAGE = { idriveConfig: { pruefung: true }, key: "ops/smejj-lora-loop/versionen.json" };

test("leseRegister: 404 liefert das leere Register, jeder andere Fehler wird geworfen", async () => {
  const ablage = speicherAblage();
  const leer = await leseRegister({ ...ABLAGE, request: ablage.request });
  assert.deepEqual(leer, leeresRegister());
  ablage.map.set(ABLAGE.key, "{kaputt");
  await assert.rejects(() => leseRegister({ ...ABLAGE, request: ablage.request }));
});

test("schreibeRegister legt ab und meldet Erfolg", async () => {
  const ablage = speicherAblage();
  const ok = await schreibeRegister(registerMitEintrag(leeresRegister(), versionsEintrag(gueltigeEingabe())), { ...ABLAGE, request: ablage.request });
  assert.equal(ok, true);
  assert.ok(ablage.map.get(ABLAGE.key).includes("smejj-1-1"));
});

test("schreibeRegister meldet einen Fehlschlag statt ihn zu schlucken", async () => {
  const ok = await schreibeRegister(leeresRegister(), { ...ABLAGE, request: async () => { throw new Error("leitungsstoerung"); } });
  assert.equal(ok, false);
});

// --- Integration Zyklus: nur ein Gate-Sieger bekommt eine Version ---

function zyklusBasis(overrides = {}) {
  const gespeichert = { bester: null, register: [] };
  return {
    grenzen: GRENZEN(),
    zyklusIndex: 0,
    verbrauchtUsd: 0,
    besterStand: null,
    basismodell: { hfRepo: BASIS_REPO },
    datensatz: { schluessel: "datasets/smejj-1-1/v1/train.jsonl", manifestSchluessel: "datasets/smejj-1-1/v1/manifest.json" },
    trainerBasisUrl: "https://trainer.example",
    pruefeDaten: async () => ({ vorhanden: true }),
    messe: async () => ({ ok: true, kennzahlen: { punktzahl: 0.9, kritischeFehler: 0, faelle: 34, bestanden: 32, wiederholungen: 3 } }),
    speichereBesten: async (stand) => { gespeichert.bester = stand; return true; },
    speichereVersion: async (eintrag) => { gespeichert.register.push(eintrag); return true; },
    fetchImpl: zyklusTrainerFetch(),
    warte: async () => {},
    abfrageAbstandMs: 1,
    jetzt: () => new Date("2026-08-30T12:00:00Z"),
    gespeichert,
    ...overrides
  };
}

function GRENZEN() {
  return leseKostengrenzen({
    SMEJJ_LORA_GPU_KLASSE: "rtx3090",
    SMEJJ_LORA_MAX_USD_GESAMT: "50",
    SMEJJ_LORA_MAX_ZYKLUS_MINUTEN: "45",
    SMEJJ_LORA_FREIGABE_ID: "freigabe-2026-08-01-dauertraining",
    SMEJJ_LORA_FREIGABE_GPU_KLASSE: "rtx3090",
    SMEJJ_LORA_FREIGABE_MONATSBETRAG_USD: "180"
  });
}

function zyklusTrainerFetch() {
  return async (url) => {
    const pfad = String(url);
    if (pfad.endsWith("/health")) return antwort(200, {});
    if (pfad.endsWith("/training/start")) return antwort(200, { laufId: "lauf-9" });
    if (pfad.includes("/training/status/")) {
      return antwort(200, {
        zustand: "fertig",
        adapterSchluessel: "checkpoints/smejj-1-0/lauf-9/adapter.safetensors",
        messEndpunkt: "https://trainer.example/v1/chat/completions",
        gelaufeneMinuten: 12
      });
    }
    if (pfad.includes("/training/abort/")) return antwort(200, { ok: true });
    return antwort(404, {});
  };
}

function antwort(status, daten) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(daten) };
}

test("erster Gate-Sieger: Version smejj-1-0 im besten-stand UND im Register", async () => {
  const aufbau = zyklusBasis();
  const ergebnis = await fuehreZyklusAus(aufbau);
  assert.equal(ergebnis.besser, true);
  assert.equal(ergebnis.version, "smejj-1-0");
  assert.equal(ergebnis.versionAbgelegt, true);
  assert.equal(aufbau.gespeichert.bester.version, "smejj-1-0");
  assert.equal(aufbau.gespeichert.bester.basismodell.hfRepo, BASIS_REPO);
  assert.equal(aufbau.gespeichert.register.length, 1);
  assert.equal(aufbau.gespeichert.register[0].adapterSchluessel, "checkpoints/smejj-1-0/lauf-9/adapter.safetensors");
});

test("Verlierer bekommt KEINE Version", async () => {
  const aufbau = zyklusBasis({
    besterStand: { version: "smejj-1-2", basismodell: { hfRepo: BASIS_REPO }, punktzahl: 0.95 },
    messe: async () => ({ ok: true, kennzahlen: { punktzahl: 0.9, kritischeFehler: 0, faelle: 34, bestanden: 32, wiederholungen: 3 } })
  });
  const ergebnis = await fuehreZyklusAus(aufbau);
  assert.equal(ergebnis.besser, false);
  assert.equal(ergebnis.version, null);
  assert.equal(aufbau.gespeichert.register.length, 0);
});

test("Register-Ausfall veraendert den besten-stand NICHT, wird aber laut gemeldet", async () => {
  const aufbau = zyklusBasis({ speichereVersion: async () => false });
  const ergebnis = await fuehreZyklusAus(aufbau);
  assert.equal(ergebnis.alsBestemGespeichert, true);
  assert.equal(ergebnis.versionAbgelegt, false);
});

test("ein Kandidat ohne Artefakt kann das Gate passieren, bekommt aber keine Version (lauter Fehlschlag)", async () => {
  // Der Trainer-Schluessel fehlt im Status: speichereBesten wuerde einen
  // verweislosen Stand schreiben. Die Version verweigert das — und der Zyklus
  // muss das sichtbar machen.
  const aufbau = zyklusBasis();
  aufbau.fetchImpl = async (url) => {
    const pfad = String(url);
    if (pfad.endsWith("/health")) return antwort(200, {});
    if (pfad.endsWith("/training/start")) return antwort(200, { laufId: "lauf-9" });
    if (pfad.includes("/training/status/")) {
      return antwort(200, { zustand: "fertig", adapterSchluessel: null, messEndpunkt: "https://trainer.example/v1/chat/completions", gelaufeneMinuten: 12 });
    }
    return antwort(404, {});
  };
  const ergebnis = await fuehreZyklusAus(aufbau);
  assert.equal(ergebnis.version, null);
  assert.equal(aufbau.gespeichert.register.length, 0);
});

// --- Integration Loop: aktive Version in /health und Register in der Ablage ---

const LOOP_ENV = {
  SMEJJ_LORA_LOOP_ENABLED: "YES",
  SMEJJ_LORA_TRAINING_ENABLED: "YES",
  SMEJJ_LORA_GPU_KLASSE: "rtx3090",
  SMEJJ_LORA_MAX_USD_GESAMT: "50",
  SMEJJ_LORA_MAX_ZYKLUS_MINUTEN: "45",
  SMEJJ_LORA_FREIGABE_ID: "freigabe-2026-08-01-dauertraining",
  SMEJJ_LORA_FREIGABE_GPU_KLASSE: "rtx3090",
  SMEJJ_LORA_FREIGABE_MONATSBETRAG_USD: "180",
  SMEJJ_LORA_BASIS_HF_REPO: BASIS_REPO,
  SMEJJ_LORA_DATENSATZ_SCHLUESSEL: "datasets/smejj-1-1/v1/train.jsonl",
  SMEJJ_LORA_DATENSATZ_MANIFEST: "datasets/smejj-1-1/v1/manifest.json",
  SMEJJ_LORA_TRAINER_URL: "https://trainer.example",
  SMEJJ_LORA_TRAINER_KEY: "testschluessel"
};

test("Loop-Ende-zu-Ende: Gewinn schreibt Version in besten-stand, Register und Status", async () => {
  const ablage = speicherAblage();
  const config = ladeLoopKonfiguration(LOOP_ENV);
  const loop = erzeugeLoop({
    config,
    env: LOOP_ENV,
    log: () => {},
    deps: {
      idriveConfig: { pruefung: true },
      zustandRequest: ablage.request,
      bestenRequest: ablage.request,
      versionsRequest: ablage.request,
      pruefeDaten: async () => ({ vorhanden: true }),
      messe: async () => ({ ok: true, kennzahlen: { punktzahl: 0.9, kritischeFehler: 0, faelle: 34, bestanden: 32, wiederholungen: 3 } }),
      fetchImpl: zyklusTrainerFetch(),
      warte: async () => {}
    }
  });

  const zustand = await loop.tick();
  assert.equal(zustand.zyklenGestartet, 1);
  assert.equal(loop.getStatus().aktiveVersion, "smejj-1-0");

  const bester = JSON.parse(ablage.map.get(config.bestenKey));
  assert.equal(bester.version, "smejj-1-0");
  assert.equal(bester.promotionStatus, "not-approved");

  const register = JSON.parse(ablage.map.get(config.versionsKey));
  assert.equal(register.aktiveVersion, "smejj-1-0");
  assert.equal(register.eintraege[0].version, "smejj-1-0");
  assert.equal(register.eintraege[0].basismodell.hfRepo, BASIS_REPO);
});

test("Loop-Ende-zu-Ende: zweiter Gewinn wird smejj-1-1 (Nebenversion)", async () => {
  const ablage = speicherAblage();
  const config = ladeLoopKonfiguration(LOOP_ENV);
  // Jeder Lauf misst besser als der vorige — sonst waere er korrekt verworfen.
  let punktzahl = 0.9;
  const loop = erzeugeLoop({
    config,
    env: LOOP_ENV,
    log: () => {},
    deps: {
      idriveConfig: { pruefung: true },
      zustandRequest: ablage.request,
      bestenRequest: ablage.request,
      versionsRequest: ablage.request,
      pruefeDaten: async () => ({ vorhanden: true }),
      messe: async () => {
        punktzahl += 0.05;
        return { ok: true, kennzahlen: { punktzahl, kritischeFehler: 0, faelle: 34, bestanden: 33, wiederholungen: 3 } };
      },
      fetchImpl: zyklusTrainerFetch(),
      warte: async () => {}
    }
  });

  await loop.tick(() => new Date("2026-08-30T12:00:00Z"));
  assert.equal(loop.getStatus().aktiveVersion, "smejj-1-0");

  // Zweiter Takt NACH dem Zyklusabstand (Standard 10 Minuten): neuer Index,
  // neuer Lauf, erneut Bester — dieselbe Basis.
  await loop.tick(() => new Date("2026-08-30T12:11:00Z"));
  assert.equal(loop.getStatus().aktiveVersion, "smejj-1-1");
  const register = JSON.parse(ablage.map.get(config.versionsKey));
  assert.equal(register.aktiveVersion, "smejj-1-1");
  assert.equal(register.eintraege.length, 2);
});
