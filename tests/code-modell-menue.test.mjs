// Waechter fuer das ausgelagerte Modell-Menue (public/code-modell-menue.js).
//
// Warum es diesen Test gibt: das Menue wurde am 2026-08-18 aus code-flaeche.js
// herausgeloest (800-Zeilen-Regel). Beim Herausloesen ist der teuerste Fehler
// ein STILLER — eine Zeile ruft noch eine Funktion, die mit umgezogen ist, und
// niemand merkt es, weil die Datei trotzdem laedt. Der Test loest das Menue
// darum wirklich AUS statt es nur zu importieren (Blindgaenger-Verbot).
//
// Waechter-TUEV: jeder Fall hat eine gesunde UND eine kaputte Probe.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ---- DOM-Attrappe. Bewusst handgeschrieben wie in den uebrigen Tests des
// Hauses (kein jsdom im Projekt) — sie kann genau so viel, wie das Menue
// anfasst, und nicht mehr.
function element(tag = "div") {
  const el = {
    tagName: tag.toUpperCase(),
    id: "",
    className: "",
    textContent: "",
    type: "",
    title: "",
    disabled: false,
    hidden: false,
    style: {},
    attrs: {},
    kinder: [],
    listeners: {},
    dataset: {},
    setAttribute(name, wert) { this.attrs[name] = String(wert); },
    getAttribute(name) { return this.attrs[name] ?? null; },
    addEventListener(art, hand) { (this.listeners[art] ||= []).push(hand); },
    removeEventListener() {},
    append(...knoten) { for (const k of knoten) { k.eltern = this; this.kinder.push(k); } },
    appendChild(k) { this.append(k); return k; },
    remove() {
      const liste = this.eltern?.kinder;
      if (liste) liste.splice(liste.indexOf(this), 1);
      this.eltern = null;
    },
    closest() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { top: 100, bottom: 130, left: 40, right: 140, width: 100, height: 30 }; },
    click() { for (const h of this.listeners.click || []) h({ stopPropagation() {}, preventDefault() {} }); },
    focus() {}
  };
  return el;
}

// Alle je erzeugten Knoten flach durchsuchbar machen — so findet der Test die
// Menuezeilen, ohne die Baumstruktur nachzubauen.
function alleKnoten(wurzel, treffer = []) {
  treffer.push(wurzel);
  for (const k of wurzel.kinder || []) alleKnoten(k, treffer);
  return treffer;
}

function umgebungAufbauen({ fetchAntwort, mitChip = true } = {}) {
  const registry = new Map();
  const ereignisse = [];
  const speicher = new Map();
  const chip = element("button");
  chip.id = "codeModellAnzeige";
  const feld = element("div");
  feld.className = "codefeld";
  feld.append(chip);
  chip.closest = (auswahl) => (auswahl === ".codefeld" ? feld : null);

  const doc = {
    getElementById: (id) => registry.get(id) || null,
    createElement: (tag) => {
      const el = element(tag);
      // Ein Knoten wird erst auffindbar, wenn er eine id traegt UND im
      // Dokument haengt — das Menue setzt beides direkt nacheinander.
      Object.defineProperty(el, "id", {
        get() { return el.attrs.id || ""; },
        set(wert) { el.attrs.id = wert; if (wert) registry.set(wert, el); }
      });
      const echtesRemove = el.remove.bind(el);
      el.remove = () => { if (el.attrs.id) registry.delete(el.attrs.id); echtesRemove(); };
      return el;
    },
    querySelector: () => null,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: (e) => { ereignisse.push(e); return true; },
    body: element("body")
  };
  // Ohne Chip bleibt die Registry leer — sonst faende das Menue ihn ueber
  // den Rueckfall document.getElementById("codeModellAnzeige") doch noch.
  if (mitChip) registry.set("codeModellAnzeige", chip);

  globalThis.document = doc;
  globalThis.window = {
    dispatchEvent: (e) => { ereignisse.push(e); return true; },
    addEventListener: () => {},
    removeEventListener: () => {},
    innerHeight: 800,
    innerWidth: 1280
  };
  globalThis.sessionStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
  };
  globalThis.localStorage = {
    getItem: (k) => (speicher.has(k) ? speicher.get(k) : null),
    setItem: (k, v) => speicher.set(k, String(v)),
    removeItem: (k) => speicher.delete(k)
  };
  globalThis.CustomEvent = class { constructor(typ, init = {}) { this.type = typ; this.detail = init.detail; } };
  globalThis.fetch = async () => fetchAntwort ?? { ok: true, status: 200, json: async () => ({ models: [] }) };
  return { chip, feld, ereignisse, speicher };
}

const { MODELL_KEY, AUTO_WAHL, migriereAlteWahl, modellAnzeige, oeffneModellMenue } =
  await (async () => { umgebungAufbauen(); return import("../public/code-modell-menue.js"); })();

test("modellAnzeige nimmt den Haustext, solange Auto nicht gewaehlt ist", () => {
  umgebungAufbauen();
  assert.equal(modellAnzeige("Schnell"), "Schnell");
  // Gesunde Probe: mit Auto steht "Auto" da, nicht der Haustext.
  localStorage.setItem(MODELL_KEY, AUTO_WAHL);
  assert.equal(modellAnzeige("Schnell"), "Auto");
  // Kaputte Probe: eine Stufe darf NICHT als Auto durchgehen.
  localStorage.setItem(MODELL_KEY, "smejj 1.2");
  assert.equal(modellAnzeige("Schnell"), "Schnell");
});

test("eine alte Cline-Wahl im Browser wird still auf Auto gesetzt", () => {
  // Ohne diese Migration zeigte die Wahl eines wiederkehrenden Nutzers auf
  // etwas, das es nicht mehr gibt — das Menue markierte dann gar nichts.
  umgebungAufbauen();
  localStorage.setItem(MODELL_KEY, "Cline");
  localStorage.setItem("smejj.cline.model.v1", "cline-pass/minimax-m3");
  assert.equal(migriereAlteWahl(localStorage), true);
  assert.equal(localStorage.getItem(MODELL_KEY), AUTO_WAHL);
  assert.equal(localStorage.getItem("smejj.cline.model.v1"), null, "der zweite Speicher wird mit aufgeraeumt");
  // Kaputte Probe: eine gueltige Wahl darf die Migration NICHT anfassen.
  localStorage.setItem(MODELL_KEY, "smejj 1.3");
  assert.equal(migriereAlteWahl(localStorage), false);
  assert.equal(localStorage.getItem(MODELL_KEY), "smejj 1.3");
});

test("oeffneModellMenue zeichnet das Menue und die Wahl greift wirklich", async () => {
  const { chip } = umgebungAufbauen();
  let neuGezeichnet = 0;
  await oeffneModellMenue({ chip, beiWahl: () => { neuGezeichnet += 1; } });

  const menue = document.getElementById("codeModellMenue");
  assert.ok(menue, "das Menue wurde nicht in das Dokument gehaengt");
  const knoepfe = alleKnoten(menue).filter((k) => k.tagName === "BUTTON");
  // Fuenf Zeilen sind seit der Staffel (Betreiber-Ansage 2026-09-07) das
  // Minimum: smejj 1.3 bis 1.0 und Auto. Katalog-Modelle kommen erst mit einer
  // Antwort dazu (hier leer).
  assert.ok(knoepfe.length >= 5, `zu wenige Menuezeilen: ${knoepfe.length}`);

  // Die Staffel steht absteigend, Auto ganz unten. Bis zum 06.09. stand Auto
  // oben (Auftrag vom 18.08.); die neue Ansage kehrt die Reihenfolge um.
  const beschriftung = (k) => alleKnoten(k).map((n) => n.textContent).filter(Boolean).join(" ");
  assert.match(beschriftung(knoepfe[0]), /smejj 1\.3/);
  assert.match(beschriftung(knoepfe[3]), /smejj 1\.0/);
  assert.match(beschriftung(knoepfe[4]), /Auto/);

  // AUSLOESEN, nicht nur zeichnen: der Klick muss den Speicher setzen und
  // den Rueckruf feuern — genau die zwei Draehte, die beim Auslagern
  // haetten reissen koennen.
  knoepfe[0].click();
  assert.equal(localStorage.getItem(MODELL_KEY), "smejj 1.3");
  // Die Stufe MUSS mitgewandert sein, sonst ist die Wahl folgenlos.
  assert.equal(localStorage.getItem("smejj.stufe.v1"), "spezial");
  assert.equal(neuGezeichnet, 1, "beiWahl wurde nicht gerufen — die Anzeige bliebe stehen");
  assert.equal(document.getElementById("codeModellMenue"), null, "das Menue blieb nach der Wahl offen");
});

test("die Auto-Zeile setzt Auto — und keinen Umweg ueber einen Fremdanbieter", async () => {
  // Auto steht ganz unten; der Draht darf beim Umsortieren nicht reissen.
  // Und er darf nicht wieder auf einen fremden Anbieter zeigen: genau das
  // liess bis 2026-09-10 jede Auto-Anfrage ohne Fremdschluessel scheitern.
  const { chip } = umgebungAufbauen();
  let neuGezeichnet = 0;
  await oeffneModellMenue({ chip, beiWahl: () => { neuGezeichnet += 1; } });
  const menue = document.getElementById("codeModellMenue");
  const knoepfe = alleKnoten(menue).filter((k) => k.tagName === "BUTTON");
  knoepfe[4].click();
  assert.equal(localStorage.getItem(MODELL_KEY), AUTO_WAHL);
  assert.equal(localStorage.getItem("smejj.cline.model.v1"), null);
  assert.equal(neuGezeichnet, 1);
});

test("ohne Anzeige-Chip entsteht kein Menue (kaputte Probe)", async () => {
  umgebungAufbauen({ mitChip: false });
  // Der Chip fehlt: frueher waere hier ein Menue ins Leere gezeichnet worden.
  await oeffneModellMenue({ chip: null, halter: null });
  assert.equal(document.getElementById("codeModellMenue"), null);
});

test("ein zweiter Aufruf schliesst das offene Menue statt es zu verdoppeln", async () => {
  const { chip } = umgebungAufbauen();
  await oeffneModellMenue({ chip });
  assert.ok(document.getElementById("codeModellMenue"));
  await oeffneModellMenue({ chip });
  assert.equal(document.getElementById("codeModellMenue"), null);
});

// --- Das Menue lief links aus der Spalte ---------------------------------------
//
// Live gemessen 2026-08-22 im echten Chrome, Fenster 962 px, Browser-Panel offen:
// das Modellmenue begann bei x=134, die Seitenleiste reichte bis x=195. Die
// ersten 61 Pixel JEDER Zeile lagen dahinter — auf dem Bildschirm stand
// "eek V4 Pro" statt "Deepseek V4 Pro" und "ax M3" statt "Minimax M3".
// imFensterHalten() deckelte nur nach OBEN, nach links gab es keine Kappe.
//
// Waechter-TUEV: gesunde Probe (passt schon), kaputte Probe (ragt hinaus) und
// die Grenzfaelle dazwischen.
const { klemmeInSpalte } = await import("../public/code-modell-menue.js");

test("passt das Menue schon, wird nichts angefasst", () => {
  assert.equal(klemmeInSpalte({ links: 333, rechts: 509, grenze: 204, rechtsJetzt: 16 }), null);
  // Genau auf der Grenze zaehlt als drinnen.
  assert.equal(klemmeInSpalte({ links: 204, rechts: 380, grenze: 204, rechtsJetzt: 0 }), null);
});

test("reicht ein Schub nach rechts, bleibt die Breite unangetastet", () => {
  // 40 px zu weit links, aber 60 px Luft im `right` — schieben genuegt.
  const plan = klemmeInSpalte({ links: 164, rechts: 340, grenze: 204, rechtsJetzt: 60 });
  assert.deepEqual(plan, { right: 20, maxWidth: null });
});

test("der echte Fall vom 22.08.: schieben reicht nicht, also deckeln", () => {
  // Gemessen: links 134, rechts 310, Grenze 204, right stand auf 16.
  const plan = klemmeInSpalte({ links: 134, rechts: 310, grenze: 204, rechtsJetzt: 16 });
  assert.equal(plan.right, 0, "weiter als bis zum Knopfrand geht der Schub nicht");
  assert.equal(plan.maxWidth, 122, "Rest zwischen Grenze und rechter Kante");
  // Probe: die linke Kante liegt danach GENAU auf der Grenze, nichts mehr verdeckt.
  assert.equal(310 + 16 - plan.maxWidth, 204);
});

test("ist die Spalte schmaler als 120 px, schiebt es ueber den Knopf hinaus", () => {
  // Extremfall: nur 60 px zwischen Grenze und rechter Kante. Ein 60-px-Menue
  // waere unlesbar — also 120 px breit und nach rechts aus dem Knopf heraus.
  const plan = klemmeInSpalte({ links: 100, rechts: 264, grenze: 204, rechtsJetzt: 0 });
  assert.equal(plan.maxWidth, 120);
  assert.ok(plan.right < 0, "negatives right ist hier gewollt");
  assert.equal(264 - plan.right - plan.maxWidth, 204, "linke Kante sitzt auf der Grenze");
});

test("jede Kappe nach oben hat eine nach links", () => {
  // Frueher kamen Zeilen asynchron aus dem Katalog nach, darum brauchte es
  // mindestens drei Kappen. Seit 2026-09-10 steht die Liste fest, das Menue
  // waechst nur einmal — aber die beiden Kappen muessen PAARWEISE bleiben:
  // wer nur nach oben klemmt, schiebt das Menue unter die Seitenleiste.
  const quelle = readFileSync(new URL("../public/code-modell-menue.js", import.meta.url), "utf8");
  const obenKappen = (quelle.match(/^[ \t]*imFensterHalten\(\);$/gm) || []).length;
  const linksKappen = (quelle.match(/^[ \t]*inDerSpalteHalten\(\);$/gm) || []).length;
  assert.ok(obenKappen >= 1, `keine Kappe nach oben: ${obenKappen}`);
  assert.equal(linksKappen, obenKappen, "jede Kappe nach oben braucht eine nach links");
});

test("der Spiegel unter /assets traegt dieselbe Fassung", () => {
  const quelle = readFileSync(new URL("../public/code-modell-menue.js", import.meta.url), "utf8");
  const spiegel = readFileSync(new URL("../public/assets/code-modell-menue.js", import.meta.url), "utf8");
  assert.equal(spiegel, quelle, "smejj.com liefert /assets/ aus");
});

test("die Begruessung nimmt keine E-Mail-Adresse als Anrede", () => {
  // LIVE GESEHEN 2026-09-05 am emulierten iPhone: In der Code-Ansicht stand gross
  // "Was steht als Naechstes an, name@gmail.com?" — das Profil-Dock faellt ohne
  // hinterlegten Namen auf die Anmelde-Adresse zurueck, und die Begruessung nahm
  // sie ungeprueft. Unschoen und fuer jeden lesbar, der auf den Schirm sieht.
  // Im Dock selbst bleibt die Adresse richtig; hier wird dann neutral gegruesst.
  const quelle = readFileSync("public/code-modell-menue.js", "utf8");
  assert.match(quelle, /istMailAdresse/, "die Pruefung muss vorhanden sein");
  assert.match(quelle, /&& !istMailAdresse/, "sie muss die Anrede tatsaechlich verhindern");
  // Die Regel selbst gegenpruefen — eine Adresse trifft, ein Name nicht.
  const regel = /\S+@\S+\.\S+/;
  assert.equal(regel.test("smejjcom@gmail.com"), true);
  assert.equal(regel.test("Wof Kadavanich"), false);
  assert.equal(regel.test("Wof"), false);
});
