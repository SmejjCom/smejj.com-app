// smejj.com — Spur 2 "Marktwache" (Betreiber 21.09.2026): die Wissens-Ernte
// beobachtet auch Markt und Wettbewerb, merkt sich die QUELLE jedes Fundes,
// nimmt keine Berichtsreste mehr auf und laesst Altes verfallen.
import test from "node:test";
import assert from "node:assert/strict";
import { MARKT_THEMEN, STANDARD_THEMEN, themaFuer, themenListe } from "../src/markt/marktthemen.js";
import {
  ERNTE_HALTBAR_TAGE, ernteFaktenAusFunden, extractHarvestedFacts, fundFingerabdruck, ladeErnteChunks
} from "../control-server/src/autopilots/realtimeInternetHarvesterAutopilot.js";

test("Themen: Markt und Wettbewerb sind dabei, eigene Liste sticht, Unsinn wird ignoriert", () => {
  assert.ok(STANDARD_THEMEN.length >= 9);
  assert.ok(MARKT_THEMEN.some((t) => /Preise|Vergleich|Wettbewerb|Anbieter/i.test(t)));
  assert.deepEqual(themenListe({}), [...STANDARD_THEMEN]);
  assert.deepEqual(themenListe({ SMEJJ_MARKT_THEMEN: "Preise der KI-Anbieter|Neue Modelle diese Woche" }),
    ["Preise der KI-Anbieter", "Neue Modelle diese Woche"]);
  assert.deepEqual(themenListe({ SMEJJ_MARKT_THEMEN: "  |x|  " }), [...STANDARD_THEMEN], "zu kurze Themen sind keine Liste");
});

test("Themenwahl geht reihum, nie gewuerfelt — jedes Thema kommt dran", () => {
  const themen = ["a1234567", "b1234567", "c1234567"];
  assert.deepEqual([0, 1, 2, 3].map((i) => themaFuer(i, themen)), ["a1234567", "b1234567", "c1234567", "a1234567"]);
  assert.equal(themaFuer("keine Zahl", themen), "a1234567");
  assert.ok(STANDARD_THEMEN.includes(themaFuer(5, [])));
});

test("Fakten kommen aus echten Funden — mit Adresse, ohne Dubletten, ohne quellenlose Saetze", () => {
  const funde = [
    { title: "Anbieter X senkt Preise", snippet: "Der Anbieter X hat die Preise seiner Schnittstelle um 30 Prozent gesenkt.", url: "https://example.org/preise" },
    { title: "Anbieter X senkt Preise", snippet: "Der Anbieter X hat die Preise seiner Schnittstelle um 30 Prozent gesenkt.", url: "https://example.org/preise" },
    { title: "Ohne Adresse", snippet: "Dieser Fund hat keine brauchbare Adresse und faellt heraus.", url: "" },
    { title: "Zu kurz", snippet: "kurz", url: "https://example.org/kurz" }
  ];
  const fakten = ernteFaktenAusFunden(funde, "KI-Anbieter Preise");
  assert.equal(fakten.length, 1);
  assert.equal(fakten[0].url, "https://example.org/preise");
  assert.ok(fakten[0].tags.includes("preise"));
  assert.equal(typeof fakten[0].abdruck, "string");
  assert.equal(fundFingerabdruck(fakten[0]), fakten[0].abdruck);
  assert.deepEqual(ernteFaktenAusFunden(null, "x"), []);
});

test("Berichtsreste werden nicht mehr als Wissen aufgenommen (Fund 21.09.: 42 von 42 Laeufen)", () => {
  const bericht = [
    "*Erstellt am 21.9.2026 von smejj Deep Research Autopilot*",
    "## 1. Zusammenfassung der Erkenntnisse",
    "[1] https://example.org/quelle-eins-mit-langer-adresse",
    "- **Echte Zeile**: Hier steht ein Satz, der wirklich etwas aussagt und lang genug ist."
  ].join("\n");
  const fakten = extractHarvestedFacts(bericht, "Test");
  assert.equal(fakten.length, 1);
  assert.match(fakten[0].summary, /Echte Zeile/);
});

test("Wissensspeicher: Quelle und Stand stehen im Text, Altes faellt raus, Neues zuerst", async () => {
  const jung = new Date().toISOString();
  const alt = new Date(Date.now() - (ERNTE_HALTBAR_TAGE + 5) * 86_400_000).toISOString();
  const datensaetze = [
    { id: "b-alt", topic: "Altes Thema", createdAt: alt, facts: [{ headline: "Alt", summary: "Ein alter Fund, der laengst nicht mehr aktuell ist.", url: "https://example.org/alt" }] },
    { id: "b-neu", topic: "KI-Anbieter Preise", createdAt: jung, facts: [
      { headline: "Neu", summary: "Anbieter X senkt die Preise seiner Schnittstelle deutlich.", url: "https://example.org/neu" },
      { headline: "Leer", summary: "zu kurz", url: "https://example.org/leer" }
    ] }
  ];
  const chunks = await ladeErnteChunks({ env: {}, maxFakten: 50, listeLader: async () => ({ ok: true, datensaetze }) });
  assert.equal(chunks.length, 1, "alter Stapel und zu kurzer Fakt fallen weg");
  assert.match(chunks[0].text, /Quelle: https:\/\/example\.org\/neu/);
  assert.match(chunks[0].text, /Stand \d{4}-\d{2}-\d{2}/);
  assert.match(chunks[0].source, /^internet-ernte\//);
});
