// TUEV fuer den Zweig-Waechter ([[smejj-waechter-tuev]]): kaputte UND gesunde
// Probe. Geprueft wird die Bewertung, nicht Git — der Waechter exportiert sie
// darum getrennt vom Abholen der Zweige.
//
// Die Proben sind die drei Fassungen, die es wirklich gab: die Vorfall-Fassung
// vom 2026-08-14 (bevorzugt die loeschende Sammelform), die Zwischenfassung
// (Sperre da, nur nach Argumentnamen) und der heutige Stand.
import test from "node:test";
import assert from "node:assert/strict";
import {
  bewerteQuelle,
  entscheide,
  istArchiv,
  schaerfere,
  stufeVon
} from "../scripts/check-zweig-sperren.mjs";

// Fassung vom Vorfall: die Auswahl gibt der Sammelform Punkte, keine Sperre.
const VORFALL = `
  const punkte = (f) => {
    const namen = f.args.map((a) => a.name.toLowerCase());
    let p = 0;
    if (namen.some((n) => n.includes("service"))) p += 2;
    if (namen.some((n) => ["data", "variables", "envs"].includes(n))) p += 3;
    if (namen.some((n) => n === "key") && namen.some((n) => n === "value")) p += 1;
    return p;
  };
`;

// Zwischenfassung: Sperre da, aber sie sieht nur auf die Argumentnamen.
const ZWISCHEN = `
  if (namen.some((n) => n === "key") && namen.some((n) => n === "value")) p += 4;
  const sammel = namen.find((n) => ["data", "variables", "envs"].includes(n.toLowerCase()));
  if (sammel) throw new Error("zeabur_ersetzende_mutation_verweigert:" + mutation.name);
`;

// Heutiger Stand: beide Sperren, Erkennung am Map-Typ.
const HEUTE = `
  export function sammelArgumente(mutation) { return []; }
  if (sammel.length) throw new Error("zeabur_ersetzende_mutation_verweigert:" + mutation.name);
  throw new Error("zeabur_sammelwert_verweigert:" + mutation.name);
`;

const befund = (quelltext, { hatWache = true, archiv = false, frisch = true, zweig = "ein/zweig" } = {}) => {
  const b = { zweig, archiv, frisch, hatQuelle: true, hatWache, quelle: bewerteQuelle(quelltext) };
  b.stufe = stufeVon(b);
  return b;
};

test("kaputte Probe: die Vorfall-Fassung gilt als SCHARF", () => {
  const b = befund(VORFALL, { hatWache: false });
  assert.equal(b.stufe, "scharf");
  assert.equal(b.quelle.bevorzugtSammelform, true, "sie bevorzugt die loeschende Form sogar aktiv");
});

test("gesunde Probe: der heutige Stand gilt als vollstaendig", () => {
  const b = befund(HEUTE);
  assert.equal(b.stufe, "vollstaendig");
  assert.equal(b.quelle.bevorzugtSammelform, false);
});

test("die Zwischenfassung ist weder scharf noch fertig", () => {
  const b = befund(ZWISCHEN, { hatWache: false });
  assert.equal(b.stufe, "ungehaertet", "die Sperre haelt — es fehlen Haertung, zweite Sperre und Wache");
  assert.equal(
    b.quelle.bevorzugtSammelform,
    false,
    "die Namensliste in der SPERRE darf nicht mit der Punkteformel verwechselt werden"
  );
});

test("eine fehlende Wache allein macht einen Zweig ungehaertet, nicht scharf", () => {
  assert.equal(befund(HEUTE, { hatWache: false }).stufe, "ungehaertet");
});

test("wo das Skript gar nicht liegt, ist nichts zu schuetzen", () => {
  const b = { zweig: "x", archiv: false, frisch: true, hatQuelle: false, hatWache: false, quelle: bewerteQuelle("") };
  assert.equal(stufeVon(b), "unbetroffen");
});

// Der Waechter soll auf Dauer ernst genommen werden. Sicherungszweige sind
// Momentaufnahmen und wuerden ihn sonst fuer immer rot faerben.
test("Archivzweige werden erkannt", () => {
  assert.equal(istArchiv("sicherung/bau-branch-2026-08-14"), true);
  assert.equal(istArchiv("gh-pages"), true);
  assert.equal(istArchiv("fix/irgendwas"), false);
});

test("ein scharfer Zweig schliesst das Tor", () => {
  const urteil = entscheide([befund(VORFALL, { zweig: "fix/alt", hatWache: false })]);
  assert.equal(urteil.code, 1);
  assert.equal(urteil.scharf.length, 1);
});

test("gesunde Probe: lauter vollstaendige Zweige lassen das Tor offen", () => {
  const urteil = entscheide([befund(HEUTE, { zweig: "a" }), befund(HEUTE, { zweig: "b" })]);
  assert.equal(urteil.code, 0);
  assert.equal(urteil.scharf.length, 0);
});

test("ein scharfer ARCHIVzweig blockiert nicht, ein frischer schon", () => {
  const archiviert = entscheide([befund(VORFALL, { zweig: "sicherung/x", archiv: true, hatWache: false })]);
  assert.equal(archiviert.code, 0, "Momentaufnahmen duerfen nicht dauerhaft rot faerben");
  const alt = entscheide([befund(VORFALL, { zweig: "fix/laengst-tot", frisch: false, hatWache: false })]);
  assert.equal(alt.code, 0, "ein laengst ruhender Zweig ebenso wenig");
});

// DIESER FEHLER STECKTE IM ERSTEN ENTWURF DES WAECHTERS und wurde erst von der
// Gegenprobe gegen die echten Zweige gefunden: er fasste denselben Zweignamen
// ueber mehrere Remotes zum NEUESTEN Stand zusammen. fix/cve-klassifizierer-blind
// lag unter gh/ mit der loeschenden Fassung und unter origin/ bereits geheilt —
// der Waechter meldete gruen und uebersah genau den Ref, wegen dem es ihn gibt.
// Es zaehlt der schlechteste Stand: von einem scharfen Ref kann jemand
// abzweigen, egal wie aktuell ein anderer ist.
test("kaputte Probe: derselbe Zweig unter zwei Remotes — der SCHLECHTERE zaehlt", () => {
  const veraltet = befund(VORFALL, { zweig: "fix/doppelt", hatWache: false });
  const geheilt = befund(HEUTE, { zweig: "fix/doppelt" });
  assert.equal(schaerfere(geheilt, veraltet).stufe, "scharf", "erst der geheilte, dann der scharfe");
  assert.equal(schaerfere(veraltet, geheilt).stufe, "scharf", "und in der anderen Reihenfolge genauso");
  assert.equal(entscheide([schaerfere(geheilt, veraltet)]).code, 1, "das Tor muss zugehen");
});

test("schaerfere kommt mit einem fehlenden Vergleichswert zurecht", () => {
  const b = befund(HEUTE);
  assert.equal(schaerfere(undefined, b), b, "der erste Ref eines Zweiges hat keinen Vorgaenger");
});

// DIE Lehre aus der ersten Handmessung: eine kaputte Schleife meldete fuer
// JEDEN Zweig stillschweigend "Datei fehlt". Haette der Bericht das als "nichts
// gefunden, also alles gut" gelesen, waeren die zwei scharfen Zweige
// durchgerutscht.
test("kaputte Probe: nichts gemessen ist KEIN gruenes Ergebnis", () => {
  const urteil = entscheide([]);
  assert.equal(urteil.code, 1);
  assert.equal(urteil.grund, "keine_zweige_gemessen");
});
