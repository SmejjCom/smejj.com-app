// smejj.com — Datensatz smejj-1-2: Regeltreue-Paare und Profil. Kaputte UND
// gesunde Probe. Ausführen: node --test tests/smejj-1-2-regeltreue.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { zeilengrenzePaare, budgetPaare, sperrePaare, regeltreuePaare } from "../scripts/training/smejj-1-1-regeltreue.mjs";
import { erzeugeErgaenzung } from "../scripts/training/smejj-1-1-generator.mjs";
import { PROFILE, profil, baue, leseSuiten } from "../scripts/training/smejj-1-1-datensatz-bauen.mjs";
import { wuerfel, erzeuge } from "../workers/con-autopilot/daten/generator.mjs";

const antwort = (p) => p.messages.at(-1).content;
const system = (p) => p.messages[0].content;

test("Zeilengrenze: ueber der Grenze wird aufgeteilt und die Zahl genannt, darunter nicht", () => {
  const paare = zeilengrenzePaare(wuerfel(3), 300);
  let ueber = 0, unter = 0;
  for (const p of paare) {
    const grenze = Number(system(p).match(/ueber (\d+) Zeilen/)[1]);
    assert.ok(antwort(p).includes(String(grenze)), `Grenze ${grenze} fehlt in: ${antwort(p).slice(0, 80)}`);
    if (/(aufteilen|zerlegen|auslagern|modular)/i.test(antwort(p)) && !/Nichts aufzuteilen|Kein Handlungsbedarf|in Ordnung/.test(antwort(p))) ueber += 1; else unter += 1;
  }
  assert.ok(ueber > 100 && unter > 80, `beide Seiten muessen vorkommen (ueber ${ueber}, unter ${unter})`);
});

test("Budget: die Antwort ist genau der Wert aus dem System-Prompt — oder ehrlich 'kein Budget'", () => {
  const paare = budgetPaare(wuerfel(5), 300);
  let treffer = 0, ehrlich = 0;
  for (const p of paare) {
    const a = antwort(p);
    if (/kein Budget|keinen festgelegten Wert/.test(a)) { ehrlich += 1; continue; }
    assert.ok(system(p).includes(`unter ${a}`), `Wert ${a} steht nicht im System-Prompt: ${system(p)}`);
    treffer += 1;
  }
  assert.ok(treffer > 200 && ehrlich > 30, `treffer ${treffer}, ehrlich ${ehrlich}`);
});

test("Sperre: Loeschbitten nennen die Freigabe und behaupten nie 'habe geloescht'; Erlaubtes wird erledigt", () => {
  const paare = sperrePaare(wuerfel(7), 400);
  let gesperrt = 0, erlaubt = 0;
  for (const p of paare) {
    const a = antwort(p);
    assert.doesNotMatch(a, /(habe|hab ich|wurde[n]?).{0,30}gel(oe|ö)scht/i, `Loeschbehauptung: ${a.slice(0, 80)}`);
    if (/^(Das ist gesperrt|Dafuer brauche ich|Nicht ohne Freigabe)/.test(a)) {
      assert.match(a, /Freigabe/); assert.match(a, /schriftlich/); gesperrt += 1;
    } else {
      assert.doesNotMatch(a, /^(Nein|Das mache ich nicht|Nicht ohne)/, `Erlaubtes verweigert: ${a.slice(0, 80)}`);
      erlaubt += 1;
    }
  }
  assert.ok(gesperrt > 150 && erlaubt > 100, `gesperrt ${gesperrt}, erlaubt ${erlaubt}`);
});

test("Regeltreue ist deterministisch und traegt die Kategorie", () => {
  const a = regeltreuePaare(wuerfel(11), 200), b = regeltreuePaare(wuerfel(11), 200);
  assert.deepEqual(a, b);
  assert.ok(a.every((p) => p.kategorie === "regeltreue"));
  assert.equal(erzeugeErgaenzung({ startwert: 4711 }).some((p) => p.kategorie === "regeltreue"), false, "Standard 0: smejj-1-1 bleibt nachbaubar");
  assert.equal(erzeugeErgaenzung({ startwert: 4711, regeltreue: 50 }).filter((p) => p.kategorie === "regeltreue").length, 50);
});

test("Profil smejj-1-2: Sicherheit unter einem Viertel, Regeltreue drin, gemischt — smejj-1-1 unveraendert", async () => {
  assert.equal(profil("smejj-1-1").mischen, false);
  assert.throws(() => profil("smejj-9-9"), /unbekannter Datensatz/);
  const p = profil("smejj-1-2");
  assert.equal(p.mischen, true);
  const roh = [...erzeuge({ startwert: p.startwert, ...p.mengen }), ...erzeugeErgaenzung({ startwert: p.startwert, ...p.ergaenzung })];
  const suiten = await leseSuiten();
  const { paare, manifest } = baue(roh, suiten, { startwert: p.startwert, name: p.name, mischen: true });
  assert.equal(manifest.name, "smejj-1-2"); assert.equal(manifest.gemischt, true);
  const k = manifest.kategorien;
  assert.ok(paare.length >= 3000, `zu wenige Paare: ${paare.length}`);
  assert.ok(k.sicherheit / paare.length < 0.25, `Sicherheitsanteil ${(k.sicherheit / paare.length * 100).toFixed(0)} % — das war der Fehler von smejj-1-1`);
  assert.ok(k.regeltreue >= 800, `Regeltreue ${k.regeltreue}`);
  assert.ok(k.reasoning / paare.length < 0.6, "kein Rechen-Uebergewicht");
  // Gemischt: die ersten 500 Zeilen tragen alle grossen Kategorien.
  const kopf = paare.slice(0, 500).map((x) => x.messages.find((m) => m.role === "user").content);
  const arten = new Set(kopf.map((f) => roh.find((r) => r.messages[1]?.content === f || r.messages.find((m) => m.role === "user")?.content === f)?.kategorie));
  for (const art of ["reasoning", "sicherheit", "regeltreue"]) assert.ok(arten.has(art), `Kategorie ${art} fehlt im Anfang — nicht gemischt`);
  // Determinismus des Profils (zweiter Bau gleich, ausser Zeitstempel)
  const zwei = baue(roh, suiten, { startwert: p.startwert, name: p.name, mischen: true });
  assert.equal(zwei.manifest.sha256, manifest.sha256);
  console.log("smejj-1-2:", paare.length, "Paare", JSON.stringify(k));
});
