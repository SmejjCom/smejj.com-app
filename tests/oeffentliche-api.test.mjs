// smejj.com — Die oeffentliche API (/v1): Zugang, Marke, Zaehlung, Widerruf.
//
// Der Test faehrt den echten Routen-Handler mit einer Backend-Attrappe. Er
// prueft vor allem die vier Dinge, die live teuer waeren, wenn sie kaputt sind:
//   * ohne Schluessel geht nichts (und ohne Flag geht gar nichts),
//   * der Kunde sieht NIE den Namen unseres Lieferanten,
//   * der Klartext-Schluessel liegt nirgends gespeichert,
//   * ein Widerruf wirkt.
import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import crypto from "node:crypto";

import {
  __leerePruefCache,
  abdruckVon,
  baueSchluessel,
  erzeugeSchluessel,
  hatSchluesselForm,
  listeSchluessel,
  pruefeSchluessel,
  setzeSchluesselAktiv,
  widerrufeSchluessel
} from "../control-server/src/publicapi/publicApiKeys.js";
import {
  handlePublicApiRoute,
  pruefeNachrichten,
  verarbeiteStromZeile
} from "../control-server/src/publicapi/publicApiRoutes.js";
import { __leereVerbrauchsSpeicher, verbrauchSnapshot } from "../control-server/src/publicapi/publicApiUsage.js";
import { profilFuerModell, istPublicModel } from "../control-server/src/publicapi/publicApiModels.js";
import { __clearProviderCredentialMemoryForTests } from "../control-server/src/providers/providerCredentialVault.js";

const KONTO = "user_abcd1234";

function testEnv(extra = {}) {
  return {
    SMEJJ_PUBLIC_API_ENABLED: "1",
    SMEJJ_PROVIDER_CREDENTIAL_KEY_ID: "test-key-2026",
    SMEJJ_PROVIDER_CREDENTIAL_KEY_B64: Buffer.alloc(32, 7).toString("base64"),
    SMEJJ_PROVIDER_CREDENTIAL_ALLOW_MEMORY: "YES",
    // Ein einziges Backend, damit die Kette nicht leer ist (fail-closed sonst).
    SMEJJ_LLM_BASE_URL: "https://backend.example.com/v1",
    SMEJJ_LLM_API_KEY: "geheim-backend-key",
    SMEJJ_LLM_MODEL: "fremdmodell-x7",
    SMEJJ_LLM_PROVIDER_ORDER: "custom",
    ...extra
  };
}

function frischerSpeicher() {
  __clearProviderCredentialMemoryForTests();
  __leerePruefCache();
  __leereVerbrauchsSpeicher();
}

function mockReq({ method = "GET", pfad = "/v1/models", headers = {}, body } = {}) {
  const roh = body === undefined ? "" : JSON.stringify(body);
  const req = Readable.from(roh ? [roh] : []);
  req.method = method;
  req.url = pfad;
  req.headers = { host: "smejj.com", ...headers };
  return req;
}

function mockRes() {
  const zustand = { status: 0, headers: {}, teile: [], gesendet: false, beendet: false };
  const res = {
    zustand,
    get headersSent() { return zustand.gesendet; },
    setHeader(name, wert) { zustand.headers[String(name).toLowerCase()] = String(wert); },
    writeHead(status, headers = {}) {
      zustand.status = status;
      for (const [name, wert] of Object.entries(headers)) zustand.headers[String(name).toLowerCase()] = String(wert);
      zustand.gesendet = true;
    },
    write(teil) { zustand.teile.push(String(teil)); },
    end(teil) { if (teil !== undefined) zustand.teile.push(String(teil)); zustand.beendet = true; }
  };
  return res;
}

function text(res) { return res.zustand.teile.join(""); }
function payload(res) { return JSON.parse(text(res)); }

async function ruf(pfad, { method = "GET", headers = {}, body, env = testEnv(), fetchImpl } = {}) {
  const req = mockReq({ method, pfad, headers, body });
  const res = mockRes();
  const url = new URL(pfad, "https://smejj.com");
  const behandelt = await handlePublicApiRoute(req, url, res, { env, fetchImpl: fetchImpl || (() => { throw new Error("kein fetch erwartet"); }) });
  return { behandelt, res };
}

function backendAntwort(daten) {
  return () => Promise.resolve(new Response(JSON.stringify(daten), {
    status: 200,
    headers: { "content-type": "application/json" }
  }));
}

function backendStrom(zeilen) {
  return () => Promise.resolve(new Response(zeilen.join(""), {
    status: 200,
    headers: { "content-type": "text/event-stream" }
  }));
}

// ---- Schluessel --------------------------------------------------------------

test("Schluesselform: Praefix, Laenge, Abdruck ist reproduzierbar", () => {
  const { klartext, abdruck, letzte4 } = baueSchluessel();
  assert.match(klartext, /^smejj-live-[A-Za-z0-9_-]{32}$/);
  assert.ok(hatSchluesselForm(klartext));
  assert.ok(!hatSchluesselForm("sk-fremd-1234"));
  assert.ok(!hatSchluesselForm(`${klartext}x`));
  assert.equal(abdruck, crypto.createHash("sha256").update(klartext).digest("hex"));
  assert.equal(letzte4, klartext.slice(-4));
});

test("Der Klartext wird nirgends gespeichert — nur sein Abdruck", async () => {
  frischerSpeicher();
  const env = testEnv();
  const { klartext, schluessel } = await erzeugeSchluessel(KONTO, { name: "ZCode" }, env);

  const liste = await listeSchluessel(KONTO, env);
  const alsText = JSON.stringify(liste);
  assert.ok(!alsText.includes(klartext), "Klartext taucht in der Liste auf");
  assert.ok(!alsText.includes(abdruckVon(klartext)), "Abdruck gehoert nicht in die Oberflaeche");
  assert.match(liste[0].keyHint, /^smejj-live-••••/);
  assert.equal(liste[0].zustand, "aktiv");
  assert.equal(liste[0].id, schluessel.id);
});

test("Pruefung: gueltig, unbekannt, widerrufen", async () => {
  frischerSpeicher();
  const env = testEnv();
  const { klartext, schluessel } = await erzeugeSchluessel(KONTO, { name: "Cline" }, env);

  const gut = await pruefeSchluessel(klartext, env);
  assert.equal(gut.ok, true);
  assert.equal(gut.kontoId, KONTO);

  const fremd = await pruefeSchluessel(`smejj-live-${"a".repeat(32)}`, env);
  assert.equal(fremd.ok, false);
  assert.equal(fremd.grund, "api_key_unknown");

  await widerrufeSchluessel(KONTO, schluessel.id, env);
  const tot = await pruefeSchluessel(klartext, env);
  assert.equal(tot.ok, false);
  assert.equal(tot.grund, "api_key_revoked");
});

test("Laufzeit: Wahl beim Erstellen, Altverhalten unbefristet, Ablauf sperrt trotz warmem Cache", async () => {
  frischerSpeicher();
  const env = testEnv();
  // Alte Clients schicken keine Laufzeit: unbefristet, wie vor dem Umbau.
  const alt = await erzeugeSchluessel(KONTO, { name: "Alt" }, env);
  assert.equal(alt.schluessel.laeuftAbAm, "");
  const ewig = await erzeugeSchluessel(KONTO, { name: "Ewig", laufzeit: "unbefristet" }, env);
  assert.equal(ewig.schluessel.laeuftAbAm, "");
  const jahr = await erzeugeSchluessel(KONTO, { name: "Jahr", laufzeit: "1j" }, env);
  const ablauf = Date.parse(jahr.schluessel.laeuftAbAm);
  const tage = (ablauf - Date.parse(jahr.schluessel.erstelltAm)) / 86_400_000;
  assert.ok(Math.abs(tage - 365) < 0.01, `1 Jahr = 365 Tage, gemessen ${tage}`);
  await assert.rejects(() => erzeugeSchluessel(KONTO, { name: "Kaputt", laufzeit: "3 wochen" }, env), /api_key_laufzeit_invalid/);

  // Uhr vorstellen: eine Sekunde vor Ablauf gueltig (und damit im Cache) —
  // eine Millisekunde danach abgelaufen. Der Cache darf das nicht ueberdecken.
  const gut = await pruefeSchluessel(jahr.klartext, env, () => ablauf - 1000);
  assert.equal(gut.ok, true);
  const tot = await pruefeSchluessel(jahr.klartext, env, () => ablauf + 1);
  assert.equal(tot.ok, false);
  assert.equal(tot.grund, "api_key_expired");
  // Der Unbefristete bleibt — auch in zehn Jahren.
  const nochGut = await pruefeSchluessel(ewig.klartext, env, () => ablauf + 3650 * 86_400_000);
  assert.equal(nochGut.ok, true);
  const liste = await listeSchluessel(KONTO, env);
  assert.equal(liste.find((k) => k.id === jahr.schluessel.id).zustand, "aktiv");
  assert.equal(liste.find((k) => k.id === jahr.schluessel.id).laeuftAbAm, jahr.schluessel.laeuftAbAm);
});

test("Abgelaufener Schluessel: Zustand in der Liste, 401 api_key_expired an /v1, Umschalten rettet ihn nicht", async () => {
  frischerSpeicher();
  const env = testEnv();
  const vor40Tagen = () => new Date(Date.now() - 40 * 86_400_000);
  const { klartext, schluessel } = await erzeugeSchluessel(KONTO, { name: "Alt30", laufzeit: "30t" }, env, vor40Tagen);
  const liste = await listeSchluessel(KONTO, env);
  assert.equal(liste[0].zustand, "abgelaufen");

  const { res } = await ruf("/v1/models", { env, headers: { authorization: `Bearer ${klartext}` } });
  assert.equal(res.zustand.status, 401);
  assert.equal(payload(res).error.code, "api_key_expired");
  assert.match(payload(res).error.message, /abgelaufen/);

  // Deaktivieren + Aktivieren schreibt den Rueckschlag neu — das Ablaufdatum muss ueberleben.
  await setzeSchluesselAktiv(KONTO, schluessel.id, false, env);
  await setzeSchluesselAktiv(KONTO, schluessel.id, true, env);
  const danach = await pruefeSchluessel(klartext, env);
  assert.equal(danach.ok, false);
  assert.equal(danach.grund, "api_key_expired");
});

test("Speicher nicht bereit meldet 503, nicht 'unbekannter Schluessel'", async () => {
  frischerSpeicher();
  const ohneSchluesselring = testEnv({ SMEJJ_PROVIDER_CREDENTIAL_KEY_B64: "", SMEJJ_PROVIDER_CREDENTIAL_KEY_ID: "" });
  const ergebnis = await pruefeSchluessel(`smejj-live-${"b".repeat(32)}`, ohneSchluesselring);
  assert.equal(ergebnis.ok, false);
  assert.equal(ergebnis.grund, "api_key_store_unavailable");
  assert.equal(ergebnis.status, 503);
});

// ---- Zugang zur Route --------------------------------------------------------

test("Ohne Flag antwortet /v1 mit 503 — fail-closed", async () => {
  frischerSpeicher();
  const { behandelt, res } = await ruf("/v1/models", { env: testEnv({ SMEJJ_PUBLIC_API_ENABLED: "" }) });
  assert.equal(behandelt, true);
  assert.equal(res.zustand.status, 503);
  assert.equal(payload(res).error.code, "public_api_disabled");
});

test("Ohne Schluessel: 401 im OpenAI-Fehlerformat samt WWW-Authenticate", async () => {
  frischerSpeicher();
  const { res } = await ruf("/v1/models");
  assert.equal(res.zustand.status, 401);
  assert.equal(res.zustand.headers["www-authenticate"], 'Bearer realm="smejj"');
  const fehler = payload(res).error;
  assert.equal(fehler.code, "api_key_missing");
  assert.equal(fehler.type, "invalid_request_error");
  assert.ok(fehler.message.length > 0);
  assert.match(fehler.request_id, /^req_[a-f0-9]{24}$/);
});

test("OPTIONS beantwortet den Preflight ohne Schluessel", async () => {
  const { res } = await ruf("/v1/chat/completions", { method: "OPTIONS" });
  assert.equal(res.zustand.status, 204);
  assert.equal(res.zustand.headers["access-control-allow-origin"], "*");
});

test("/v1/models nennt nur Markennamen", async () => {
  frischerSpeicher();
  const env = testEnv();
  const { klartext } = await erzeugeSchluessel(KONTO, {}, env);
  const { res } = await ruf("/v1/models", { env, headers: { authorization: `Bearer ${klartext}` } });
  assert.equal(res.zustand.status, 200);
  const liste = payload(res);
  assert.equal(liste.object, "list");
  const ids = liste.data.map((eintrag) => eintrag.id);
  assert.deepEqual(ids, ["smejj-1.0", "smejj-1.0-fast", "smejj-1.0-code", "smejj-1.0-reasoning"]);
  assert.ok(liste.data.every((eintrag) => eintrag.owned_by === "smejj"));
  assert.ok(!text(res).includes("fremdmodell-x7"), "Backend-Modell darf nicht durchscheinen");
});

// ---- Chat --------------------------------------------------------------------

test("chat/completions: Antwort traegt die Marke, nicht den Lieferanten", async () => {
  frischerSpeicher();
  const env = testEnv();
  const { klartext } = await erzeugeSchluessel(KONTO, {}, env);
  const { res } = await ruf("/v1/chat/completions", {
    method: "POST",
    env,
    headers: { authorization: `Bearer ${klartext}` },
    body: { model: "smejj-1.0", messages: [{ role: "user", content: "Hallo" }] },
    fetchImpl: backendAntwort({
      id: "chatcmpl-1",
      object: "chat.completion",
      model: "fremdmodell-x7",
      choices: [{ index: 0, message: { role: "assistant", content: "Hi" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 11, completion_tokens: 5, total_tokens: 16 }
    })
  });

  assert.equal(res.zustand.status, 200);
  const antwort = payload(res);
  assert.equal(antwort.model, "smejj-1.0");
  assert.ok(!text(res).includes("fremdmodell-x7"));
  assert.equal(antwort.choices[0].message.content, "Hi");
  assert.equal(res.zustand.headers["x-smejj-usage-source"], "measured");

  const verbrauch = await verbrauchSnapshot(KONTO, env);
  assert.equal(verbrauch.anfragen, 1);
  assert.equal(verbrauch.promptTokens, 11);
  assert.equal(verbrauch.completionTokens, 5);
  assert.equal(verbrauch.gesamtTokens, 16);
});

test("Stream: jeder Datenblock wird auf die Marke umgeschrieben", async () => {
  frischerSpeicher();
  const env = testEnv();
  const { klartext } = await erzeugeSchluessel(KONTO, {}, env);
  const { res } = await ruf("/v1/chat/completions", {
    method: "POST",
    env,
    headers: { authorization: `Bearer ${klartext}` },
    body: { model: "smejj-1.0-code", messages: [{ role: "user", content: "Schreib Code" }], stream: true },
    fetchImpl: backendStrom([
      `data: ${JSON.stringify({ id: "1", model: "fremdmodell-x7", choices: [{ delta: { content: "Hal" } }] })}\n\n`,
      `data: ${JSON.stringify({ id: "1", model: "fremdmodell-x7", choices: [{ delta: { content: "lo" } }] })}\n\n`,
      `data: ${JSON.stringify({ id: "1", model: "fremdmodell-x7", choices: [], usage: { prompt_tokens: 7, completion_tokens: 3 } })}\n\n`,
      "data: [DONE]\n\n"
    ])
  });

  const strom = text(res);
  assert.equal(res.zustand.status, 200);
  assert.match(res.zustand.headers["content-type"], /text\/event-stream/);
  assert.ok(!strom.includes("fremdmodell-x7"), "Lieferantenname leckt im Stream");
  assert.equal((strom.match(/smejj-1\.0-code/g) || []).length, 3);
  assert.ok(strom.includes("data: [DONE]"));

  const verbrauch = await verbrauchSnapshot(KONTO, env);
  assert.equal(verbrauch.promptTokens, 7);
  assert.equal(verbrauch.completionTokens, 3);
});

test("Stream ohne usage-Block: geschaetzt statt null gezaehlt", async () => {
  frischerSpeicher();
  const env = testEnv();
  const { klartext } = await erzeugeSchluessel(KONTO, {}, env);
  await ruf("/v1/chat/completions", {
    method: "POST",
    env,
    headers: { authorization: `Bearer ${klartext}` },
    body: { messages: [{ role: "user", content: "x".repeat(40) }], stream: true },
    fetchImpl: backendStrom([
      `data: ${JSON.stringify({ id: "1", model: "fremdmodell-x7", choices: [{ delta: { content: "y".repeat(20) } }] })}\n\n`,
      "data: [DONE]\n\n"
    ])
  });
  const verbrauch = await verbrauchSnapshot(KONTO, env);
  assert.equal(verbrauch.promptTokens, 10); // 40 Zeichen / 4
  assert.equal(verbrauch.completionTokens, 5); // 20 Zeichen / 4
});

test("Denken ist aus — ausser beim Denk-Modell (sonst frisst es das Token-Budget)", async () => {
  frischerSpeicher();
  // `thinking` wird nur an Backends gesendet, die es kennen (GLM) — darum hier
  // ein GLM-Modellname, sonst prueft der Test ins Leere.
  const env = testEnv({ SMEJJ_LLM_MODEL: "glm-testmodell" });
  const { klartext } = await erzeugeSchluessel(KONTO, {}, env);
  const kopf = { authorization: `Bearer ${klartext}` };
  const koerper = [];
  const merkendesBackend = (_url, optionen) => {
    koerper.push(JSON.parse(optionen.body));
    return Promise.resolve(new Response(JSON.stringify({
      id: "c", model: "fremdmodell-x7",
      choices: [{ index: 0, message: { role: "assistant", content: "ok" } }],
      usage: { prompt_tokens: 3, completion_tokens: 1 }
    }), { status: 200, headers: { "content-type": "application/json" } }));
  };

  await ruf("/v1/chat/completions", {
    method: "POST", env, headers: kopf, fetchImpl: merkendesBackend,
    body: { model: "smejj-1.0", messages: [{ role: "user", content: "hi" }] }
  });
  await ruf("/v1/chat/completions", {
    method: "POST", env, headers: kopf, fetchImpl: merkendesBackend,
    body: { model: "smejj-1.0-reasoning", messages: [{ role: "user", content: "hi" }] }
  });

  // Live gemessen 2026-08-23: ohne diese Regel kam content:"" zurueck, weil
  // 50 von 50 erlaubten Token ins Denken gingen (finish_reason "length").
  assert.equal(koerper[0].thinking?.type, "disabled", "Allzweckmodell muss ohne Denken laufen");
  assert.equal(koerper[1].thinking, undefined, "das Denk-Modell darf denken");

  // Identitaet: live sagte das Backend "the GLM language model trained by Z.ai".
  // Erste Nachricht ist IMMER unsere Systemnachricht, die des Kunden folgt.
  assert.equal(koerper[0].messages[0].role, "system");
  assert.match(koerper[0].messages[0].content, /smejj 1\.0/);
  assert.equal(koerper[0].messages[1].content, "hi");
});

test("Unbekanntes Modell und leere messages werden sauber abgewiesen", async () => {
  frischerSpeicher();
  const env = testEnv();
  const { klartext } = await erzeugeSchluessel(KONTO, {}, env);
  const kopf = { authorization: `Bearer ${klartext}` };

  const falschesModell = await ruf("/v1/chat/completions", {
    method: "POST", env, headers: kopf, body: { model: "gpt-4o", messages: [{ role: "user", content: "hi" }] }
  });
  assert.equal(falschesModell.res.zustand.status, 404);
  assert.equal(payload(falschesModell.res).error.code, "model_not_found");

  const ohneNachrichten = await ruf("/v1/chat/completions", {
    method: "POST", env, headers: kopf, body: { model: "smejj-1.0", messages: [] }
  });
  assert.equal(ohneNachrichten.res.zustand.status, 400);
  assert.equal(payload(ohneNachrichten.res).error.code, "messages_required");
});

test("Tageslimit deckelt die Kosten", async () => {
  frischerSpeicher();
  const env = testEnv({ SMEJJ_PUBLIC_API_TAGESLIMIT_TOKENS: "10" });
  const { klartext } = await erzeugeSchluessel(KONTO, {}, env);
  const kopf = { authorization: `Bearer ${klartext}` };
  const antwort = backendAntwort({
    id: "c1", model: "fremdmodell-x7",
    choices: [{ index: 0, message: { role: "assistant", content: "ok" } }],
    usage: { prompt_tokens: 8, completion_tokens: 8 }
  });

  const erste = await ruf("/v1/chat/completions", {
    method: "POST", env, headers: kopf, fetchImpl: antwort,
    body: { messages: [{ role: "user", content: "hi" }] }
  });
  assert.equal(erste.res.zustand.status, 200);

  const zweite = await ruf("/v1/chat/completions", {
    method: "POST", env, headers: kopf, fetchImpl: antwort,
    body: { messages: [{ role: "user", content: "hi" }] }
  });
  assert.equal(zweite.res.zustand.status, 429);
  assert.equal(payload(zweite.res).error.code, "daily_quota_exceeded");
});

test("Kein Backend erreichbar: 503, ohne Lieferantennamen im Text", async () => {
  frischerSpeicher();
  const env = testEnv();
  const { klartext } = await erzeugeSchluessel(KONTO, {}, env);
  const { res } = await ruf("/v1/chat/completions", {
    method: "POST",
    env,
    headers: { authorization: `Bearer ${klartext}` },
    body: { messages: [{ role: "user", content: "hi" }] },
    fetchImpl: () => Promise.resolve(new Response("nope", { status: 500 }))
  });
  assert.equal(res.zustand.status, 503);
  assert.equal(payload(res).error.code, "upstream_unavailable");
  assert.ok(!text(res).includes("fremdmodell-x7"));
  assert.ok(!text(res).includes("backend.example.com"));
});

test("Widerrufener Schluessel kommt nicht mehr durch", async () => {
  frischerSpeicher();
  const env = testEnv();
  const { klartext, schluessel } = await erzeugeSchluessel(KONTO, {}, env);
  await widerrufeSchluessel(KONTO, schluessel.id, env);
  const { res } = await ruf("/v1/models", { env, headers: { authorization: `Bearer ${klartext}` } });
  assert.equal(res.zustand.status, 401);
  assert.equal(payload(res).error.code, "api_key_revoked");
});

// ---- Einheiten ---------------------------------------------------------------

test("verarbeiteStromZeile laesst unbekannte Zeilen unangetastet", () => {
  const messung = { promptTokens: 0, completionTokens: 0, gemessen: false };
  assert.equal(verarbeiteStromZeile(": ping", "smejj-1.0", messung).zeile, ": ping");
  assert.equal(verarbeiteStromZeile("", "smejj-1.0", messung).zeile, "");
  assert.equal(verarbeiteStromZeile("data: [DONE]", "smejj-1.0", messung).zeile, "data: [DONE]");
  assert.equal(verarbeiteStromZeile("data: {kaputt", "smejj-1.0", messung).zeile, "data: {kaputt");

  const umgeschrieben = verarbeiteStromZeile(
    `data: ${JSON.stringify({ model: "x", choices: [{ delta: { content: "abcd" } }] })}`,
    "smejj-1.0",
    messung
  );
  assert.match(umgeschrieben.zeile, /"model":"smejj-1\.0"/);
  assert.equal(umgeschrieben.inhaltZeichen, 4);
});

test("Modellkatalog bildet auf Routing-Profile ab", () => {
  assert.equal(profilFuerModell(""), "default");
  assert.equal(profilFuerModell("smejj-1.0-code"), "coding");
  assert.equal(profilFuerModell("smejj-1.0-fast"), "fast");
  assert.equal(profilFuerModell("gpt-4o"), "");
  assert.ok(istPublicModel(""));
  assert.ok(!istPublicModel("claude-opus-5"));
});

test("Nachrichtenpruefung: Rollen, Grenzen, Vision-Inhalte", () => {
  assert.equal(pruefeNachrichten([{ role: "boss", content: "hi" }]).code, "message_role_invalid");
  assert.equal(pruefeNachrichten([{ role: "user", content: 42 }]).code, "message_content_invalid");
  assert.equal(pruefeNachrichten(Array.from({ length: 201 }, () => ({ role: "user", content: "x" }))).code, "messages_too_many");
  const bild = pruefeNachrichten([{ role: "user", content: [{ type: "text", text: "was ist das?" }] }]);
  assert.equal(bild.ok, true);
  assert.equal(bild.messages[0].role, "user");
});
