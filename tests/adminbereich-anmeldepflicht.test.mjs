// smejj.com — Waechter fuer die Anmeldepflicht des Adminbereichs.
//
// BEFUND 2026-08-14 (Betreiber): https://smejj.com/admin/autopiloten/ zeigte
// ohne jede Anmeldung die vollstaendige Konsolen-Huelle — Seitenleiste, alle
// Modulnamen, Kopfzeile. Die Daten blieben dicht (jede /api/admin/*-Route
// antwortet 401), aber es gab keine Umleitung zur Anmeldung, und der Bauplan
// des Adminbereichs stand jedem offen, der die Adresse kannte.
//
// Ursache: seit der Umstellung auf die statische Auslieferung (2026-08-07)
// liegt die Konsole auf GitHub Pages. Dort prueft niemand — der Schutz, den
// adminUiRoutes.js auf dem Control-Server leistet, fehlte ersatzlos.
//
// Diese Datei haelt den Fix fest. Nach der TUEV-Regel bekommt JEDER Waechter
// hier eine KAPUTTE und eine GESUNDE Probe: ein Test, der nur die gesunde
// Seite prueft, beweist nicht, dass er ueberhaupt etwas merkt.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const GATE_QUELLE = fs.readFileSync("public/admin/gate.js", "utf8");

// ---------------------------------------------------------------------------
// Waechter 1: JEDE Seite des Adminbereichs laedt den Tuersteher.
// ---------------------------------------------------------------------------

/** Alle index.html unterhalb eines Verzeichnisses einsammeln. */
function adminSeiten(wurzel) {
  const gefunden = [];
  for (const eintrag of fs.readdirSync(wurzel, { withFileTypes: true })) {
    const p = path.join(wurzel, eintrag.name);
    if (eintrag.isDirectory()) gefunden.push(...adminSeiten(p));
    else if (eintrag.name.endsWith(".html")) gefunden.push(p);
  }
  return gefunden;
}

/**
 * Die eigentliche Pruefung, als Funktion — damit sie unten auch auf eine
 * absichtlich kaputte Probe losgelassen werden kann.
 */
function ladeTuersteher(html) {
  return /<script[^>]+src="\/admin\/gate\.js"/.test(html);
}

test("jede Seite des Adminbereichs laedt den Tuersteher", () => {
  const seiten = adminSeiten("public/admin");
  assert.ok(seiten.length >= 30, `nur ${seiten.length} Adminseiten gefunden — Fund ist verdaechtig klein`);
  const ohne = seiten.filter((datei) => !ladeTuersteher(fs.readFileSync(datei, "utf8")));
  assert.deepEqual(ohne, [], `Adminseiten ohne Tuersteher:\n${ohne.join("\n")}`);
});

test("der Waechter merkt es, wenn der Tuersteher fehlt (kaputte Probe)", () => {
  // Genau die Seite, die der Betreiber gemeldet hat — nur ohne das Gate.
  const kaputt = '<!doctype html><html><head><title>x</title></head><body></body></html>';
  assert.equal(ladeTuersteher(kaputt), false);
  // Und ein Tag, der nur so AUSSIEHT, zaehlt auch nicht.
  assert.equal(ladeTuersteher('<script src="/admin/gate-attrappe.js"></script>'), false);
});

test("der Tuersteher steht im Kopf, nicht erst hinter dem Rumpf", () => {
  // Laedt er erst am Seitenende, blitzt die Huelle vorher auf — genau das,
  // was der Betreiber gesehen hat. Die Reihenfolge ist der Schutz.
  for (const datei of adminSeiten("public/admin")) {
    const html = fs.readFileSync(datei, "utf8");
    const gate = html.indexOf('/admin/gate.js');
    const rumpf = html.indexOf("<body");
    assert.ok(gate >= 0 && gate < rumpf, `${datei}: gate.js steht nicht vor <body>`);
  }
});

test("Quelle und Spiegel der Konsole tragen denselben Tuersteher", () => {
  // control-server/admin-ui/ ist die Quelle, public/admin/ nur der Spiegel
  // (scripts/deploy/sync_admin_console_pages.mjs). Steht der Fix nur im
  // Spiegel, faellt er beim naechsten Spiegeln heraus — das ist die Falle
  // "Artefakt ersetzt nie die Quelle" aus dem Gedaechtnis.
  const spiegel = fs.readFileSync("public/admin/gate.js", "utf8");
  const quelle = fs.readFileSync("control-server/admin-ui/gate.js", "utf8");
  assert.equal(quelle, spiegel, "gate.js weicht zwischen Quelle und Spiegel ab");
  assert.ok(ladeTuersteher(fs.readFileSync("control-server/admin-ui/index.html", "utf8")),
    "die QUELLE index.html laedt den Tuersteher nicht");
});

// ---------------------------------------------------------------------------
// Waechter 2: Was der Tuersteher tut, wenn man ihn laufen laesst.
// ---------------------------------------------------------------------------

/**
 * gate.js in einer nachgebauten Browser-Umgebung ausfuehren.
 *
 * Verborgen wird ueber eine KLASSE und das hidden-Attribut, nicht ueber
 * element.style — der Nachbau bildet deshalb genau diese beiden ab. Warum
 * nicht style: die CSP der Seite erlaubt nur style-src 'self' und weist jedes
 * Setzen von element.style ab (live im Browser gemessen 2026-08-14; der erste
 * Fix sah richtig aus und wirkte nicht).
 *
 * @returns {{umleitungen: string[], verborgen: boolean, klassen: Set<string>, gate: object|undefined}}
 */
function gateLaufenLassen({ origin = "https://smejj.com", pathname = "/admin/autopiloten/", search = "", speicher = {} } = {}) {
  const umleitungen = [];
  const klassen = new Set();
  const wurzel = {
    hidden: false,
    classList: { add: (k) => klassen.add(k), remove: (k) => klassen.delete(k) }
  };
  const fensterKontext = {
    location: {
      origin,
      pathname,
      search,
      replace: (ziel) => umleitungen.push(ziel)
    },
    localStorage: {
      getItem: (schluessel) => (schluessel in speicher ? speicher[schluessel] : null)
    },
    document: {
      documentElement: wurzel,
      body: { firstChild: null, removeChild() {}, appendChild() {} },
      createElement: () => ({ style: {}, appendChild() {} })
    },
    setTimeout: () => 0,
    clearTimeout: () => {},
    JSON
  };
  fensterKontext.window = fensterKontext;
  vm.createContext(fensterKontext);
  vm.runInContext(GATE_QUELLE, fensterKontext);
  return {
    umleitungen,
    verborgen: klassen.has("smejj-gate-zu") && wurzel.hidden === true,
    klassen,
    gate: fensterKontext.window.smejjAdminGate
  };
}

const TOKEN = "smejj.auth.accessToken.v1";
const SITZUNG = "smejj.session.v1";

test("ohne Anmeldung: verbergen und zur Anmeldung umleiten (kaputte Probe)", () => {
  const { umleitungen, verborgen } = gateLaufenLassen();
  assert.equal(verborgen, true, "die Huelle war sichtbar, bevor umgeleitet wurde");
  assert.deepEqual(umleitungen, ["/auth/login/?next=%2Fadmin%2Fautopiloten%2F"],
    "abgemeldeter Besucher wurde nicht zur Anmeldung geschickt");
});

test("das Rueckkehrziel wandert mit, samt Abfrageteil", () => {
  const { umleitungen } = gateLaufenLassen({ pathname: "/admin/nutzer/", search: "?akte=abc" });
  assert.deepEqual(umleitungen, ["/auth/login/?next=%2Fadmin%2Fnutzer%2F%3Fakte%3Dabc"]);
});

test("mit Token: keine Umleitung, aber die Huelle bleibt vorerst verborgen (gesunde Probe)", () => {
  // Verborgen bleibt sie, bis der SERVER den Akteur bestaetigt hat. Sonst
  // saehe auch ein angemeldeter Nicht-Admin alle Modulnamen.
  const { umleitungen, verborgen, gate } = gateLaufenLassen({ speicher: { [TOKEN]: "tok" } });
  assert.deepEqual(umleitungen, []);
  assert.equal(verborgen, true);
  assert.equal(typeof gate.freigeben, "function");
});

test("lokales Profil mit authenticated=true zaehlt ebenso als Sitzung", () => {
  const { umleitungen } = gateLaufenLassen({ speicher: { [SITZUNG]: JSON.stringify({ authenticated: true }) } });
  assert.deepEqual(umleitungen, []);
});

test("authenticated=false ist KEINE Sitzung", () => {
  const { umleitungen } = gateLaufenLassen({ speicher: { [SITZUNG]: JSON.stringify({ authenticated: false }) } });
  assert.equal(umleitungen.length, 1);
});

test("auf dem Control-Server haelt sich der Tuersteher heraus", () => {
  // Dort gibt adminUiRoutes.js ohne Adminrolle keine Datei heraus, und der
  // Browser traegt ein Cookie statt eines Tokens im localStorage. Ein Gate,
  // das hier zuschlaegt, sperrt rechtmaessig Angemeldete aus.
  const { umleitungen, verborgen, klassen } = gateLaufenLassen({ origin: "https://smejj-control.zeabur.app" });
  assert.deepEqual(umleitungen, []);
  assert.equal(verborgen, false, "auf dem Control-Server darf nichts verborgen werden");
  assert.equal(klassen.size, 0);
});

test("gesperrter Speicher gilt als abgemeldet (fail-closed)", () => {
  const umleitungen = [];
  const klassen = new Set();
  const wurzel = { hidden: false, classList: { add: (k) => klassen.add(k), remove: (k) => klassen.delete(k) } };
  const kontext = {
    location: { origin: "https://smejj.com", pathname: "/admin/", search: "", replace: (z) => umleitungen.push(z) },
    localStorage: { getItem: () => { throw new Error("Speicher gesperrt"); } },
    document: { documentElement: wurzel, body: {}, createElement: () => ({ style: {} }) },
    setTimeout: () => 0, clearTimeout: () => {}, JSON
  };
  kontext.window = kontext;
  vm.createContext(kontext);
  vm.runInContext(GATE_QUELLE, kontext);
  assert.equal(umleitungen.length, 1, "bei gesperrtem Speicher muss umgeleitet werden");
});

// ---------------------------------------------------------------------------
// Waechter 3: console.js gibt die Huelle nur nach Serverbestaetigung frei.
// ---------------------------------------------------------------------------

test("console.js gibt erst nach bestaetigtem Akteur frei", () => {
  for (const datei of ["public/admin/console.js", "control-server/admin-ui/console.js"]) {
    const text = fs.readFileSync(datei, "utf8");
    assert.ok(/GATE\.freigeben\(\)/.test(text), `${datei}: ruft freigeben() nie auf`);
    // Die Freigabe darf NICHT vor der Serverantwort stehen.
    const antwort = text.indexOf("const antwort = await A.ich()");
    const freigabe = text.indexOf("GATE.freigeben()");
    assert.ok(antwort >= 0 && freigabe > antwort,
      `${datei}: freigeben() steht vor der Serverantwort — dann nuetzt der Tuersteher nichts`);
    // 401 fuehrt zurueck zur Anmeldung, nicht in eine sichtbare Konsole.
    assert.ok(/antwort\.status === 401/.test(text), `${datei}: behandelt 401 nicht`);
  }
});

test("nur echte 'kein Admin'-Absagen blenden die Konsole aus", () => {
  // Wichtig fuer den Betreiber selbst: wer Admin IST, aber seine Adresse noch
  // nicht bestaetigt hat, bekommt 403 admin_email_not_verified — und braucht
  // die Konsole, um genau das zu erledigen. Wer die ausblendet, sperrt ihn aus.
  const text = fs.readFileSync("public/admin/console.js", "utf8");
  const liste = /const KEIN_ADMIN = \[([^\]]*)\]/.exec(text);
  assert.ok(liste, "KEIN_ADMIN-Liste fehlt");
  assert.ok(liste[1].includes("admin_role_required"));
  assert.ok(liste[1].includes("admin_account_not_active"));
  assert.ok(!liste[1].includes("admin_email_not_verified"),
    "admin_email_not_verified darf die Konsole NICHT ausblenden");
  assert.ok(!liste[1].includes("admin_step_up_required"),
    "admin_step_up_required darf die Konsole NICHT ausblenden");
});

// ---------------------------------------------------------------------------
// Waechter 4: die zwei Fehler, die erst der echte Browser gezeigt hat.
//
// Beide Male war die Unit-Ebene gruen und der Schutz trotzdem wirkungslos.
// Deshalb stehen sie hier als eigene Waechter — sie halten den BEWEIS fest,
// nicht die Absicht.
// ---------------------------------------------------------------------------

test("verborgen wird ohne inline Stil — sonst blockt die CSP es weg", () => {
  // Gemessen am 2026-08-14 im Browser:
  //   "Applying inline style violates the following Content Security Policy
  //    directive 'style-src 'self''"
  // Die Huelle blieb sichtbar, obwohl das Skript "hidden" gesetzt hatte.
  for (const datei of ["public/admin/gate.js", "control-server/admin-ui/gate.js"]) {
    const text = fs.readFileSync(datei, "utf8");
    // Ohne Kommentare pruefen: dort STEHT der alte Weg als Warnung, und die
    // soll stehenbleiben duerfen, ohne den Waechter auszuloesen.
    const code = text.split("\n").filter((z) => !/^\s*(\/\/|\*|\/\*)/.test(z)).join("\n");
    assert.ok(!/wurzel\.style\./.test(code),
      `${datei}: verbirgt per element.style — das blockt die CSP weg`);
    assert.ok(/var KLASSE = "smejj-gate-zu"/.test(code), `${datei}: die Klasse heisst nicht smejj-gate-zu`);
    assert.ok(/classList\.add\(KLASSE\)/.test(code), `${datei}: setzt die Klasse nicht`);
    assert.ok(/wurzel\.hidden = true/.test(code), `${datei}: nutzt das hidden-Attribut nicht als Rueckfall`);
  }
});

test("die Regel zur Klasse steht in beiden Stylesheets", () => {
  // Ohne sie traegt <html> zwar die Klasse, aber nichts passiert.
  for (const datei of ["public/admin/console.css", "control-server/admin-ui/console.css"]) {
    const css = fs.readFileSync(datei, "utf8");
    assert.match(css, /html\.smejj-gate-zu\s*\{[^}]*visibility:\s*hidden/,
      `${datei}: die Regel zu .smejj-gate-zu fehlt`);
  }
});

test("ein Netz- oder Serverfehler macht die Konsole NICHT sichtbar", () => {
  // Der zweite Befund: der erste Entwurf gab bei jeder unklaren Antwort frei.
  // Damit war die Luecke wieder offen — "der Server antwortet nicht" ist der
  // Zustand, den ein Angreifer am leichtesten herstellt (im Browser
  // reproduziert, indem der Aufruf an /api/admin/me per CORS scheiterte).
  for (const datei of ["public/admin/console.js", "control-server/admin-ui/console.js"]) {
    const text = fs.readFileSync(datei, "utf8");
    const start = text.indexOf("async function start()");
    const bestaetigt = text.indexOf("// Ab hier ist der Akteur vom SERVER bestaetigt");
    assert.ok(start >= 0 && bestaetigt > start, `${datei}: Aufbau von start() unerwartet`);

    // Der Zweig VOR der Bestaetigung darf genau EINE Freigabe enthalten: die
    // fuer den Admin, dem nur noch ein Schritt fehlt (403, aber Rolle da).
    const vorher = text.slice(start, bestaetigt);
    const freigaben = (vorher.match(/GATE\.freigeben\(\)/g) || []).length;
    assert.equal(freigaben, 1,
      `${datei}: ${freigaben} Freigaben vor der Serverbestaetigung — erlaubt ist nur die fuer den 403 mit Adminrolle`);
    // Und diese eine muss innerhalb des 403-Zweigs liegen.
    const dreiNullDrei = vorher.indexOf("antwort.status === 403");
    assert.ok(dreiNullDrei >= 0 && vorher.indexOf("GATE.freigeben()") > dreiNullDrei,
      `${datei}: die Freigabe haengt nicht am 403-Zweig`);
    // Der Restfall endet in abweisen(), nicht in einer sichtbaren Huelle.
    assert.match(vorher, /GATE\.abweisen\(\{[\s\S]*neuLaden: true/,
      `${datei}: der Netzfehler-Fall bietet kein Wiederholen an`);
  }
});
