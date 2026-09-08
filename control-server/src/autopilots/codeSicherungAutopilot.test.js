// TUEV fuer die Code-Sicherung (Nr. 85): kranke UND gesunde Proben.
//
// Der Anlass (2026-09-08): Die Code-Sicherung hing an einem einzigen Faden,
// der seit dem 05.09. gerissen war — die GitHub Action lief taeglich rot,
// "es wurde NICHTS gesichert", und niemand sah es. Dieser Autopilot ersetzt
// den Faden. Ein Sicherungs-Lauf, der nur an gesunden Proben getestet wurde,
// wiegt aber genauso in Sicherheit wie der stille Cron-Lauf davor: darum
// steht hier vor allem, was schiefgehen kann.
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  bewerteArchiv,
  vergleicheEtag,
  tagesSchluessel,
  laufCodeSicherung,
  PRAEFIX
} from "./codeSicherungAutopilot.js";

/** Ein Puffer, der sich wie ein echtes gzip-Archiv ausweist. */
function archiv(bytes = 9_000_000) {
  const puffer = Buffer.alloc(bytes, 7);
  puffer[0] = 0x1f;
  puffer[1] = 0x8b;
  return puffer;
}

const E2_ENV = {
  IDRIVE_E2_ENDPOINT: "https://e2.example",
  IDRIVE_E2_ACCESS_KEY: "a",
  IDRIVE_E2_SECRET_KEY: "s",
  IDRIVE_E2_BUCKET: "eimer"
};

const LEERE_LISTE = async () => ({ response: { ok: true }, body: "<ListBucketResult></ListBucketResult>" });

test("GESUND: ein normales Archiv wird angenommen", () => {
  const a = archiv();
  assert.equal(bewerteArchiv(a, a.length).brauchbar, true);
});

test("KRANK: eine Fehlerseite statt eines Archivs", () => {
  // GitHub antwortet im Stoerfall mit ein paar Kilobyte Text. Gross genug,
  // um unbemerkt gespeichert zu werden — und voellig wertlos.
  const html = Buffer.from("<html>Not Found</html>");
  assert.equal(bewerteArchiv(html, html.length).brauchbar, false);
});

test("KRANK: gross genug, aber kein gzip", () => {
  // Der Groessentest allein genuegt nicht: der Dateikopf entscheidet.
  const gross = Buffer.alloc(9_000_000, 65);
  assert.equal(bewerteArchiv(gross, gross.length).brauchbar, false);
});

test("KRANK: leere Antwort", () => {
  assert.equal(bewerteArchiv(Buffer.alloc(0), 0).brauchbar, false);
  assert.equal(bewerteArchiv(null, NaN).brauchbar, false);
});

test("KRANK: unerwartet riesig — lieber nachsehen als blind sichern", () => {
  const riesig = archiv(1000);
  assert.equal(bewerteArchiv(riesig, 500_000_000).brauchbar, false);
});

test("GESUND: e2 bestaetigt dieselbe Pruefsumme", () => {
  assert.equal(vergleicheEtag("abc123", '"abc123"'), "bestaetigt");
  assert.equal(vergleicheEtag("ABC123", "abc123"), "bestaetigt");
});

test("KRANK: e2 meldet eine ANDERE Pruefsumme", () => {
  // Das darf nie als Erfolg durchgehen: gespeichert ist dann etwas anderes,
  // als gesendet wurde.
  assert.equal(vergleicheEtag("abc123", '"ffffff"'), "abweichung");
});

test("UNKLAR: fehlendes oder mehrteiliges ETag ist kein Beweis — aber auch kein Fehler", () => {
  assert.equal(vergleicheEtag("abc123", ""), "unbestaetigt");
  assert.equal(vergleicheEtag("abc123", null), "unbestaetigt");
  assert.equal(vergleicheEtag("abc123", '"abc123-3"'), "unbestaetigt");
});

test("Der Schluessel traegt genau EINEN Tag", () => {
  assert.equal(
    tagesSchluessel("2026-09-08T13:45:00.000Z"),
    `${PRAEFIX}/smejj.com-app_2026-09-08.tar.gz`
  );
});

test("GESUND: der volle Lauf legt das Archiv ab und liest die Pruefsumme gegen", async () => {
  const a = archiv();
  const md5 = crypto.createHash("md5").update(a).digest("hex");
  let gespeichert = null;
  const ergebnis = await laufCodeSicherung({
    env: E2_ENV,
    jetztMs: Date.parse("2026-09-08T12:00:00Z"),
    fetchImpl: async () => ({ ok: true, status: 200, arrayBuffer: async () => a }),
    listImpl: LEERE_LISTE,
    putImpl: async (args) => { gespeichert = args; return { created: true, etag: `"${md5}"` }; }
  });
  assert.equal(ergebnis.ok, true);
  assert.equal(gespeichert.key, `${PRAEFIX}/smejj.com-app_2026-09-08.tar.gz`);
  assert.equal(gespeichert.ifNoneMatch, "*", "bestehende Schnappschuesse duerfen nie ueberschrieben werden");
  assert.match(ergebnis.meldung, /bestaetigt/);
});

test("KRANK-GEWESEN: der Upload bekommt eine eigene, grosszuegige Frist", async () => {
  // signedS3Put arbeitet standardmaessig mit 2,5 Sekunden — richtig fuer die
  // kleinen JSON-Datensaetze, fuer die es gebaut wurde, viel zu knapp fuer
  // 9 MB. Der erste echte Lauf gegen e2 scheiterte genau daran, und auf dem
  // Server waere er jeden Tag still an derselben Stelle gescheitert.
  let gesehen = null;
  await laufCodeSicherung({
    env: E2_ENV,
    jetztMs: Date.now(),
    fetchImpl: async () => ({ ok: true, arrayBuffer: async () => archiv() }),
    listImpl: LEERE_LISTE,
    putImpl: async (args) => { gesehen = args; return { created: true, etag: null }; }
  });
  assert.ok(gesehen.timeoutMs >= 60_000, `Upload-Frist zu knapp: ${gesehen.timeoutMs} ms`);
});

test("GESUND: liegt der heutige Stand schon, wird NICHT erneut geladen", async () => {
  // Der Takt laeuft oft am Tag. Ohne diese Bremse zoege jeder Takt 9 MB.
  let abrufe = 0;
  const ergebnis = await laufCodeSicherung({
    env: E2_ENV,
    jetztMs: Date.parse("2026-09-08T12:00:00Z"),
    fetchImpl: async () => { abrufe += 1; return { ok: true, arrayBuffer: async () => archiv() }; },
    listImpl: async () => ({
      response: { ok: true },
      body: `<ListBucketResult><Contents><Key>${PRAEFIX}/smejj.com-app_2026-09-08.tar.gz</Key></Contents></ListBucketResult>`
    }),
    putImpl: async () => { throw new Error("haette nicht schreiben duerfen"); }
  });
  assert.equal(ergebnis.ok, true);
  assert.equal(abrufe, 0, "es darf nichts geladen werden, wenn der Tag schon gesichert ist");
});

test("KRANK: GitHub antwortet mit einem Fehler — der Lauf meldet, wirft aber nicht", async () => {
  // Ein Sicherungs-Autopilot, der den Taktgeber mitreisst, waere schlimmer
  // als der Ausfall, den er verhindern soll.
  const ergebnis = await laufCodeSicherung({
    env: E2_ENV,
    jetztMs: Date.now(),
    fetchImpl: async () => ({ ok: false, status: 503 }),
    listImpl: LEERE_LISTE,
    putImpl: async () => { throw new Error("haette nicht schreiben duerfen"); }
  });
  assert.equal(ergebnis.ok, false);
  assert.match(ergebnis.meldung, /503/);
});

test("KRANK: eine Fehlerseite wird NICHT gespeichert", async () => {
  let geschrieben = false;
  const ergebnis = await laufCodeSicherung({
    env: E2_ENV,
    jetztMs: Date.now(),
    fetchImpl: async () => ({ ok: true, arrayBuffer: async () => Buffer.from("<html>oops</html>") }),
    listImpl: LEERE_LISTE,
    putImpl: async () => { geschrieben = true; return { created: true }; }
  });
  assert.equal(ergebnis.ok, false);
  assert.equal(geschrieben, false, "ein verworfenes Archiv darf den guten Stand nicht ersetzen");
  assert.match(ergebnis.meldung, /NICHTS gespeichert/);
});

test("KRANK: e2 speichert etwas anderes, als gesendet wurde", async () => {
  const ergebnis = await laufCodeSicherung({
    env: E2_ENV,
    jetztMs: Date.now(),
    fetchImpl: async () => ({ ok: true, arrayBuffer: async () => archiv() }),
    listImpl: LEERE_LISTE,
    putImpl: async () => ({ created: true, etag: '"00000000000000000000000000000000"' })
  });
  assert.equal(ergebnis.ok, false);
  assert.match(ergebnis.meldung, /nicht vertrauenswuerdig/);
});

test("GESUND: ohne e2-Zugang ist Ruhe, kein Fehler", async () => {
  // Lokal und in Tests ist das der Normalfall. Ein roter Befund dafuer waere
  // ein Fehlalarm, und Fehlalarme werden weggeklickt.
  const ergebnis = await laufCodeSicherung({ env: {}, jetztMs: Date.now() });
  assert.equal(ergebnis.ok, true);
  assert.match(ergebnis.meldung, /kein e2-Zugang/);
});

test("KRANK: zwei Takte gleichzeitig — der zweite ueberschreibt nichts", async () => {
  const ergebnis = await laufCodeSicherung({
    env: E2_ENV,
    jetztMs: Date.now(),
    fetchImpl: async () => ({ ok: true, arrayBuffer: async () => archiv() }),
    listImpl: LEERE_LISTE,
    // Genau das meldet signedS3Put bei If-None-Match, wenn schon etwas liegt.
    putImpl: async () => ({ ok: false, created: false, status: 412, conditionEnforced: true })
  });
  assert.equal(ergebnis.ok, true);
  assert.match(ergebnis.meldung, /Wettlauf/);
});
