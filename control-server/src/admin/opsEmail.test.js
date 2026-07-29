// smejj.com — Unit-Tests fuer die E-Mail-Sicht.
//
// Zwei Dinge sind hier wichtig:
//   1. Kein Passwort und kein SMTP-Benutzer verlassen das Modul.
//   2. Es wird keine Zustellquote erfunden — es gibt kein Zustellprotokoll.
//
// Ausfuehren: node --test control-server/src/admin/opsEmail.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { NICHT_ERFASST, emailUebersicht } from "./opsEmail.js";

const JETZT = Date.parse("2026-07-29T12:00:00.000Z");
const TAG_MS = 24 * 60 * 60 * 1000;

const SMTP = Object.freeze({
  SMEJJ_SMTP_HOST: "smtp.beispiel.example",
  SMEJJ_SMTP_PORT: "465",
  SMEJJ_SMTP_USER: "postbote@smejj.com",
  SMEJJ_SMTP_PASS: "streng-geheimes-postfach-passwort",
  SMEJJ_SMTP_FROM: "hallo@smejj.com"
});

const LEER = async () => ({ ok: true, entries: [] });

function konto(felder = {}) {
  return {
    email: "a@example.de", status: "active", emailVerified: false,
    createdAt: new Date(JETZT - 5 * TAG_MS).toISOString(), ...felder
  };
}

test("WEDER PASSWORT NOCH SMTP-BENUTZER VERLASSEN DAS MODUL", async () => {
  const e = await emailUebersicht({ env: SMTP, jetztMs: JETZT, leseIndex: LEER });
  const text = JSON.stringify(e);
  assert.equal(text.includes(SMTP.SMEJJ_SMTP_PASS), false, "das Passwort darf nirgends auftauchen");
  assert.equal(text.includes(SMTP.SMEJJ_SMTP_USER), false, "auch der SMTP-Benutzer nicht");
  assert.equal(e.versand.zugangsdatenGesetzt, true, "nur die Tatsache, nie der Wert");
  // Server, Port und Absender sind keine Geheimnisse und helfen beim Suchen.
  assert.equal(e.versand.server, "smtp.beispiel.example");
  assert.equal(e.versand.absender, "hallo@smejj.com");
});

test("KEINE ERFUNDENE ZUSTELLQUOTE", async () => {
  const e = await emailUebersicht({ env: SMTP, jetztMs: JETZT, leseIndex: LEER });

  // Geprueft werden FELDER, nicht Prosa: der Hinweistext darf das Wort
  // "Zustellquote" nennen — er erklaert ja gerade, dass es keine gibt. Ein
  // Test, der darueber stolpert, misst die Erklaerung statt der Sache.
  const felder = [];
  (function sammle(wert, pfad) {
    if (!wert || typeof wert !== "object") return;
    for (const [k, v] of Object.entries(wert)) {
      felder.push(pfad ? `${pfad}.${k}` : k);
      if (v && typeof v === "object") sammle(v, pfad ? `${pfad}.${k}` : k);
    }
  })(e, "");
  const verdaechtig = felder.filter((f) => /quote|rate|zugestellt|delivered|bounce/i.test(f));
  assert.deepEqual(verdaechtig, [], "kein Feld, das eine Zustellmessung vortaeuscht");

  assert.equal(e.nichtErfasst.punkte.length, NICHT_ERFASST.length);
  assert.equal(e.nichtErfasst.hinweis.includes("waere erfunden"), true);
});

test("nicht eingerichteter Versand ist der wichtigste Befund", async () => {
  const e = await emailUebersicht({ env: {}, jetztMs: JETZT, leseIndex: LEER });
  assert.equal(e.versand.eingerichtet, false);
  assert.equal(e.versand.zugangsdatenGesetzt, false);
  assert.equal(e.bewertung.includes("NICHT eingerichtet"), true);
  assert.equal(e.versand.folge.includes("keine Mail"), true, "die Folge steht dabei");
});

test("eine unvollstaendige Konfiguration gilt als nicht eingerichtet", async () => {
  // mailerConfig ist fail-closed: fehlt ein Teil, wird gar nichts verschickt.
  const e = await emailUebersicht({
    env: { ...SMTP, SMEJJ_SMTP_PASS: "" }, jetztMs: JETZT, leseIndex: LEER
  });
  assert.equal(e.versand.eingerichtet, false);
});

test("die Verschluesselung wird aus dem Port abgeleitet und benannt", async () => {
  const implizit = await emailUebersicht({ env: SMTP, jetztMs: JETZT, leseIndex: LEER });
  assert.equal(implizit.versand.verschluesselung.includes("465"), true);

  const starttls = await emailUebersicht({
    env: { ...SMTP, SMEJJ_SMTP_PORT: "587" }, jetztMs: JETZT, leseIndex: LEER
  });
  assert.equal(starttls.versand.verschluesselung.includes("STARTTLS"), true);
});

test("FRISCHE UNBESTAETIGTE KONTEN SIND DAS SIGNAL", async () => {
  // Wer sich heute registriert und nicht bestaetigt, hat den Link vielleicht
  // nie bekommen. Alte Faelle sind meist einfach verlorene Registrierungen.
  const e = await emailUebersicht({
    env: SMTP, jetztMs: JETZT,
    leseIndex: async () => ({ ok: true, entries: [
      konto({ email: "frisch1@example.de", createdAt: new Date(JETZT - 2 * 60 * 60 * 1000).toISOString() }),
      konto({ email: "frisch2@example.de", createdAt: new Date(JETZT - 5 * 60 * 60 * 1000).toISOString() }),
      konto({ email: "frisch3@example.de", createdAt: new Date(JETZT - 20 * 60 * 60 * 1000).toISOString() }),
      konto({ email: "alt@example.de", createdAt: new Date(JETZT - 40 * TAG_MS).toISOString() })
    ] })
  });
  assert.equal(e.konten.unbestaetigt, 4);
  assert.equal(e.konten.unbestaetigtHeuteOderGestern, 3);
  assert.equal(e.konten.aeltesteTage, 40, "aelteste zuerst");
  assert.equal(e.bewertung.includes("letzten 24 Stunden"), true);
  assert.equal(e.bewertung.includes("kann Zufall sein"), true,
    "ein Hinweis ist kein Beweis — das gehoert in den Satz");
});

test("DER SATZ MUSS ZUR KACHEL PASSEN", async () => {
  // Live gefunden (29.07.2026): die Kachel zeigte "Davon frisch: 2", der Satz
  // sagte "keines davon frisch". Die Schwelle (<3) hatte "wenige" in "keine"
  // verwandelt. Ein Bildschirm, der sich selbst widerspricht, ist schlimmer
  // als einer, der schweigt.
  const e = await emailUebersicht({
    env: SMTP, jetztMs: JETZT,
    leseIndex: async () => ({ ok: true, entries: [
      konto({ email: "frisch@example.de", createdAt: new Date(JETZT - 3 * 60 * 60 * 1000).toISOString() }),
      konto({ email: "alt1@example.de", createdAt: new Date(JETZT - 10 * TAG_MS).toISOString() }),
      konto({ email: "fertig@example.de", emailVerified: true })
    ] })
  });
  assert.equal(e.konten.unbestaetigtHeuteOderGestern, 1);
  assert.equal(e.bewertung.includes("keines davon"), false, "1 ist nicht 0");
  assert.equal(e.bewertung.includes("1 davon aus den letzten 24 Stunden"), true);
});

test("haengen ALLE aktiven Konten unbestaetigt, ist das kein Einzelfall mehr", async () => {
  const e = await emailUebersicht({
    env: SMTP, jetztMs: JETZT,
    leseIndex: async () => ({ ok: true, entries: [
      konto({ email: "a@example.de" }), konto({ email: "b@example.de" })
    ] })
  });
  assert.equal(e.konten.unbestaetigt, e.konten.gesamt);
  assert.equal(e.bewertung.includes("ALLE 2 aktiven Konten"), true);
  assert.equal(e.bewertung.includes("Zustellproblem"), true);
});

test("bestaetigte und gesperrte Konten zaehlen nicht als offen", async () => {
  const e = await emailUebersicht({
    env: SMTP, jetztMs: JETZT,
    leseIndex: async () => ({ ok: true, entries: [
      konto({ email: "fertig@example.de", emailVerified: true }),
      konto({ email: "gesperrt@example.de", status: "blocked" }),
      konto({ email: "offen@example.de" })
    ] })
  });
  assert.equal(e.konten.gesamt, 3);
  assert.equal(e.konten.unbestaetigt, 1);
});

test("ein unlesbares Verzeichnis wird benannt, nicht als Ruhe ausgelegt", async () => {
  const e = await emailUebersicht({
    env: SMTP, jetztMs: JETZT,
    leseIndex: async () => ({ ok: false, error: "index_not_built" })
  });
  assert.equal(e.ok, true, "die Ansicht bleibt bedienbar");
  assert.equal(e.konten.erreichbar, false);
  assert.equal(e.konten.unbestaetigt, undefined, "keine erfundene Null");
  assert.equal(e.bewertung.includes("nicht lesbar"), true);
});

test("eine geworfene Ausnahme kippt die Ansicht nicht", async () => {
  const e = await emailUebersicht({
    env: SMTP, jetztMs: JETZT,
    leseIndex: async () => { throw new Error("Netz weg"); }
  });
  assert.equal(e.ok, true);
  assert.equal(e.konten.erreichbar, false);
});
