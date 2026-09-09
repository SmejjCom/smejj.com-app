// smejj.com — Cline ist aus dem Frontend ENTFERNT und darf nicht zurueckkommen.
//
// Diese Datei hiess bis 2026-09-10 cline-provider-frontend.test.mjs und pruefte,
// dass der Fremdanbieter im Frontend richtig eingebaut ist: Untermenue mit
// Gruppen, Key-Feld in den Einstellungen, eigener Chatweg. Betreiber-Auftrag
// vom 2026-09-10 im Wortlaut:
//
//   "Cline muss vollstaendig aus der App entfernt werden. Entferne Cline aus:
//    Modellmenues, UI, Backend, Routing, Konfiguration, Model Registry,
//    API-Auswahl, Fallbacks, Prompts, Autopilot, Dokumentation, ungenutzten
//    Imports, ungenutzten Komponenten."
//
// Damit dreht sich der Zweck der Datei um: sie bewacht jetzt die ABWESENHEIT.
// Das ist die Sorte Aufraeumarbeit, die sonst still zurueckrutscht — ein
// vergessener Import, eine Zeile im Precache, ein Menuepunkt aus einem alten
// Zweig, und der Anbieter ist wieder halb da.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const lies = (p) => fs.readFileSync(p, "utf8");
const gibtEs = (p) => fs.existsSync(p);

// Kommentare duerfen den Umbau erklaeren — sonst weiss der naechste Umbau
// nicht, warum hier etwas fehlt. Geprueft wird der ausfuehrbare Teil.
function ohneKommentare(text) {
  return text.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

test("die reinen Cline-Dateien sind weg — Quelle und Auslieferung", () => {
  for (const pfad of [
    "public/cline-model-menu.js",
    "public/cline-model-menu.css",
    "public/provider-settings.js",
    "public/provider-settings.css",
    "public/assets/cline-model-menu.js",
    "public/assets/cline-model-menu.css",
    "public/assets/provider-settings.js",
    "public/assets/provider-settings.css"
  ]) assert.equal(gibtEs(pfad), false, `${pfad} existiert noch`);
});

test("die Startseite laedt keinen Cline-Baustein mehr", () => {
  const html = lies("public/index.html");
  assert.doesNotMatch(html, /cline/i, "index.html nennt Cline noch");
});

test("der Service Worker legt keine Cline-Datei mehr in den Vorrat", () => {
  // Eine Precache-Zeile auf eine geloeschte Datei ist nicht nur Altlast:
  // cache.addAll bricht beim ersten 404 ab — der Service Worker koennte sich
  // dann gar nicht mehr installieren und die App waere fuer wiederkehrende
  // Nutzer tot (dieselbe Falle wie bei app-helfer.js am 09.09.).
  for (const pfad of ["public/sw.js", "public/assets/sw.js"]) {
    const text = ohneKommentare(lies(pfad));
    assert.doesNotMatch(text, /cline-model-menu|provider-settings/, `${pfad} listet eine entfernte Datei`);
  }
});

test("Modellwahl und Chatweg kennen keinen Fremdanbieter mehr", () => {
  // ai/modellRouter.js stand hier bis 2026-09-10 und ist entfernt: die
  // Modellwahl gehoert auf den Server, nicht in zwei Router.
  for (const pfad of ["public/code-modell-menue.js", "public/app.js"]) {
    const text = ohneKommentare(lies(pfad));
    // Erlaubt bleibt allein das Aufraeumen alter Browserspeicher: wer "Cline"
    // noch gespeichert hat, muss auf Auto umgesetzt werden koennen.
    const ohneMigration = text
      .replace(/ALTE_AUTO_WERTE[\s\S]{0,80}?\n/g, "")
      .replace(/ALTER_CLINE_MODELL_KEY[^\n]*\n/g, "")
      .replace(/smejj\.cline\.(model|status|katalog)\.v1/g, "");
    assert.doesNotMatch(ohneMigration, /cline/i, `${pfad} nennt Cline im Code`);
  }
});

test("der Chatweg ruft keinen Cline-Endpunkt mehr", () => {
  const chat = ohneKommentare(lies("public/ai/chatClient.js"));
  assert.doesNotMatch(chat, /providers\/cline/, "der eigene Cline-Chatweg ist entfallen");
  assert.doesNotMatch(chat, /runClineChat/, "die Funktion ist entfernt, nicht nur unerreichbar");
});

test("der BYOK-Katalog fuehrt Cline nicht mehr", async () => {
  const { PROVIDER_CATALOG, selectableProviders } = await import("../public/ai/providers-catalog.js");
  assert.equal(PROVIDER_CATALOG.some((e) => e.id === "cline"), false);
  // Und die Ausnahme, die es dafuer gab, ist mit weg: alle Anbieter im Katalog
  // sind jetzt auch waehlbar. Sonst bliebe eine Filterregel ohne Gegenstand.
  assert.equal(selectableProviders().length, PROVIDER_CATALOG.length);
});

test("die Einstellungen bieten kein Cline-Schluesselfeld mehr an", () => {
  const einstellungen = ohneKommentare(lies("public/settings-surface.js"));
  assert.doesNotMatch(einstellungen, /cline/i);
  assert.doesNotMatch(einstellungen, /provider-settings/, "der geloeschte Bereich wird nicht mehr geladen");
});

test("kein Modul importiert eine geloeschte Datei", () => {
  // Ein Import auf eine entfernte Datei faellt nicht beim Bauen auf — er
  // faellt dem Nutzer auf, wenn die Seite still stehenbleibt.
  const dateien = fs.readdirSync("public").filter((n) => n.endsWith(".js"));
  for (const name of dateien) {
    const text = lies(`public/${name}`);
    for (const weg of ["cline-model-menu", "provider-settings.js"]) {
      assert.equal(text.includes(`import`) && new RegExp(`import[^\\n]*${weg}`).test(text), false,
        `public/${name} importiert ${weg}`);
    }
  }
});
