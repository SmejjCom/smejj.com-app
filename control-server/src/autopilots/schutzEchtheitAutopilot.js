// smejj.com — Schutz-Echtheit (Autopilot Nr. 82), Betreiber-Auftrag 2026-09-04
// abends: "Taeglichen Phantom-Waechter bauen".
//
// WARUM ES IHN GIBT — der Befund, an dem ein ganzer Tag verlorenging:
// Jede Sperre (check-*-lock.mjs) vergleicht ihr Manifest mit der ARBEITSKOPIE.
// Beide koennen uebereinstimmen und trotzdem beide falsch sein. Am 2026-09-04
// war genau das der Fall: der Start-Lock meldete GRUEN und bewachte dabei vier
// Fassungen, die smejj.com gar nicht ausliefert —
//   composer-plus-menu.js  Manifest 6d26716c, ausgeliefert 5f3a314d
//   index.html             Manifest 4b450e89, ausgeliefert 5be2690b
//   app.js                 Manifest 5342b75e, ausgeliefert 7a0263e7
//   sw.js                  Manifest ca1dd35d, ausgeliefert 14bea8b0
// Die echten, ausgelieferten Dateien waren voellig ungeschuetzt. Aufgefallen
// ist es nur, weil ein Mensch die Zahlen gegen die Wirklichkeit gehalten hat.
//
// Dieser Lauf stellt diese eine Frage taeglich: Stimmt der eingefrorene Hash
// mit dem ueberein, was die Nutzer WIRKLICH bekommen?
//
// DREI-WEG-EINORDNUNG, und darauf kommt es an:
//   Manifest == Arbeitskopie, aber != Auslieferung -> STUMM FALSCH, rot.
//     Nur diesen Fall sieht sonst niemand.
//   Manifest != Arbeitskopie -> VERALTET, gelb. Die eigene Sperre ist bereits
//     rot und sagt es laut; zweimal derselbe Befund laesst zweimal suchen.
//   Nicht abrufbar oder gebuendeltes Artefakt -> uebersprungen, nie rot.
//     "Nicht messbar" ist kein Verstoss.
//
// Die Logik liegt in scripts/check-schutz-echtheit.mjs und wird von dort
// geladen: EIN Ort, an dem die Regel steht — der Autopilot gibt ihr nur einen
// Takt. Zwei Fassungen derselben Pruefung liefen frueher oder spaeter
// auseinander, und dann bewacht die eine, was die andere durchlaesst.
// FAIL-SAFE STATT FAIL-FATAL (Befund 2026-09-05): Dieser Import stand als
// statische Zeile hier — und als die Datei im Abbild fehlte, startete der
// GANZE Control-Server nicht mehr. api.smejj.com antwortete eine Stunde mit
// 502, Chat und Anmeldung waren tot, wegen eines Waechters.
//
// Ein Waechter darf den Dienst, den er bewacht, niemals mitreissen. Der Import
// laeuft deshalb dynamisch und faellt weich: fehlt die Datei, meldet der
// Autopilot ehrlich "nicht messbar" — und alles andere laeuft weiter.
let MANIFESTE = [];
let pruefeManifest = null;
let ladeFehler = null;
try {
  const m = await import("../../../scripts/check-schutz-echtheit.mjs");
  MANIFESTE = m.MANIFESTE;
  pruefeManifest = m.pruefeManifest;
} catch (f) {
  ladeFehler = String(f?.message || f).slice(0, 120);
}
export { MANIFESTE, ladeFehler };

/**
 * Selbsttest aus kaputter UND gesunder Probe. Ein Waechter, der nur die heile
 * Lage sieht, koennte klaglos gruen melden, weil er gar nicht hinsieht.
 */
export async function fuehreSelbsttestAus() {
  const fehler = [];
  const manifest = { name: "probe", pfad: "docs/security/autopilot-nummern-lock.json" };

  // Gesunde Probe: die Auslieferung entspricht dem Eingefrorenen.
  // (Die Attrappe liefert immer denselben Inhalt; das Manifest kennt seinen Hash nicht,
  //  deshalb wird hier nur geprueft, dass NICHTS faelschlich als Phantom gilt.)
  const nichtAbrufbar = await pruefeManifest(manifest, "https://probe.test", async () => null);
  if (nichtAbrufbar.phantome.length) fehler.push("nicht abrufbare Dateien gelten faelschlich als Phantom");

  // Kaputte Probe: ein Artefakt darf nie als Phantom zaehlen.
  const artefakt = await pruefeManifest(manifest, "https://probe.test",
    async () => Buffer.from("// ERZEUGTE DATEI — nicht von Hand bearbeiten.\nirgendetwas"));
  if (artefakt.phantome.length) fehler.push("ein gebuendeltes Artefakt gilt faelschlich als Phantom");

  return { bestanden: fehler.length === 0, geprueft: 2, fehler };
}

/** Der Lauf im Takt. Ohne Netz wird nichts behauptet. */
export async function laufSchutzEchtheit({ mitNetz = true, basis = "https://smejj.com" } = {}) {
  // Fehlt die Pruefsatz-Datei, ist das "nicht messbar" — kein Verstoss und
  // erst recht kein Grund, den Lauf mit einem TypeError abzubrechen.
  if (ladeFehler || typeof pruefeManifest !== "function") {
    return { ok: true, meldung: `Nicht messbar: die Pruefsatz-Datei fehlt im Abbild (${ladeFehler || "pruefeManifest nicht geladen"}) — COPY-Zeile im Dockerfile pruefen` };
  }
  const probe = await fuehreSelbsttestAus();
  if (!probe.bestanden) {
    return { ok: false, meldung: `Schutz-Echtheit beurteilt bekannte Lagen falsch: ${probe.fehler.join("; ")}` };
  }
  if (!mitNetz) {
    return { ok: true, meldung: `Netz-Takt abgewartet — ${MANIFESTE.length} Manifeste stehen zur Pruefung bereit` };
  }

  const stumm = [];
  const veraltet = [];
  let geprueft = 0;
  let uebersprungen = 0;
  for (const eintrag of MANIFESTE) {
    const b = await pruefeManifest(eintrag, basis);
    if (b.fehlt) { veraltet.push(`${b.name}: Manifest fehlt`); continue; }
    geprueft += b.geprueft;
    uebersprungen += b.nichtMessbar.length + (b.artefakte || []).length;
    for (const p of b.phantome) stumm.push(`${b.name}/${p.datei}`);
    for (const v of b.veraltet || []) veraltet.push(`${b.name}/${v.datei}`);
  }

  if (stumm.length) {
    return {
      ok: false,
      meldung: `${stumm.length} Sperre(n) bewachen eine Fassung, die niemand bekommt — und melden dabei gruen: `
        + `${stumm.slice(0, 4).join(", ")}${stumm.length > 4 ? " …" : ""}. `
        + `Die ausgelieferten Dateien sind ungeschuetzt. Ausgelieferte Fassung in den Zweig holen, dann neu stempeln.`
    };
  }
  const nachsatz = veraltet.length
    ? ` ${veraltet.length} veraltet (die eigene Sperre meldet das bereits): ${veraltet.slice(0, 3).join(", ")}`
    : "";
  return {
    ok: true,
    meldung: `Selbsttest ${probe.geprueft}/${probe.geprueft}; ${geprueft} ausgelieferte Dateien aus `
      + `${MANIFESTE.length} Manifesten stimmen mit ${basis} ueberein (${uebersprungen} uebersprungen).${nachsatz}`
  };
}
