// smejj.com — Unit-Tests fuer die Bestandssicht (Modul G2).
//
// Drei Dinge muessen stimmen, sonst ist der Bildschirm gefaehrlicher als keiner:
//   1. Eine Datei OHNE Motor darf nicht gruen sein. Sie kann nicht laufen —
//      egal wie vollstaendig sie in e2 liegt.
//   2. Ein Motor, dessen Lebenszeichen alt ist, muss "stumm" heissen. Ein Mac
//      hinter smee.io ist von aussen nicht anpingbar; das Schweigen IST das
//      Signal.
//   3. Eine abgeschnittene Zaehlung muss sich als abgeschnitten zu erkennen
//      geben — dieselbe Regel wie in Modul U.
//
// Ausfuehren: node --test control-server/src/admin/opsModellbestand.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { modellbestandUebersicht } from "./opsModellbestand.js";

const ENV = Object.freeze({
  IDRIVE_E2_ENDPOINT: "https://beispiel.example",
  IDRIVE_E2_ACCESS_KEY: "zugang",
  IDRIVE_E2_SECRET_KEY: "geheim",
  IDRIVE_E2_BUCKET: "haupteimer",
  IDRIVE_E2_DEPLOY_BUCKET: "deployeimer"
});

const JETZT = Date.parse("2026-09-08T12:00:00.000Z");

function listeXml(eintraege, { abgeschnitten = false, token = "" } = {}) {
  const inhalt = eintraege
    .map((e) => `<Contents><Key>${e.key}</Key><Size>${e.size}</Size>`
      + `<LastModified>${e.at || "2026-09-01T00:00:00.000Z"}</LastModified></Contents>`)
    .join("");
  return `<?xml version="1.0"?><ListBucketResult>${inhalt}`
    + `<IsTruncated>${abgeschnitten}</IsTruncated>`
    + (token ? `<NextContinuationToken>${token}</NextContinuationToken>` : "")
    + "</ListBucketResult>";
}

/** Baut ein fetch, das Auflistungen und Einzelabrufe aus festen Tabellen bedient. */
function fakeFetch({ listen = {}, dateien = {} } = {}) {
  return async (url) => {
    const adresse = new URL(String(url));
    const prefix = adresse.searchParams.get("prefix");
    const koerper = prefix !== null
      ? (listen[prefix] ?? listeXml([]))
      : (dateien[decodeURIComponent(adresse.pathname.split("/").slice(2).join("/"))] ?? "");
    const bytes = Buffer.from(koerper, "utf8");
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => koerper,
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    };
  };
}

test("eine Datei ohne Motor ist unbrauchbar, nicht gruen", async () => {
  const bestand = await modellbestandUebersicht({
    env: ENV,
    jetzt: JETZT,
    fetchImpl: fakeFetch({
      listen: {
        "model-files/": listeXml([
          { key: "model-files/riesenmodell/gewichte.safetensors", size: 704_000_000_000 }
        ])
      }
    })
  });

  const riese = bestand.modelle.find((m) => m.name === "riesenmodell");
  assert.ok(riese, "das Modell muss in der Liste stehen");
  assert.equal(riese.zustand, "unbrauchbar");
  assert.equal(riese.motorId, null);
  assert.match(riese.meldung, /kein eingetragener Motor/);
  assert.equal(bestand.speicher.totesGewichtBytes, 704_000_000_000);
});

test("ein Motor mit altem Lebenszeichen gilt als stumm", async () => {
  const alt = new Date(JETZT - 10 * 60 * 1000).toISOString();
  const bestand = await modellbestandUebersicht({
    env: ENV,
    jetzt: JETZT,
    fetchImpl: fakeFetch({
      listen: {
        "model-files/": listeXml([{ key: "model-files/ornith/gewichte.gguf", size: 5_629_108_704 }]),
        "admin/motoren/": listeXml([{ key: "admin/motoren/mac2.json", size: 200 }])
      },
      dateien: {
        "admin/motoren/mac2.json": JSON.stringify({
          id: "mac2", art: "smee", name: "Mac 2 ueber smee.io",
          kanal: "https://smee.io/beispiel", gemeldetAm: alt, modelle: ["ornith"]
        })
      }
    })
  });

  const motor = bestand.motoren.find((m) => m.id === "mac2");
  assert.equal(motor.zustand, "stumm");

  // Und das Modell dahinter darf NICHT als aktiv durchgehen.
  const ornith = bestand.modelle.find((m) => m.name === "ornith");
  assert.equal(ornith.zustand, "fehler");
  assert.match(ornith.meldung, /meldet sich nicht/);
});

test("ein frisches Lebenszeichen macht den Motor verbunden", async () => {
  const frisch = new Date(JETZT - 30 * 1000).toISOString();
  const bestand = await modellbestandUebersicht({
    env: ENV,
    jetzt: JETZT,
    fetchImpl: fakeFetch({
      listen: { "admin/motoren/": listeXml([{ key: "admin/motoren/mac2.json", size: 200 }]) },
      dateien: {
        "admin/motoren/mac2.json": JSON.stringify({ id: "mac2", art: "smee", gemeldetAm: frisch })
      }
    })
  });
  assert.equal(bestand.motoren[0].zustand, "verbunden");
});

test("ein abgemeldeter Motor ist aus, kein Fehler", async () => {
  const bestand = await modellbestandUebersicht({
    env: ENV,
    jetzt: JETZT,
    fetchImpl: fakeFetch({
      listen: { "admin/motoren/": listeXml([{ key: "admin/motoren/mac2.json", size: 200 }]) },
      dateien: {
        "admin/motoren/mac2.json": JSON.stringify({
          id: "mac2", abgemeldet: true, gemeldetAm: new Date(JETZT - 3600_000).toISOString()
        })
      }
    })
  });
  assert.equal(bestand.motoren[0].zustand, "aus");
});

test("ein leerer Modellordner heisst unvollstaendig, nicht einsatzbereit", async () => {
  const bestand = await modellbestandUebersicht({
    env: ENV,
    jetzt: JETZT,
    fetchImpl: fakeFetch({
      listen: { "model-files/": listeXml([{ key: "model-files/abgebrochen/rest.json", size: 0 }]) }
    })
  });
  const kaputt = bestand.modelle.find((m) => m.name === "abgebrochen");
  assert.equal(kaputt.zustand, "unvollstaendig");
  assert.match(kaputt.meldung, /abgebrochen/);
});

test("ohne e2-Zugang wird die Luecke gemeldet statt eine leere Liste vorgetaeuscht", async () => {
  const bestand = await modellbestandUebersicht({ env: {}, jetzt: JETZT, fetchImpl: fakeFetch() });
  assert.equal(bestand.modelle.length, 0);
  assert.ok(bestand.stummeQuellen.length > 0, "die fehlende Quelle muss benannt sein");
  assert.equal(bestand.kannSchalten, false);
});

test("Schreibrechte sind standardmaessig aus - die Route setzt sie, nicht das Modul", async () => {
  const bestand = await modellbestandUebersicht({ env: ENV, jetzt: JETZT, fetchImpl: fakeFetch() });
  assert.equal(bestand.kannSchalten, false);
});

test("ohne ausdruecklichen Modell-Eimer wird der Deploy-Eimer genommen, nicht der Haupteimer", async () => {
  const gefragt = [];
  const bestand = await modellbestandUebersicht({
    env: ENV,
    jetzt: JETZT,
    fetchImpl: async (url) => {
      gefragt.push(new URL(String(url)).pathname);
      return {
        ok: true, status: 200, headers: { get: () => null },
        text: async () => listeXml([]),
        arrayBuffer: async () => new ArrayBuffer(0)
      };
    }
  });
  assert.equal(bestand.ok, true);
  // Die Gewichte liegen im Deploy-Eimer. Wuerde hier der Haupteimer stehen,
  // meldete die Seite dauerhaft "nichts da" - der Befund vom 09.07.2026.
  assert.ok(gefragt.some((p) => p.startsWith("/deployeimer")), "Deploy-Eimer muss gelesen werden");
  assert.ok(gefragt.some((p) => p.startsWith("/haupteimer")), "Motoren liegen im Haupteimer");
});

test("ein ausdrueckliches Aus des Betreibers schlaegt jede gemessene Ampel", async () => {
  const frisch = new Date(JETZT - 30 * 1000).toISOString();
  const bestand = await modellbestandUebersicht({
    env: ENV,
    jetzt: JETZT,
    fetchImpl: fakeFetch({
      listen: {
        "model-files/": listeXml([{ key: "model-files/ornith/gewichte.gguf", size: 5_629_108_704 }]),
        "admin/motoren/": listeXml([{ key: "admin/motoren/mac2.json", size: 200 }]),
        "admin/modelle/schaltung/": listeXml([{ key: "admin/modelle/schaltung/model-files-ornith.json", size: 150 }])
      },
      dateien: {
        "admin/motoren/mac2.json": JSON.stringify({
          id: "mac2", art: "smee", gemeldetAm: frisch, modelle: ["ornith"]
        }),
        "admin/modelle/schaltung/model-files-ornith.json": JSON.stringify({
          // Die Kennung ist normalisiert: "/" wird zu "-", alles klein.
          id: "model-files-ornith", aktiv: false, gesetztVon: "chef@smejj.com",
          gesetztAm: frisch, grund: "kostet Strom, wird gerade nicht gebraucht"
        })
      }
    })
  });

  // Der Motor ist verbunden - trotzdem muss das Modell "aus" sein, weil der
  // Betreiber es so gesetzt hat. Sonst waere der Knopf wirkungslos.
  assert.equal(bestand.motoren[0].zustand, "verbunden");
  const ornith = bestand.modelle.find((m) => m.name === "ornith");
  assert.equal(ornith.zustand, "aus");
  assert.match(ornith.meldung, /vom Betreiber ausgeschaltet/);
  assert.equal(ornith.geschaltetVon, "chef@smejj.com");
});

test("der Eimer wandert mit, damit Loeschen den richtigen Ort trifft", async () => {
  const bestand = await modellbestandUebersicht({
    env: ENV,
    jetzt: JETZT,
    fetchImpl: fakeFetch({
      listen: { "model-files/": listeXml([{ key: "model-files/ornith/g.gguf", size: 10 }]) }
    })
  });
  const ornith = bestand.modelle.find((m) => m.name === "ornith");
  assert.equal(ornith.eimer, "modell");
  assert.equal(ornith.pfad, "model-files/ornith/");
});

// --- Befunde vom Live-Bildschirm, 2026-09-08 --------------------------------

test("eine lose Datei unter dem Praefix ist kein Modell", async () => {
  const bestand = await modellbestandUebersicht({
    env: ENV,
    jetzt: JETZT,
    fetchImpl: fakeFetch({
      listen: {
        "models/production/": listeXml([
          { key: "models/production/.registry.json", size: 480 },
          { key: "models/production/qwen35-4b/gewichte.safetensors", size: 2_900_000_000 }
        ])
      }
    })
  });
  // Vorher stand ".registry.json" als eigene Zeile in der Liste — mit
  // Loeschen-Knopf daneben. Verwaltungskram ist kein Modell.
  assert.equal(bestand.modelle.some((m) => m.name === ".registry.json"), false);
  assert.equal(bestand.modelle.some((m) => m.name === "qwen35-4b"), true);
});

test("ein Modell, das nur der Motor kennt, verschwindet nicht stillschweigend", async () => {
  const frisch = new Date(JETZT - 30 * 1000).toISOString();
  const bestand = await modellbestandUebersicht({
    env: ENV,
    jetzt: JETZT,
    fetchImpl: fakeFetch({
      listen: { "admin/motoren/": listeXml([{ key: "admin/motoren/mac2.json", size: 200 }]) },
      dateien: {
        "admin/motoren/mac2.json": JSON.stringify({
          id: "mac2", art: "smee", name: "Mac 2 ueber smee.io",
          gemeldetAm: frisch, modelle: ["ornith-1.0-9b"]
        })
      }
    })
  });

  // Der Motor sagt "ich bediene 1 Modell". Ohne diese Zeile zeigte die Liste
  // keines - und niemand erfuhr, welches (Befund live am 08.09.: ornith liegt
  // im Eimer der smejj-Cloud, den diese Sicht nicht liest).
  const ornith = bestand.modelle.find((m) => m.name === "ornith-1.0-9b");
  assert.ok(ornith, "das vom Motor gemeldete Modell muss in der Liste stehen");
  assert.equal(ornith.motorId, "mac2");
  assert.equal(ornith.zustand, "aktiv");
  assert.match(ornith.meldung, /nicht in den hier gelesenen Eimern/);
});

test("meldet ein stummer Motor ein Modell, ist die Zeile ein Fehler und kein Erfolg", async () => {
  const alt = new Date(JETZT - 10 * 60 * 1000).toISOString();
  const bestand = await modellbestandUebersicht({
    env: ENV,
    jetzt: JETZT,
    fetchImpl: fakeFetch({
      listen: { "admin/motoren/": listeXml([{ key: "admin/motoren/mac2.json", size: 200 }]) },
      dateien: {
        "admin/motoren/mac2.json": JSON.stringify({
          id: "mac2", art: "smee", name: "Mac 2 ueber smee.io",
          gemeldetAm: alt, modelle: ["ornith-1.0-9b"]
        })
      }
    })
  });
  const ornith = bestand.modelle.find((m) => m.name === "ornith-1.0-9b");
  assert.equal(ornith.zustand, "fehler");
  assert.match(ornith.meldung, /meldet sich nicht/);
});
