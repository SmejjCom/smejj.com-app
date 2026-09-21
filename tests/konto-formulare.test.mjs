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

// BEFUND 2026-09-04: Diese Tests lasen nur account-privacy.css. Beim
// Zeilen-Diaet-Split wanderten die Formular-Regeln nach
// account-privacy-formulare.css — der Test fand seinen Block nicht mehr und
// starb an `null[0]`, statt etwas zu pruefen. Er war blind, nicht rot aus
// gutem Grund (Hausregel: Pruefung prueft die falsche Frage).
//
// Deshalb wird die Liste NICHT hier gepflegt, sondern aus dem Lader gelesen:
// wer die Dateien wirklich in den Browser holt, bestimmt auch, was geprueft
// wird. Ein dritter Split macht den Test damit nie wieder blind.
const LADER = fs.readFileSync("public/account-privacy.js", "utf8");
const CSS_DATEIEN = [...LADER.matchAll(/"(account-privacy[a-z-]*\.css)"/g)].map((m) => m[1]);
if (CSS_DATEIEN.length < 2) {
  throw new Error(`Lader nennt nur ${CSS_DATEIEN.length} Stylesheet(s) — Muster in account-privacy.js geaendert?`);
}
const CSS = CSS_DATEIEN.map((name) => fs.readFileSync(`public/${name}`, "utf8")).join("\n");
// Kommentare beschreiben auch alte Fehler (z. B. die frueher benutzte, nie
// definierte Variable) — geprueft werden darf nur, was der Browser wirklich liest.
const CSS_CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
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
  // Der Server verlangt das woertliche Bestaetigungswort (emailAuthService.js).
  // Vorher ging JEDE Eingabe ans Netz — auch eine leere, wenn jemand den Dialog
  // wegklickte. Seit 21.09.2026 haengt das Wort an der Sprache der Huelle;
  // Apple prueft auf Englisch und bekam vorher ein deutsches Wort zu sehen.
  assert.match(CODE, /function loeschWort\(\)/, "das Wort kommt aus einer Funktion");
  assert.ok(!/const LOESCH_WORT =/.test(CODE),
    "KEINE Modulkonstante: t()/uiLanguage() stehen beim Erstbesuch noch auf Deutsch");
  assert.match(CODE, /"KONTO LÖSCHEN" : "DELETE ACCOUNT"/, "beide Fassungen muessen vorkommen");
  const fn = CODE.match(/function deleteAccountForm[\s\S]*?\n\}/)[0];
  assert.ok(fn.indexOf("!== wort") < fn.indexOf("API.accountDelete"),
    "die Wortpruefung muss VOR dem Serveraufruf stehen");
  assert.ok(fn.indexOf("mitPasswort && !password") < fn.indexOf("API.accountDelete"),
    "die Passwortpruefung muss VOR dem Serveraufruf stehen");
  assert.match(fn, /Es wurde nichts gelöscht/, "die Absage muss sagen, dass nichts passiert ist");
});

test("die Loeschung gilt fuer JEDEN Anmeldeweg (Apple 5.1.1(v))", () => {
  // Bis 21.09.2026 verlangte die Maske immer ein Passwort — Google-, GitHub-
  // und Passkey-Konten haben keins und kamen nie durch. Apple verlangt, dass
  // die Loeschung IN der App startet; der Support-Weg reicht nicht.
  const fn = CODE.match(/function deleteAccountForm[\s\S]*?\n\}/)[0];
  assert.match(fn, /const mitPasswort = String\(user\?\.method \|\| "email"\) === "email"/,
    "der Anmeldeweg entscheidet ueber das Passwortfeld");
  assert.match(fn, /\$\{mitPasswort \? /, "das Passwortfeld darf nur bei E-Mail-Konten erscheinen");
  assert.ok(!/Nur E-Mail-Konten/.test(QUELLE),
    "die Beschreibung darf die Loeschung nicht mehr auf E-Mail-Konten begrenzen");
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

async function ladeModul(gesendet, { anmeldeweg = null } = {}) {
  // fetch abfangen: jeder Serveraufruf wird protokolliert statt ausgefuehrt.
  // `anmeldeweg` beantwortet /api/auth/me — damit laesst sich der passwortlose
  // Fall (Google, GitHub, Passkey) nachstellen, ohne echten Server.
  globalThis.fetch = async (url, options) => {
    gesendet.push({ url: String(url), body: options?.body });
    if (anmeldeweg && String(url).endsWith("/api/auth/me")) {
      return { ok: true, status: 200, json: async () => ({ authenticated: true, user: { email: "a@b.c", method: anmeldeweg } }) };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  globalThis.localStorage = { getItem: () => "token", removeItem() {}, setItem() {} };
  globalThis.sessionStorage = anmeldeweg
    ? { getItem: () => "token", removeItem() {}, setItem() {} }
    : { getItem: () => null, removeItem() {}, setItem() {} };
  globalThis.window = globalThis;
  // Der /api/auth/me-Speicher haelt seine Antwort 5 s und wird ueber die
  // unveraenderte Modul-URL von ALLEN Faellen geteilt — ohne Verwerfen bekaeme
  // der naechste Fall die Antwort des vorigen (hier gemessen: das Google-Konto
  // sah den Anmeldeweg des E-Mail-Falls).
  const { authMeSpeicher } = await import("../public/shared/auth-me-speicher.js?v=1");
  authMeSpeicher.verwerfen();
  return import(`../public/account-sessions.js?fall=${Math.random()}`);
}

/** Nur die Loeschanfragen zaehlen — /auth/me und /session-token sind Beiwerk. */
function loeschRufe(gesendet) {
  return gesendet.filter((r) => /account\/delete$/.test(r.url));
}

test("VERHALTEN: falsches Bestaetigungswort loest KEINEN Serveraufruf aus", async () => {
  const dom = baueDom();
  const modul = await ladeModul(dom.gesendet);
  const block = dom.element();
  block.id = "serverAccountBlock";
  dom.knoten.set("serverAccountBlock", block);
  const meldungen = [];

  // Erster Klick oeffnet das Formular. Seit 21.09.2026 fragt es zuerst den
  // Anmeldeweg ab und ist deshalb asynchron.
  await modul.deleteAccountForm(block, (m) => meldungen.push(m));
  const form = dom.knoten.get("accountDeleteForm");
  assert.ok(form, "das Formular muss angelegt werden");

  dom.knoten.get("delConfirm").value = "konto loeschn"; // falsch geschrieben
  dom.knoten.get("delPassword").value = "EinLangesPasswort1";
  await form.feuere("submit");
  assert.equal(loeschRufe(dom.gesendet).length, 0, "bei falschem Wort darf NICHTS gesendet werden");
  assert.match(meldungen.at(-1), /exakt/, "die Meldung muss das exakte Wort nennen");

  // Richtig geschrieben, aber ohne Passwort.
  dom.knoten.get("delConfirm").value = "KONTO LÖSCHEN";
  dom.knoten.get("delPassword").value = "";
  await form.feuere("submit");
  assert.equal(loeschRufe(dom.gesendet).length, 0, "ohne Passwort darf NICHTS gesendet werden");

  // Beides richtig: jetzt darf gesendet werden.
  dom.knoten.get("delPassword").value = "EinLangesPasswort1";
  await form.feuere("submit");
  assert.equal(loeschRufe(dom.gesendet).length, 1, "erst mit Wort UND Passwort geht die Anfrage raus");
});

test("VERHALTEN: Google-Konto loescht OHNE Passwort (Apple 5.1.1(v))", async () => {
  // Der eigentliche Ablehnungsgrund: passwortlose Anmeldewege hatten gar keinen
  // Loeschweg in der App. Kein Passwortfeld — und die Anfrage muss trotzdem
  // rausgehen, sobald das Wort stimmt.
  const dom = baueDom();
  const modul = await ladeModul(dom.gesendet, { anmeldeweg: "google" });
  const block = dom.element();
  block.id = "serverAccountBlock";
  dom.knoten.set("serverAccountBlock", block);
  const meldungen = [];

  await modul.deleteAccountForm(block, (m) => meldungen.push(m));
  const form = dom.knoten.get("accountDeleteForm");
  assert.ok(form, "das Formular muss angelegt werden");
  assert.ok(!/id="delPassword"/.test(block.innerHTML),
    "ein Google-Konto hat kein Passwort — das Feld darf nicht erscheinen");

  dom.knoten.get("delConfirm").value = "irgendwas";
  await form.feuere("submit");
  assert.equal(loeschRufe(dom.gesendet).length, 0, "bei falschem Wort darf NICHTS gesendet werden");

  dom.knoten.get("delConfirm").value = "KONTO LÖSCHEN";
  await form.feuere("submit");
  assert.equal(loeschRufe(dom.gesendet).length, 1, "mit dem Wort allein muss die Loeschung rausgehen");
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
  assert.match(label, /\$\{wort\}/,
    "die Beschriftung muss dieselbe Variable einsetzen wie die Pruefung");
});

// --- Helles Farbschema --------------------------------------------------------
//
// Der Kontobereich kennt ZWEI Schemata (#profile.premium-view und
// …[data-settings-theme="light"]). Die Historie des Projekts haengt voller
// Light-Mode-Fehler; darum wird hier geprueft, dass die neuen Formulare nur
// Werte benutzen, die BEIDE Schemata kennen.

test("die Formulare benutzen keine erfundene Variable", () => {
  // Erster Entwurf schrieb `var(--konto-panel, …)` — die Variable gibt es nicht,
  // der weisse Rueckfallwert galt also immer und haette im hellen Schema eine
  // fremde Flaeche erzeugt.
  const block = CSS_CODE.match(/#profile \.account-inline-form \{[\s\S]*?\n\}/)[0];
  const benutzt = [...CSS_CODE.matchAll(/var\((--konto-[a-z-]+)/g)].map((m) => m[1]);
  const definiert = new Set([...CSS_CODE.matchAll(/^\s*(--konto-[a-z-]+):/gm)].map((m) => m[1]));
  for (const name of new Set(benutzt)) {
    assert.ok(definiert.has(name), `${name} wird benutzt, ist aber nirgends definiert`);
  }
  assert.match(block, /background: var\(--konto-glass\)/,
    "die Formularflaeche muss dieselbe Glas-Variable nehmen wie die uebrigen Flaechen");
});

// Kontrast nach WCAG 2.1 (relative Luminanz). Schwelle fuer Fokusringe und
// andere Nicht-Text-Elemente: 3.0.
function kontrast(vorne, hinten) {
  const luminanz = (hex) => {
    const c = hex.replace("#", "");
    const kanaele = [0, 2, 4]
      .map((i) => parseInt(c.substr(i, 2), 16) / 255)
      .map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return 0.2126 * kanaele[0] + 0.7152 * kanaele[1] + 0.0722 * kanaele[2];
  };
  const [hell, dunkel] = [luminanz(vorne), luminanz(hinten)].sort((a, b) => b - a);
  return (hell + 0.05) / (dunkel + 0.05);
}

test("der Fokusring ist in BEIDEN Schemata sichtbar", () => {
  // --konto-edge ist im hellen Schema rgba(255,255,255,0.9): ein weisser Ring
  // auf hellem Grund ist kein Ring. Tastaturnutzer verlieren damit die Position.
  //
  // Diese Pruefung stand bis zum 2026-08-22 auf `outline: 2px solid #2dd4bf`
  // und behauptete dazu "Akzentfarbe traegt in hell und dunkel". Nachgerechnet
  // war das NIE wahr: #2dd4bf erreicht gegen den hellen Konto-Grund #fbfbf9
  // gerade 1.86, gefordert sind 3.0. Der Pin auf einen Literalwert gab
  // Sicherheit, die er nicht liefern konnte — er haette jede Farbe
  // durchgewinkt, solange sie nur diese eine war. Jetzt wird gerechnet.
  const regel = CSS_CODE.match(/#profile \.account-inline-form input:focus-visible \{[\s\S]*?\n\}/)[0];
  assert.ok(!/var\(--konto-edge\)/.test(regel),
    "der Fokusring darf nicht an der Kantenfarbe haengen");
  assert.match(regel, /outline: 2px solid var\(--konto-fokus\)/,
    "der Ring gehoert an eine eigene Variable, damit jedes Schema seinen Wert setzen kann");

  // Beide Schemata muessen die Variable setzen — sonst faellt eines still
  // auf den Erbwert zurueck.
  const dunkel = CSS_CODE.match(/#profile\.premium-view \{([\s\S]*?)\n\}/)[1];
  const hell = CSS_CODE.match(/#profile\.premium-view\[data-settings-theme="light"\] \{([\s\S]*?)\n\}/)[1];
  assert.match(dunkel, /--konto-fokus:/, "dunkles Schema definiert --konto-fokus");
  assert.match(hell, /--konto-fokus:/, "helles Schema definiert --konto-fokus");

  // Und der helle Wert muss den Kontrast wirklich schaffen. Das ist der
  // Punkt, den die alte Fassung nur behauptet hat.
  const hellerWert = hell.match(/--konto-fokus:\s*(#[0-9a-fA-F]{6})/)?.[1];
  assert.ok(hellerWert, "der helle Wert muss ein fester Farbwert sein, damit er pruefbar ist");
  const gemessen = kontrast(hellerWert, "#fbfbf9");
  assert.ok(gemessen >= 3,
    `Fokusring ${hellerWert} auf hellem Grund: Kontrast ${gemessen.toFixed(2)}, gefordert 3.0`);
});

test("beide Schemata definieren jede benutzte Konto-Variable", () => {
  // Ein Wert, den nur das dunkle Schema kennt, faellt im hellen still auf den
  // Erbwert zurueck — genau so entstehen unlesbare Flaechen.
  const dunkel = CSS_CODE.match(/#profile\.premium-view \{([\s\S]*?)\n\}/)[1];
  const hell = CSS_CODE.match(/#profile\.premium-view\[data-settings-theme="light"\] \{([\s\S]*?)\n\}/)[1];
  const namen = (s) => new Set([...s.matchAll(/(--konto-[a-z-]+):/g)].map((m) => m[1]));
  const nurDunkel = [...namen(dunkel)].filter((n) => !namen(hell).has(n));
  assert.deepEqual(nurDunkel, [], `nur im dunklen Schema definiert: ${nurDunkel.join(", ")}`);
});
