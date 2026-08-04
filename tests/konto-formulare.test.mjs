// smejj.com — Konto-Sicherheit: Passwoerter gehoeren in Felder, nicht in Dialoge.
//
// Befund 2026-08-04 (Freigabe des Betreibers am selben Tag): Passwortwechsel und
// Kontoloeschung liefen ueber `window.prompt()`/`window.confirm()`.
//   - Ein prompt()-Feld MASKIERT NICHT: altes und neues Passwort standen im
//     Klartext auf dem Bildschirm.
//   - Passwortverwaltungen kennen den Dialog nicht — kein Vorschlag, kein
//     Speichern, kein Einfuegen.
//   - Chrome bietet nach dem zweiten Dialog an, weitere zu unterdruecken. Wer das
//     anklickte, kam bei der Loeschung nie ans Passwortfeld und stand vor einer
//     Aktion, die scheinbar nichts tat.
//   - Ohne Wiederholfeld setzt ein unsichtbarer Tippfehler ein Passwort, das
//     niemand mehr kennt — bei sofort beendeten anderen Sitzungen.
//
// Diese Tests pruefen die Bauart der Formulare UND ihr Verhalten gegen ein
// nachgebautes DOM: der teuerste Fehler waere ein Serveraufruf, der trotz
// falscher Eingabe hinausgeht.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const QUELLE = fs.readFileSync("public/account-sessions.js", "utf8");
const CSS = fs.readFileSync("public/account-privacy.css", "utf8");
// Kommentare beschreiben den alten Zustand — geprueft wird der ausgefuehrte Code.
const CODE = QUELLE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("kein Passwort laeuft je durch einen Browser-Dialog", () => {
  assert.ok(!/window\.prompt\s*\(/.test(CODE), "window.prompt darf nicht mehr aufgerufen werden");
  assert.ok(!/window\.confirm\s*\(/.test(CODE), "window.confirm darf nicht mehr aufgerufen werden");
});

test("jedes Passwortfeld ist maskiert und der Verwaltung bekannt", () => {
  const felder = [...QUELLE.matchAll(/<input id="(pw[A-Za-z]+|delPassword)"([^>]*)>/g)];
  assert.equal(felder.length, 4, `erwartet 4 Passwortfelder, gefunden ${felder.length}`);
  for (const [, id, attribute] of felder) {
    assert.match(attribute, /type="password"/, `${id} muss maskiert sein`);
    assert.match(attribute, /autocomplete="(current|new)-password"/, `${id} braucht autocomplete`);
  }
  assert.match(QUELLE, /id="pwNew"[^>]*autocomplete="new-password"/, "das NEUE Passwort ist new-password");
  assert.match(QUELLE, /id="pwCurrent"[^>]*autocomplete="current-password"/, "das ALTE Passwort ist current-password");
});

test("das Bestaetigungsfeld verhindert den unsichtbaren Tippfehler", () => {
  assert.match(QUELLE, /id="pwRepeat"/, "Passwortwechsel braucht ein Wiederholfeld");
  const fn = CODE.match(/function changePasswordForm[\s\S]*?\n\}/)[0];
  assert.ok(fn.indexOf("newPassword !== repeat") < fn.indexOf("API.passwordChange"),
    "der Vergleich muss VOR dem Serveraufruf stehen");
});

test("die Loeschung prueft das Wort schon im Browser", () => {
  // Der Server verlangt exakt "KONTO LÖSCHEN" (emailAuthService.js). Vorher ging
  // JEDE Eingabe ans Netz — auch eine leere, wenn jemand den Dialog wegklickte.
  assert.match(CODE, /const LOESCH_WORT = "KONTO LÖSCHEN"/);
  const fn = CODE.match(/function deleteAccountForm[\s\S]*?\n\}/)[0];
  assert.ok(fn.indexOf("confirmText !== LOESCH_WORT") < fn.indexOf("API.accountDelete"),
    "die Wortpruefung muss VOR dem Serveraufruf stehen");
  assert.ok(fn.indexOf("!password") < fn.indexOf("API.accountDelete"),
    "die Passwortpruefung muss VOR dem Serveraufruf stehen");
  assert.match(fn, /Es wurde nichts gelöscht/, "die Absage muss sagen, dass nichts passiert ist");
});

test("die Loeschung bleibt zweistufig und als gefaehrlich gekennzeichnet", () => {
  assert.match(QUELLE, /class="danger-action" type="submit"/, "der Loeschknopf bleibt als gefaehrlich markiert");
  assert.match(QUELLE, /nicht rückgängig machen/, "der Hinweis auf die Endgueltigkeit bleibt");
  assert.match(QUELLE, /id="delCancel"/, "es muss einen Abbrechen-Weg geben");
  assert.match(QUELLE, /id="pwCancel"/, "auch der Passwortwechsel braucht Abbrechen");
});

test("die Formulare sind gestaltet, nicht nackt", () => {
  assert.match(CSS, /\.account-inline-form/, "die Formularklasse braucht Stile");
  assert.match(CSS, /account-inline-form input/, "die Felder brauchen Stile");
  assert.match(CSS, /account-inline-form input:focus-visible/, "Tastaturbedienung braucht sichtbaren Fokus");
});

// --- Verhalten gegen ein nachgebautes DOM ------------------------------------

/** Minimales DOM: nur was die beiden Formulare wirklich anfassen. */
function baueDom() {
  const knoten = new Map();
  const gesendet = [];
  const meldungen = [];

  function element(html = "") {
    const el = {
      innerHTML: html, kinder: [], handler: {},
      value: "", disabled: false,
      addEventListener(typ, fn) { (this.handler[typ] ||= []).push(fn); },
      querySelector(sel) { return knoten.get(sel.replace(/^#/, "")) || null; },
      insertAdjacentHTML(_pos, markup) { this.innerHTML += markup; erfasse(markup); },
      remove() { this.entfernt = true; knoten.delete(this.id); },
      async feuere(typ, event = { preventDefault() {} }) {
        for (const fn of this.handler[typ] || []) await fn(event);
      }
    };
    return el;
  }

  // Aus dem eingefuegten Markup die Ids ziehen und je einen Knoten anlegen.
  function erfasse(markup) {
    for (const [, id] of markup.matchAll(/id="([A-Za-z]+)"/g)) {
      if (!knoten.has(id)) {
        const el = element();
        el.id = id;
        knoten.set(id, el);
      }
    }
  }

  return { element, knoten, gesendet, meldungen, erfasse };
}

async function ladeModul(gesendet) {
  // fetch abfangen: jeder Serveraufruf wird protokolliert statt ausgefuehrt.
  globalThis.fetch = async (url, options) => {
    gesendet.push({ url: String(url), body: options?.body });
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  globalThis.localStorage = { getItem: () => "token", removeItem() {}, setItem() {} };
  globalThis.window = globalThis;
  return import(`../public/account-sessions.js?fall=${Math.random()}`);
}

test("VERHALTEN: falsches Bestaetigungswort loest KEINEN Serveraufruf aus", async () => {
  const dom = baueDom();
  const modul = await ladeModul(dom.gesendet);
  const block = dom.element();
  block.id = "serverAccountBlock";
  dom.knoten.set("serverAccountBlock", block);
  const meldungen = [];

  // Erster Klick oeffnet das Formular.
  modul.deleteAccountForm(block, (m) => meldungen.push(m));
  const form = dom.knoten.get("accountDeleteForm");
  assert.ok(form, "das Formular muss angelegt werden");

  dom.knoten.get("delConfirm").value = "konto loeschen"; // falsch geschrieben
  dom.knoten.get("delPassword").value = "EinLangesPasswort1";
  await form.feuere("submit");
  assert.equal(dom.gesendet.length, 0, "bei falschem Wort darf NICHTS gesendet werden");
  assert.match(meldungen.at(-1), /exakt/, "die Meldung muss das exakte Wort nennen");

  // Richtig geschrieben, aber ohne Passwort.
  dom.knoten.get("delConfirm").value = "KONTO LÖSCHEN";
  dom.knoten.get("delPassword").value = "";
  await form.feuere("submit");
  assert.equal(dom.gesendet.length, 0, "ohne Passwort darf NICHTS gesendet werden");

  // Beides richtig: jetzt darf gesendet werden.
  dom.knoten.get("delPassword").value = "EinLangesPasswort1";
  await form.feuere("submit");
  assert.equal(dom.gesendet.length, 1, "erst mit Wort UND Passwort geht die Anfrage raus");
  assert.match(dom.gesendet[0].url, /account\/delete$/);
});

test("VERHALTEN: ungleiche neue Passwoerter loesen KEINEN Serveraufruf aus", async () => {
  const dom = baueDom();
  const modul = await ladeModul(dom.gesendet);
  const block = dom.element();
  block.id = "serverSessionsBlock";
  dom.knoten.set("serverSessionsBlock", block);
  const meldungen = [];

  modul.changePasswordForm(block, (m) => meldungen.push(m));
  const form = dom.knoten.get("passwordChangeForm");
  assert.ok(form, "das Formular muss angelegt werden");

  dom.knoten.get("pwCurrent").value = "AltesPasswort123";
  dom.knoten.get("pwNew").value = "NeuesPasswort123";
  dom.knoten.get("pwRepeat").value = "NeuesPasswortXYZ";
  await form.feuere("submit");
  assert.equal(dom.gesendet.length, 0, "bei Ungleichheit darf NICHTS gesendet werden");
  assert.match(meldungen.at(-1), /stimmen nicht überein/);

  dom.knoten.get("pwCurrent").value = "";
  dom.knoten.get("pwRepeat").value = "NeuesPasswort123";
  await form.feuere("submit");
  assert.equal(dom.gesendet.length, 0, "ohne aktuelles Passwort darf NICHTS gesendet werden");

  dom.knoten.get("pwCurrent").value = "AltesPasswort123";
  await form.feuere("submit");
  assert.equal(dom.gesendet.length, 1, "erst wenn alles stimmt, geht die Anfrage raus");
  assert.match(dom.gesendet[0].url, /password\/change$/);
});

test("die Beschriftung mit dem Loeschwort bleibt EINE Zeile", () => {
  // Das Label ist eine Flex-Spalte: ohne umschliessendes span wird jedes
  // Textstueck eine eigene Zeile ("Zur Bestätigung" / "KONTO LÖSCHEN" /
  // "eingeben"). Live im Browser gesehen und behoben.
  const label = QUELLE.match(/<label for="delConfirm">([\s\S]*?)<input/)[1];
  assert.ok(!/<[a-z]/i.test(label),
    `die Beschriftung darf kein eigenes Element enthalten, gefunden: ${label}`);
  // Beschriftung UND Pruefung muessen dieselbe Konstante benutzen — sonst
  // verlangt der Text ein anderes Wort als der Code akzeptiert.
  assert.match(label, /\$\{LOESCH_WORT\}/,
    "die Beschriftung muss LOESCH_WORT einsetzen, nicht den Text doppelt pflegen");
});
