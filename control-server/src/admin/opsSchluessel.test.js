// smejj.com — Unit-Tests fuer die Schluessel-Sicht.
//
// Der erste Test ist der einzige, auf den es wirklich ankommt: der Wert eines
// Schluessels darf das Modul nie verlassen. Alles andere ist Komfort.
//
// Ausfuehren: node --test control-server/src/admin/opsSchluessel.test.js
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { encryptProviderCredential, providerCredentialEncryptionConfig } from "../providers/providerCredentialVault.js";
import { schluesselUebersicht } from "./opsSchluessel.js";

const SCHLUESSEL = crypto.randomBytes(32).toString("base64");
const ENV = Object.freeze({
  IDRIVE_E2_ENDPOINT: "https://beispiel.example",
  IDRIVE_E2_ACCESS_KEY: "zugang",
  IDRIVE_E2_SECRET_KEY: "geheim",
  IDRIVE_E2_BUCKET: "eimer",
  SMEJJ_PROVIDER_CREDENTIAL_KEY_B64: SCHLUESSEL,
  SMEJJ_PROVIDER_CREDENTIAL_KEY_ID: "schluessel-2026-07"
});

const INDEX = async () => ({ ok: true, entries: [{ userId: "u_maria", email: "maria@example.de" }] });

const GEHEIMER_WERT = "sk-streng-geheim-4711-niemals-anzeigen";

function huelleFuer(konto, anbieter, felder = {}) {
  const config = providerCredentialEncryptionConfig(ENV);
  return encryptProviderCredential({
    subjectId: konto,
    providerId: anbieter,
    apiKey: GEHEIMER_WERT,
    keyLast4: "4711",
    selectedModel: "glm-5-2",
    enabled: true,
    updatedAt: "2026-07-28T10:00:00.000Z",
    ...felder
  }, config);
}

/** Antwortet auf LIST mit den Schluesseln und auf GET mit der jeweiligen Huelle. */
function netz(dateien) {
  return async (url) => {
    const adresse = new URL(String(url));
    if (adresse.searchParams.get("list-type") === "2") {
      const inhalt = Object.keys(dateien)
        .map((k) => `<Contents><Key>${k}</Key><Size>500</Size><LastModified>2026-07-28T10:00:00.000Z</LastModified></Contents>`)
        .join("");
      return antwort(`<?xml version="1.0"?><ListBucketResult>${inhalt}<IsTruncated>false</IsTruncated></ListBucketResult>`);
    }
    const key = decodeURIComponent(adresse.pathname.split("/").slice(2).join("/"));
    const huelle = dateien[key];
    if (!huelle) return { ok: false, status: 404, text: async () => "", headers: { get: () => null } };
    return antwort(JSON.stringify(huelle));
  };
}

function antwort(text) {
  return { ok: true, status: 200, text: async () => text, arrayBuffer: async () => Buffer.from(text), headers: { get: () => null } };
}

test("DER WERT DES SCHLUESSELS VERLAESST DAS MODUL NIE", async () => {
  const huelle = huelleFuer("u_maria", "cline");
  const e = await schluesselUebersicht({
    env: ENV,
    leseIndex: INDEX,
    fetchImpl: netz({ "auth/provider-credentials/abc/cline.json.enc": huelle })
  });
  const text = JSON.stringify(e);
  assert.equal(text.includes(GEHEIMER_WERT), false, "der Schluesselwert darf nirgends auftauchen");
  assert.equal(text.includes("apiKey"), false, "auch das Feld selbst nicht");
  // Gegen die WERTE der Huelle pruefen, nicht gegen Feldnamen: "iv" steckt als
  // Teilwort in "aktiv" und haette den Test grundlos rot gefaerbt. Ein Test,
  // der auf Wortfragmente hereinfaellt, verliert seine Aussagekraft.
  assert.equal(text.includes(huelle.ciphertext), false, "kein Geheimtext nach aussen");
  assert.equal(text.includes(huelle.iv), false, "kein Initialisierungsvektor nach aussen");
  assert.equal(text.includes(huelle.authTag), false, "keine Pruefmarke nach aussen");
  assert.equal(text.includes(SCHLUESSEL), false, "erst recht nicht der Hauptschluessel");
});

test("die Merkmale, die eine Betreiberin braucht, sind da", async () => {
  const e = await schluesselUebersicht({
    env: ENV,
    leseIndex: INDEX,
    fetchImpl: netz({ "auth/provider-credentials/abc/cline.json.enc": huelleFuer("u_maria", "cline") })
  });
  assert.equal(e.ok, true);
  assert.equal(e.total, 1);
  const s = e.schluessel[0];
  assert.equal(s.kontoId, "u_maria");
  assert.equal(s.konto, "maria@example.de", "die Kennung wird ueber den Index lesbar gemacht");
  assert.equal(s.anbieter, "cline");
  assert.equal(s.aktiv, true);
  assert.equal(s.letzteVier, "4711", "hoechstens vier Zeichen zur Wiedererkennung");
  assert.equal(s.modell, "glm-5-2");
});

test("ein widerrufener Schluessel ist als widerrufen erkennbar", async () => {
  const e = await schluesselUebersicht({
    env: ENV,
    leseIndex: INDEX,
    fetchImpl: netz({
      "auth/provider-credentials/a/cline.json.enc": huelleFuer("u_anna", "cline"),
      "auth/provider-credentials/b/cline.json.enc": huelleFuer("u_bernd", "cline", { enabled: false, apiKey: "", keyLast4: "" })
    })
  });
  assert.equal(e.aktiv, 1);
  assert.equal(e.widerrufen, 1);
  const widerrufen = e.schluessel.find((s) => s.kontoId === "u_bernd");
  assert.equal(widerrufen.aktiv, false);
  assert.equal(widerrufen.letzteVier, null, "nach dem Widerruf gibt es nichts mehr wiederzuerkennen");
});

test("ohne Entschluesselungs-Schluessel bleibt die Zeile stehen — nur mit weniger Angaben", async () => {
  const e = await schluesselUebersicht({
    env: { ...ENV, SMEJJ_PROVIDER_CREDENTIAL_KEY_B64: "" },
    leseIndex: INDEX,
    fetchImpl: netz({ "auth/provider-credentials/abc/cline.json.enc": huelleFuer("u_maria", "cline") })
  });
  assert.equal(e.ok, true);
  assert.equal(e.entschluesselungMoeglich, false);
  const s = e.schluessel[0];
  assert.equal(s.kontoId, "u_maria", "wem er gehoert, steht unverschluesselt in der Huelle");
  assert.equal(s.anbieter, "cline");
  assert.equal(s.aktiv, null, "der Zustand ist unbekannt — nicht 'aus'");
  assert.equal(s.letzteVier, null);
});

test("eine beschaedigte Huelle kippt die Liste nicht", async () => {
  const kaputt = { ...huelleFuer("u_xaver", "cline"), authTag: Buffer.alloc(16).toString("base64") };
  const e = await schluesselUebersicht({
    env: ENV,
    leseIndex: INDEX,
    fetchImpl: netz({
      "auth/provider-credentials/a/cline.json.enc": huelleFuer("u_gut", "cline"),
      "auth/provider-credentials/b/cline.json.enc": kaputt
    })
  });
  assert.equal(e.ok, true);
  assert.equal(e.total, 2);
  assert.equal(e.unlesbar, 1);
  assert.equal(e.schluessel[0].aktiv, null, "was nicht stimmt, steht oben");
});

test("ohne Speicher wird das gesagt, nicht geraten", async () => {
  const e = await schluesselUebersicht({ env: {}, fetchImpl: async () => { throw new Error("nie erreicht"); } });
  assert.equal(e.ok, false);
  assert.equal(e.error, "speicher_nicht_eingerichtet");
});
