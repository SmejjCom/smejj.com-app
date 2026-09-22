// TUEV fuer die DNS-Wache (Nr. 87): kranke UND gesunde Proben, ohne Netz.
//
// Der Anlass (21.09.2026): smejj.com war ~8 Minuten nicht aufloesbar — beide
// Nameserver des Anbieters lieferten SERVFAIL/REFUSED, Google und Cloudflare
// scheiterten, die Seite selbst lief. Keine Wache sah es. Hier steht darum vor
// allem, was schiefgehen kann — und dass ein eigener Netzfehler KEIN Urteil ist.
import test from "node:test";
import assert from "node:assert/strict";
import {
  DNS_SOLL, WIEDERHOLUNG_MS, frageNameserver, frageDoh, vergleicheSoll, beurteile,
  fuehreSelbsttestAus, laufDnsWache
} from "./dnsWacheAutopilot.js";
import { DECKUNG_IDS } from "./deckungsLaeufe.js";
import { IM_LAEUFER_BETRIEBEN } from "./autopilotLaeufer.js";
import { DECKUNG_AUTOPILOTEN } from "../admin/opsAutopilotenListeDeckung.js";
import { bereichVon } from "../admin/opsAutopilotenBereiche.js";

/** Ein Resolver-Doppel: antwortet wie ein gesunder Nameserver oder wirft wie ein toter. */
function resolverDoppel({ tot = [], a = DNS_SOLL.a, cname = [DNS_SOLL.apiCname] } = {}) {
  return (ip) => {
    const stirbt = tot.includes(ip);
    const wirf = () => { const e = new Error("queryA ETIMEOUT"); e.code = "ETIMEOUT"; throw e; };
    return {
      resolve4: async () => (stirbt ? wirf() : [...a]),
      resolve6: async () => [...DNS_SOLL.aaaa],
      resolveCname: async () => [...cname],
      resolveMx: async () => DNS_SOLL.mx.map((exchange) => ({ priority: 0, exchange })),
      resolveCaa: async () => [{ critical: 0, issue: "letsencrypt.org" }]
    };
  };
}

/** Ein fetch-Doppel fuer dns.google: je Name+Typ eine Antwort, sonst gesund aus dem Soll. */
function dohDoppel(sonder = {}) {
  const typNr = { A: 1, AAAA: 28, CNAME: 5, MX: 15, CAA: 257 };
  return async (url) => {
    const u = new URL(url); const name = u.searchParams.get("name"); const typ = u.searchParams.get("type");
    const key = `${name} ${typ}`;
    if (sonder[key] === "netz") throw new Error("fetch failed");
    const antwort = sonder[key] || (() => {
      if (name === "dns.google") return { Status: 0, AD: false, Answer: [{ type: 1, data: "8.8.8.8" }] };
      if (name.endsWith("spaceship.net")) return { Status: 0, AD: false, Answer: [{ type: 1, data: name.startsWith("launch1") ? "162.159.26.38" : "162.159.27.32" }] };
      if (name === DNS_SOLL.api) return { Status: 0, AD: true, Answer: [{ type: 5, data: `${DNS_SOLL.apiCname}.` }, { type: 1, data: "43.166.240.69" }].filter((x) => typ === "CNAME" ? x.type === 5 : x.type === 1) };
      const daten = { A: DNS_SOLL.a, AAAA: DNS_SOLL.aaaa, MX: DNS_SOLL.mx.map((m) => `0 ${m}.`), CAA: ['0 issue "letsencrypt.org"'] }[typ] || [];
      return { Status: 0, AD: true, Answer: daten.map((d) => ({ type: typNr[typ], data: d })) };
    })();
    return { json: async () => ({ Question: [{ name, type: typNr[typ] }], ...antwort }) };
  };
}

const ohneSchlaf = { schlaf: async () => {}, wiederholAbstandMs: 0 };

test("Selbsttest: kranke und gesunde Lagen werden richtig beurteilt", () => {
  const probe = fuehreSelbsttestAus();
  assert.deepEqual(probe.fehler, []);
  assert.equal(probe.bestanden, true);
  assert.equal(WIEDERHOLUNG_MS, 10_000);
});

test("GESUND: beide Nameserver, Google-DNS mit DNSSEC, Zone = Soll → gruen", async () => {
  const erg = await laufDnsWache({ fetchImpl: dohDoppel(), resolverFabrik: resolverDoppel(), ...ohneSchlaf });
  assert.equal(erg.ok, true, erg.meldung);
  assert.match(erg.meldung, /Nameserver 2\/2 antworten/);
  assert.match(erg.meldung, /mit DNSSEC/);
  assert.doesNotMatch(erg.meldung, /HINWEIS/);
});

test("KRANK (der Vorfall vom 21.09.): beide Nameserver tot, Google SERVFAIL → rot mit Ursache", async () => {
  const fetchImpl = dohDoppel({ [`${DNS_SOLL.zone} A`]: { Status: 2, AD: false, Answer: [] } });
  const erg = await laufDnsWache({ fetchImpl, resolverFabrik: resolverDoppel({ tot: ["162.159.26.38", "162.159.27.32"] }), ...ohneSchlaf });
  assert.equal(erg.ok, false);
  assert.match(erg.meldung, /NICHT aufloesbar|NICHT auflösbar/);
  assert.match(erg.meldung, /Status 2/);
  assert.match(erg.meldung, /ETIMEOUT/);
});

test("KRANK: beide Nameserver tot, Google noch aus dem Zwischenspeicher → trotzdem rot (Ursachen-Messung)", async () => {
  const erg = await laufDnsWache({ fetchImpl: dohDoppel(), resolverFabrik: resolverDoppel({ tot: ["162.159.26.38", "162.159.27.32"] }), ...ohneSchlaf });
  assert.equal(erg.ok, false);
  assert.match(erg.meldung, /BEIDE Nameserver/);
});

test("ZWEITER BLICK: ein Nameserver stolpert nur einmal → nach der Wiederholung gruen", async () => {
  let aufrufe = 0;
  const fabrik = (ip) => {
    const gesund = resolverDoppel()(ip);
    if (ip !== "162.159.27.32") return gesund;
    aufrufe += 1;
    return aufrufe === 1 ? resolverDoppel({ tot: [ip] })(ip) : gesund;
  };
  let geschlafen = 0;
  const erg = await laufDnsWache({ fetchImpl: dohDoppel(), resolverFabrik: fabrik, wiederholAbstandMs: 7, schlaf: async (ms) => { geschlafen += ms; } });
  assert.equal(erg.ok, true, erg.meldung);
  assert.equal(geschlafen, 7, "vor dem zweiten Blick wird gewartet");
  assert.equal(aufrufe, 2);
  assert.doesNotMatch(erg.meldung, /HINWEIS/);
});

test("HINWEIS statt ROT: ein Nameserver dauerhaft gestoert, der zweite traegt", async () => {
  const erg = await laufDnsWache({ fetchImpl: dohDoppel(), resolverFabrik: resolverDoppel({ tot: ["162.159.27.32"] }), ...ohneSchlaf });
  assert.equal(erg.ok, true);
  assert.match(erg.meldung, /HINWEIS: ein Nameserver gest/);
});

test("KRANK: DNSSEC-Kette gebrochen (AD fehlt) → rot, auch wenn alles aufloest", async () => {
  const fetchImpl = dohDoppel({ [`${DNS_SOLL.zone} A`]: { Status: 0, AD: false, Answer: DNS_SOLL.a.map((d) => ({ type: 1, data: d })) } });
  const erg = await laufDnsWache({ fetchImpl, resolverFabrik: resolverDoppel(), ...ohneSchlaf });
  assert.equal(erg.ok, false);
  assert.match(erg.meldung, /DNSSEC/);
});

test("KRANK: fremde Aenderung an der Zone (A-Adresse, CNAME) → rot mit Klartext-Unterschied", async () => {
  const erg = await laufDnsWache({ fetchImpl: dohDoppel(), resolverFabrik: resolverDoppel({ a: ["1.2.3.4"], cname: ["boese.example"] }), ...ohneSchlaf });
  assert.equal(erg.ok, false);
  assert.match(erg.meldung, /weicht vom eingefrorenen Soll ab/);
  assert.match(erg.meldung, /1\.2\.3\.4/);
  assert.match(erg.meldung, /boese\.example/);
});

test("KEIN URTEIL: der Server selbst hat kein Netz → gruen mit Vorbehalt, nicht rot", async () => {
  const erg = await laufDnsWache({ fetchImpl: dohDoppel({ "dns.google A": "netz" }), resolverFabrik: resolverDoppel({ tot: ["8.8.8.8", "162.159.26.38", "162.159.27.32"] }), ...ohneSchlaf });
  assert.equal(erg.ok, true);
  assert.match(erg.meldung, /Netz-Takt abgewartet/);
  const ohne = await laufDnsWache({ mitNetz: false });
  assert.equal(ohne.ok, true);
});

test("UDP gesperrt (Zeabur): Nameserver nicht messbar → Urteil nur ueber Google, mit Hinweis", async () => {
  const erg = await laufDnsWache({ fetchImpl: dohDoppel(), resolverFabrik: resolverDoppel({ tot: ["8.8.8.8", "162.159.26.38", "162.159.27.32"] }), ...ohneSchlaf });
  assert.equal(erg.ok, true, erg.meldung);
  assert.match(erg.meldung, /UDP\/53 gesperrt/);
  assert.match(erg.meldung, /Zone = Soll/);
});

test("Bausteine: Nameserver-Abfrage wirft nie, DoH-Netzfehler wird zum Feld, Soll-Vergleich ignoriert Punkt und Reihenfolge", async () => {
  const tot = await frageNameserver("162.159.26.38", { resolverFabrik: resolverDoppel({ tot: ["162.159.26.38"] }) });
  assert.equal(tot.ok, false); assert.equal(tot.fehler, "ETIMEOUT");
  const netz = await frageDoh("smejj.com", "A", { fetchImpl: async () => { throw new Error("fetch failed"); } });
  assert.equal(netz.ok, false); assert.match(netz.fehler, /fetch failed/);
  assert.deepEqual(vergleicheSoll({ a: [...DNS_SOLL.a].reverse(), aaaa: [], cname: ["smejj-control.Zeabur.App."], mx: [...DNS_SOLL.mx].reverse(), caa: [...DNS_SOLL.caa] }), []);
  assert.equal(beurteile({ netzOk: true, udpMoeglich: true, nameserver: [], doh: { ok: true, ad: true }, dohApi: { ok: false, status: 2 }, abweichungen: [] }).ok, false);
});

test("ANSCHLUSS Nr. 87: Laeufer, Registry (Nummer eindeutig), Bereich", () => {
  assert.ok(DECKUNG_IDS.includes("dns-wache"), "dns-wache fehlt in DECKUNG_IDS");
  assert.ok(IM_LAEUFER_BETRIEBEN.includes("dns-wache"), "dns-wache nicht wiederbelebbar");
  const eintrag = DECKUNG_AUTOPILOTEN.find((a) => a.id === "dns-wache");
  assert.ok(eintrag, "dns-wache fehlt in der Registry");
  assert.equal(eintrag.nummer, "87");
  assert.equal(eintrag.messung, "heartbeat");
  assert.equal(DECKUNG_AUTOPILOTEN.filter((a) => a.nummer === "87").length, 1, "Nummer 87 doppelt");
  assert.equal(bereichVon("dns-wache"), "Betrieb & Auslieferung");
});
