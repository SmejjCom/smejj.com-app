// smejj.com — Unit-Tests fuer Modul W (Analytik).
//
// Der Kern dieses Moduls ist eine Verweigerung: es erfindet keine Besucherzahl.
// Die Tests pruefen deshalb nicht nur, dass die vier Reihen richtig zaehlen,
// sondern vor allem, dass eine nicht lesbare Quelle als "—" erscheint und
// niemals als 0. Eine erfundene Null ist der teuerste Fehler in einem
// Analytik-Bildschirm: sie sieht wie ein Befund aus.
//
// Ausfuehren: node --test control-server/src/admin/opsAnalytik.test.js
import test from "node:test";
import assert from "node:assert/strict";
import {
  NICHT_GEMESSEN, __zaehleNachTagFuerTests, analytikUebersicht, eintraegeMitDatum
} from "./opsAnalytik.js";

const JETZT = Date.parse("2026-07-29T12:00:00.000Z");
const TAG_MS = 24 * 60 * 60 * 1000;

function konto(tagOffset, felder = {}) {
  return {
    email: `k${tagOffset}@example.de`, role: "user", status: "active", emailVerified: true,
    activeSessions: 1, createdAt: new Date(JETZT - tagOffset * TAG_MS).toISOString(), ...felder
  };
}

const INDEX_FRISCH = async () => ({
  ok: true,
  builtAt: new Date(JETZT - 60 * 1000).toISOString(),
  ageSeconds: 60,
  count: 3,
  truncated: false,
  entries: [konto(0), konto(0), konto(3)]
});

const LEERE_ZAEHLUNG = async () => ({ ok: true, nachTag: new Map(), unvollstaendig: false });

test("EINE NICHT LESBARE QUELLE ZEIGT KEINE NULL", async () => {
  const e = await analytikUebersicht({
    jetztMs: JETZT, tage: 3,
    leseIndex: async () => ({ ok: false, error: "index_not_built" }),
    zaehleSchluessel: async () => ({ ok: false, error: "listing_fehlgeschlagen" }),
    zaehleKapseln: async () => ({ ok: false, error: "speicher_nicht_eingerichtet" })
  });

  assert.equal(e.ok, true, "die Ansicht bleibt bedienbar");
  for (const tag of e.tage) {
    assert.equal(tag.registrierungen, null, "null, nicht 0");
    assert.equal(tag.verwaltung, null);
    assert.equal(tag.mails, null);
    assert.equal(tag.laeufe, null);
  }
  assert.equal(e.reihen.registrierungen.erreichbar, false);
  assert.equal(e.reihen.registrierungen.grund, "index_not_built");
  assert.equal(e.bewertung.includes("Keine einzige Quelle"), true);
});

test("eine erreichbare Quelle DARF eine Null zeigen — das ist ein Messergebnis", async () => {
  const e = await analytikUebersicht({
    jetztMs: JETZT, tage: 2,
    leseIndex: async () => ({ ok: true, builtAt: new Date(JETZT).toISOString(), ageSeconds: 0, entries: [] }),
    zaehleSchluessel: LEERE_ZAEHLUNG,
    zaehleKapseln: LEERE_ZAEHLUNG
  });
  assert.equal(e.tage[0].verwaltung, 0, "gemessen und leer ist 0, nicht null");
  assert.equal(e.reihen.verwaltung.erreichbar, true);
  assert.equal(e.reihen.verwaltung.summeImZeitraum, 0);
});

test("Registrierungen werden nach Tag gezaehlt, aeltere fallen aus dem Zeitraum", async () => {
  const e = await analytikUebersicht({
    jetztMs: JETZT, tage: 2, leseIndex: INDEX_FRISCH,
    zaehleSchluessel: LEERE_ZAEHLUNG, zaehleKapseln: LEERE_ZAEHLUNG
  });
  assert.equal(e.tage[0].tag, "2026-07-29", "juengster Tag zuerst");
  assert.equal(e.tage[0].registrierungen, 2);
  assert.equal(e.tage[1].registrierungen, 0, "der Vortag ist gemessen leer");
  // Das 3 Tage alte Konto liegt ausserhalb — es darf die Summe nicht aufblasen.
  assert.equal(e.reihen.registrierungen.summeImZeitraum, 2);
});

test("EIN VERALTETER INDEX WIRD BENANNT, NICHT STILL UNTERSCHLAGEN", async () => {
  // Der Nutzer-Index ist eine Projektion. Ist er aelter als der juengste Tag,
  // koennen ganz frische Registrierungen fehlen — dann ist die Zahl eine
  // Untergrenze und darf nicht als Tatsache dastehen.
  const e = await analytikUebersicht({
    jetztMs: JETZT, tage: 3,
    leseIndex: async () => ({
      ok: true, builtAt: "2026-07-25T08:00:00.000Z", ageSeconds: 4 * 86400, entries: [konto(5)]
    }),
    zaehleSchluessel: LEERE_ZAEHLUNG, zaehleKapseln: LEERE_ZAEHLUNG
  });
  assert.equal(e.reihen.registrierungen.unvollstaendig, true);
  assert.equal(e.reihen.registrierungen.grundUnvollstaendig.includes("2026-07-25"), true);
  assert.equal(e.reihen.registrierungen.indexGebautAm, "2026-07-25T08:00:00.000Z");
});

test("eine abgeschnittene Liste ist eine Untergrenze und sagt das", async () => {
  const e = await analytikUebersicht({
    jetztMs: JETZT, tage: 2, leseIndex: INDEX_FRISCH,
    zaehleSchluessel: async () => ({
      ok: true, nachTag: new Map([["2026-07-29", 12]]), unvollstaendig: true
    }),
    zaehleKapseln: LEERE_ZAEHLUNG
  });
  assert.equal(e.reihen.verwaltung.unvollstaendig, true);
  assert.equal(e.reihen.verwaltung.grundUnvollstaendig.includes("Untergrenze"), true);
  assert.equal(e.bewertung.includes("Untergrenze"), true, "das gehoert in den Hauptsatz");
});

test("EIN EINTRAG OHNE DATUM LANDET NICHT AUF HEUTE", async () => {
  // Genau diese Klasse hat in Modul S Alter von rund 9700 Tagen erzeugt: ein
  // unbrauchbarer Zeitstempel, der stillschweigend zu einem Wert wurde.
  const e = await analytikUebersicht({
    jetztMs: JETZT, tage: 2,
    leseIndex: async () => ({
      ok: true, builtAt: new Date(JETZT).toISOString(), ageSeconds: 0,
      entries: [konto(0), konto(0, { createdAt: null }), konto(0, { createdAt: "1970-01-01T00:00:00.000Z" })]
    }),
    zaehleSchluessel: LEERE_ZAEHLUNG,
    zaehleKapseln: async () => ({ ok: true, nachTag: new Map([["", 4], ["2026-07-29", 1]]), unvollstaendig: false })
  });
  assert.equal(e.tage[0].registrierungen, 1, "nur das Konto mit brauchbarem Datum");
  assert.equal(e.reihen.registrierungen.ohneDatum, 2);
  assert.equal(e.tage[0].laeufe, 1, "die vier datenlosen Kapseln zaehlen nicht auf heute");
  assert.equal(e.reihen.laeufe.ohneDatum, 4);
});

test("der Bestand ist eine Momentaufnahme und heisst auch so", async () => {
  const e = await analytikUebersicht({
    jetztMs: JETZT, tage: 2,
    leseIndex: async () => ({
      ok: true, builtAt: new Date(JETZT).toISOString(), ageSeconds: 0,
      entries: [
        konto(1, { role: "owner" }),
        konto(2, { role: "user", status: "blocked", activeSessions: 0, emailVerified: false }),
        konto(3, { role: "user", activeSessions: 2 })
      ]
    }),
    zaehleSchluessel: LEERE_ZAEHLUNG, zaehleKapseln: LEERE_ZAEHLUNG
  });
  assert.equal(e.bestand.konten, 3);
  assert.equal(e.bestand.bestaetigt, 2);
  assert.equal(e.bestand.aktiveSitzungenJetzt, 3);
  assert.deepEqual(e.bestand.nachRolle, { owner: 1, user: 2 });
  assert.deepEqual(e.bestand.nachStatus, { active: 2, blocked: 1 });
  assert.equal("aktiveSitzungenJetzt" in e.bestand, true, "der Name sagt, dass es keine Reihe ist");
});

test("KEINE ERFUNDENE BESUCHERZAHL — weder als Feld noch als Wert", async () => {
  const e = await analytikUebersicht({
    jetztMs: JETZT, tage: 2, leseIndex: INDEX_FRISCH,
    zaehleSchluessel: LEERE_ZAEHLUNG, zaehleKapseln: LEERE_ZAEHLUNG
  });

  // Geprueft werden FELDNAMEN, nicht Prosa: der Hinweistext MUSS die Woerter
  // "Besucher" und "Seitenaufrufe" nennen — er erklaert ja gerade, dass es sie
  // nicht gibt. Ein Test ueber den ganzen JSON-Text wuerde die Erklaerung
  // messen statt der Sache (dieselbe Falle wie in Modul V).
  const felder = [];
  (function sammle(wert, pfad) {
    if (!wert || typeof wert !== "object") return;
    for (const [k, v] of Object.entries(wert)) {
      felder.push(pfad ? `${pfad}.${k}` : k);
      if (v && typeof v === "object") sammle(v, pfad ? `${pfad}.${k}` : k);
    }
  })(e, "");
  const verdaechtig = felder.filter((f) => /besucher|visitor|pageview|seitenaufruf|verweildauer|herkunft|klick/i.test(f));
  assert.deepEqual(verdaechtig, [], "kein Feld, das eine Besuchermessung vortaeuscht");

  assert.equal(e.nichtGemessen.punkte.length, NICHT_GEMESSEN.length);
  assert.equal(e.nichtGemessen.punkte.some((p) => /Besucher/i.test(p.was)), true);
  assert.equal(e.nichtGemessen.hinweis.includes("kein Skript"), true);
  assert.equal(e.bewertung.includes("Besucherzahlen gibt es nicht"), true);
});

test("DER FEHLERGRUND IST KURZ UND KENNT SICH — kein Quelltext in der Oberflaeche", async () => {
  // Live gefunden 2026-07-29: ein vertauschtes Argument hat den GESAMTEN
  // Quelltext von `fetch` in den Fehlertext geschrieben, der in der Konsole
  // angezeigt wird. Der Grund darf nur eine bekannte Kennung plus eine
  // gekuerzte Ursache sein — niemals ein Wert von aussen.
  const CFG = { endpoint: "https://beispiel.example", accessKey: "a", secretKey: "b", bucket: "c", region: "us-west-2" };
  const kaputt = async () => { throw new Error("etwas ist schiefgelaufen ".repeat(20)); };

  // Eine Kennung, die keine kurze Kleinbuchstaben-Kennung ist (hier: eine ganze
  // Funktion, genau wie im Fehlerfall), faellt auf "quelle" zurueck.
  const mitFunktion = await __zaehleNachTagFuerTests(CFG, ["admin/audit/2026/07/"], globalThis.fetch, kaputt);
  assert.equal(mitFunktion.ok, false);
  assert.equal(mitFunktion.error.startsWith("quelle_listing_fehlgeschlagen:"), true,
    "eine Funktion als Kennung druckt sich nicht selbst aus");
  assert.equal(mitFunktion.error.length <= 110, true, `Grund zu lang: ${mitFunktion.error.length}`);
  assert.equal(mitFunktion.error.includes("fetchImpl"), false, "kein Quelltext im Grund");

  // Mit richtiger Kennung steht sie drin — und die Ursache wird MITGENANNT,
  // damit ein Programmierfehler nicht wie ein toter Speicher aussieht.
  // signedS3List verschluckt die Ausnahme und meldet Status 0; die Ursache
  // steht dann nur im Body und wird von dort geholt.
  const mitKennung = await __zaehleNachTagFuerTests(CFG, ["admin/audit/2026/07/"], "audit", kaputt);
  assert.equal(mitKennung.error.startsWith("audit_listing_fehlgeschlagen:"), true);
  assert.equal(mitKennung.error.includes("etwas ist schiefgelaufen"), true,
    "die echte Ursache muss sichtbar sein, nicht nur 'http_0'");
  assert.equal(mitKennung.error.length <= 110, true, `Grund zu lang: ${mitKennung.error.length}`);

  // Ein echter HTTP-Fehler nennt seinen Status.
  const mitStatus = await __zaehleNachTagFuerTests(CFG, ["admin/audit/2026/07/"], "mail",
    async () => ({ ok: false, status: 503, text: async () => "" }));
  assert.equal(mitStatus.error, "mail_listing_fehlgeschlagen:http_503");
});

test("die Spanne ist gedeckelt und kippt nicht bei Unsinn", async () => {
  for (const [eingabe, erwartet] of [[0, 14], [-5, 14], [500, 90], [7, 7], ["3", 3]]) {
    const e = await analytikUebersicht({
      jetztMs: JETZT, tage: eingabe, leseIndex: INDEX_FRISCH,
      zaehleSchluessel: LEERE_ZAEHLUNG, zaehleKapseln: LEERE_ZAEHLUNG
    });
    assert.equal(e.zeitraumTage, erwartet, `tage=${eingabe}`);
    assert.equal(e.tage.length, erwartet);
  }
});

test("eine geworfene Ausnahme kippt die Ansicht nicht", async () => {
  const e = await analytikUebersicht({
    jetztMs: JETZT, tage: 2,
    leseIndex: async () => { throw new Error("Netz weg"); },
    zaehleSchluessel: async () => { throw new Error("S3 weg"); },
    zaehleKapseln: LEERE_ZAEHLUNG
  });
  assert.equal(e.ok, true);
  assert.equal(e.reihen.registrierungen.erreichbar, false);
  assert.equal(e.reihen.verwaltung.erreichbar, false);
  assert.equal(e.reihen.laeufe.erreichbar, true, "eine kaputte Quelle reisst die anderen nicht mit");
});

test("die Rohdaten-Map verlaesst das Modul nicht", async () => {
  const e = await analytikUebersicht({
    jetztMs: JETZT, tage: 2, leseIndex: INDEX_FRISCH,
    zaehleSchluessel: LEERE_ZAEHLUNG, zaehleKapseln: LEERE_ZAEHLUNG
  });
  assert.equal("nachTag" in e.reihen.registrierungen, false, "nach draussen geht die Summe");
  assert.equal(typeof e.reihen.registrierungen.summeImZeitraum, "number");
  // JSON.stringify wuerde eine Map als leeres Objekt liefern — dann waere die
  // Zahl fuer die Oberflaeche unsichtbar, ohne dass irgendwo ein Fehler steht.
  const durchJson = JSON.parse(JSON.stringify(e));
  assert.equal(durchJson.reihen.registrierungen.summeImZeitraum, 2);
  assert.equal(durchJson.tage[0].registrierungen, 2);
});

test("eintraegeMitDatum liest Schluessel und Zeitstempel paarweise", () => {
  const xml = '<?xml version="1.0"?><ListBucketResult>'
    + "<Contents><Key>capsules/app/job_a/CAPSULE.md</Key><LastModified>2026-07-29T09:00:00.000Z</LastModified></Contents>"
    + "<Contents><Key>capsules/app/job_a/ergebnis.json</Key><LastModified>2026-07-29T11:00:00.000Z</LastModified></Contents>"
    + "<Contents><Key>capsules/app/job_b/CAPSULE.md</Key><LastModified>1999-12-31T00:00:00.000Z</LastModified></Contents>"
    + "</ListBucketResult>";
  const treffer = eintraegeMitDatum(xml);
  assert.equal(treffer.length, 3);
  assert.equal(treffer[0].key, "capsules/app/job_a/CAPSULE.md");
  assert.equal(treffer[0].zeit, "2026-07-29T09:00:00.000Z");
  // Der deterministische Release-Bau setzt mtimes auf Epoche 0 — das erscheint
  // als 1999/1970 und ist KEIN gueltiger Zeitpunkt.
  assert.equal(treffer[2].zeit, "", "ein Datum vor 2020 gilt als unbrauchbar");
});
