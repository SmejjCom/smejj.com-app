// smejj.com — Schutztests fuer das Profil-Dock in der linken Navigation.
// Freigabe 2026-07-17 (Wof Kadavanich): "Ja" auf "Soll ich es umsetzen?" —
// Profilbild + Profilname unten links, Zahnrad bleibt daneben erhalten.
// Diese Tests sichern: Nicht-Regression des Zahnrads, Datenschutz (kein
// Gravatar/kein externer Dienst), harte Bildgrenzen und Barrierefreiheit.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync("public/index.html", "utf8");
const dockJs = fs.readFileSync("public/profile-dock.js", "utf8");
const dockCss = fs.readFileSync("public/profile-dock.css", "utf8");
const store = fs.readFileSync("public/profile-picture-store.js", "utf8");
const control = fs.readFileSync("public/profile-picture-control.js", "utf8");
const account = fs.readFileSync("public/account-privacy.js", "utf8");
const dockMenu = fs.readFileSync("public/profile-dock-menu.js", "utf8");
const authState = fs.readFileSync("public/account-auth-state.js", "utf8");
const sw = fs.readFileSync("public/sw.js", "utf8");
const appJs = fs.readFileSync("public/app.js", "utf8");
const stylesCss = fs.readFileSync("public/styles.css", "utf8");

test("Profil-Dock zeigt Profilbild und Namen unten links", () => {
  assert.match(html, /<div id="profileDock" class="profile-dock">/);
  assert.match(html, /<button id="profileDockButton" class="profile-dock-button" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="profileDockMenu"/);
  assert.match(html, /<span id="profileDockFace" class="profile-avatar is-empty" aria-hidden="true"><\/span>/);
  assert.match(html, /<span id="profileDockName" class="profile-dock-name">Nutzer<\/span>/);
  // Seit dem Ladezeit-Buendel (2026-07-27) liefert start-styles.css das Dock-CSS.
  assert.match(html, /<link rel="stylesheet" href="\/assets\/start-styles\.css/);
  assert.ok(fs.readFileSync("public/start-styles.css", "utf8").includes("profile-dock-button"), "Dock-CSS fehlt im Buendel");
  assert.match(html, /<script src="\/assets\/profile-dock\.js/);
});

test("Zahnrad bleibt erhalten (Non-Regression Einstellungen)", () => {
  // Der Einstieg in die Einstellungen darf durch das Dock NICHT ersetzt werden.
  assert.match(
    html,
    /<button class="nav-button profile-dock-gear" type="button" data-view="settings" data-icon="settings" title="Einstellungen" aria-label="Einstellungen">Einstellungen<\/button>/
  );
  // Label bleibt fuer Screenreader im DOM, ist visuell nur ausgeblendet.
  assert.match(dockCss, /\.profile-dock-gear \.nav-label \{[^}]*clip-path: inset\(50%\)/s);
  assert.doesNotMatch(dockCss, /\.profile-dock-gear \.nav-label \{[^}]*display: none/s);
});

test("Dock laesst app.js und styles.css unangetastet (Ratchet-Baseline)", () => {
  // Die Dock-Logik lebt bewusst in eigenen Modulen; app.js/styles.css duerfen
  // laut scripts/check-guidelines.mjs nicht weiter wachsen.
  assert.doesNotMatch(appJs, /profileDockFace|profileDockName|profile-picture-store/);
  assert.doesNotMatch(stylesCss, /profile-dock-button|profile-dock-name|profile-dock-gear/);
  // Baseline 1404 seit der Markdown-Anzeige (dokumentiert in scripts/check-guidelines.mjs).
  assert.ok(fs.readFileSync("public/app.js", "utf8").split("\n").filter(Boolean).length <= 1404);
});

// Kommentarzeilen erklaeren die Entscheidung ("kein Gravatar") und duerfen die
// Code-Pruefung nicht ausloesen — geprueft wird ausschliesslich echter Code.
function codeOnly(source) {
  return source
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

test("Profilbild bleibt lokal: kein Gravatar, kein fest verdrahteter Fremdhost", () => {
  // Kein Anbieter-Host darf im Code stehen. Das Kontobild wird nur ueber die URL
  // aus der EIGENEN Sitzung des Nutzers geholt, einmalig, und danach lokal gehalten.
  for (const source of [store, control, dockJs, dockMenu]) {
    assert.doesNotMatch(codeOnly(source), /gravatar|googleusercontent|avatars\.|https?:\/\/[a-z]/i);
  }
  assert.match(store, /localStorage/);
  assert.match(store, /PROFILE_PICTURE_KEY = "smejj\.profile\.picture\.v1"/);
});

test("Bild-Upload ist fail-closed und hart begrenzt", () => {
  assert.match(store, /MAX_EDGE = 256/);
  assert.match(store, /MAX_BYTES = 100 \* 1024/);
  assert.match(store, /ALLOWED_TYPES = new Set\(\["image\/png", "image\/jpeg", "image\/webp"\]\)/);
  assert.match(store, /SAFE_DATA_URL = \/\^data:image/);
  // Ungueltige Eingaben fuehren zu ok:false statt zu einem Speichervorgang.
  assert.match(store, /if \(!ALLOWED_TYPES\.has\(file\.type\)\) return \{ ok: false/);
  assert.match(store, /if \(file\.size > MAX_SOURCE_BYTES\) return \{ ok: false/);
  assert.match(store, /if \(dataUrl\.length > MAX_BYTES\) return \{ ok: false/);
});

test("Loeschen lokaler Daten entfernt auch das Profilbild", () => {
  assert.match(account, /clearProfilePicture\(\);/);
  assert.match(account, /#clearLocal/);
});

test("Profilbild-Steuerung ist barrierefrei beschriftet", () => {
  assert.match(control, /id="profilePictureInput" type="file" accept="image\/png,image\/jpeg,image\/webp" aria-label=/);
  assert.match(control, /<label class="account-picture-choose" for="profilePictureInput">/);
  assert.match(dockJs, /button\.setAttribute\("aria-label"/);
});

test("Service Worker cached die neuen Module", () => {
  for (const asset of [
    "/assets/profile-dock.js",
    "/assets/profile-picture-store.js",
    "/assets/profile-picture-control.js"
  ]) {
    assert.ok(sw.includes(`"${asset}"`), `${asset} fehlt im Shell-Precache`);
  }
  // v148 (2026-07-27): Stufe 2 — Seiten-Kontext fuer das Modell (browser-context.js).
  assert.ok(sw.includes('"/assets/browser-context.js"'), "browser-context.js fehlt im Shell-Precache");
  // v149 -> v150 (2026-07-27): start-styles.css buendelt die Startseiten-Stylesheets.
  assert.ok(sw.includes('"/assets/start-styles.css"'), "Stylesheet-Buendel fehlt im Shell-Precache");
    // v153 -> v154 am 2026-07-28: view-title.js neu im Precache (Seitentitel je
  // Ansicht, QA-Welle 2 Befund W2-05). public/sw.js selbst siehe dort.
  // v157 -> v158 am 2026-07-28: die beiden englischen Hoeflichkeitsfassungen der
  // Rechtstexte (/en/legal-notice.html, /en/privacy.html) neu im Precache. Sie
  // gehoeren dorthin, weil die deutschen Originale ebenfalls vorab abgelegt
  // werden — sonst waeren die Rechtstexte offline nur auf Deutsch erreichbar.
  assert.ok(sw.includes('"/en/legal-notice.html"'), "englisches Impressum fehlt im Shell-Precache");
  assert.ok(sw.includes('"/en/privacy.html"'), "englische Datenschutzfassung fehlt im Shell-Precache");
  // v164 -> v165 am 2026-07-28: Aktionen pro Chat-Nachricht — chat-actions.js,
  // chat-messages.js und chat-actions-menu.js neu im Precache, start-styles.css
  // enthaelt neu chat-actions.css (siehe public/sw.js).
  assert.match(sw, /CACHE_NAME = "smejj-shell-v230"/);
});


test("Avatar-Menue: Ausloggen ist einen Klick entfernt", () => {
  // Befund 2026-07-17: Logout lag zwei Ebenen tief und wurde nicht gefunden.
  assert.match(html, /<div id="profileDockMenu" class="profile-dock-menu" role="menu"/);
  assert.match(html, /data-dock-action="logout"/);
  assert.match(html, /data-dock-action="account"/);
  assert.match(html, /data-dock-action="settings"/);
  assert.match(dockMenu, /logoutCurrentSession\(\)/);
  // Menue schliesst per Escape und Klick nach aussen.
  assert.match(dockMenu, /event\.key === "Escape"/);
  assert.match(dockMenu, /!menu\.contains\(event\.target\)/);
  // Beschriftungen nutzen bestehende i18n-Schluessel (keine neuen Texte).
  assert.match(dockMenu, /t\("Konto"\)/);
  assert.match(dockMenu, /t\("Ausloggen"\)/);
});

test("Abmelden verwirft die Session, behaelt aber das Profilbild", () => {
  // Das Bild ist eine lokale Einstellung, kein Sitzungsdatum — Loeschen laeuft
  // ausschliesslich ueber "Entfernen" bzw. "Lokale Daten loeschen".
  assert.match(dockMenu, /STORAGE_KEYS\.session/);
  assert.doesNotMatch(dockMenu, /clearProfilePicture|profile\.picture/);
});

test("Kontoseite zeigt nur zustandsrichtige Aktionen", () => {
  assert.match(authState, /LOGIN_CONTROLS/);
  assert.match(authState, /LOGOUT_CONTROLS/);
  // Server-Sitzungen (Passwort/Fern-Widerruf) gelten nur fuer E-Mail-Konten.
  assert.match(authState, /method === "email"/);
  // Nichts wird entfernt, nur ein-/ausgeblendet (Non-Regression).
  assert.doesNotMatch(authState, /\.remove\(\)|innerHTML/);
  assert.match(account, /applyAuthState\(view, user\)/);
});

test("Kontobild wird hoechstens einmal uebernommen und nie ueberschrieben", () => {
  assert.match(control, /AUTO_IMPORT_KEY = "smejj\.profile\.picture\.autoimport\.v1"/);
  // Merker VOR dem Versuch setzen -> kein endloses Wiederholen bei Fehlschlag.
  assert.match(control, /if \(!alreadyTried\) localStorage\.setItem\(AUTO_IMPORT_KEY/);
  // Eigenes Bild hat Vorrang.
  assert.match(control, /if \(alreadyTried \|\| readProfilePicture\(\)\) return;/);
  // Import laeuft ueber dieselben harten Grenzen wie der Upload.
  assert.match(store, /export async function importProfilePictureFromUrl/);
  assert.match(store, /return saveProfilePicture\(new File/);
  assert.match(store, /referrerPolicy: "no-referrer"/);
});

test("Menue wird nicht von der Sidebar abgeschnitten (Live-Fehler 2026-07-17)", () => {
  // .sidebar hat overflow:hidden UND transform — ein Menue INNERHALB der Sidebar
  // wurde abgeschnitten (gemessen: 208px Menue in 199px Sidebar). Deshalb haengt
  // es am <body> und wird per position:fixed gesetzt.
  assert.match(dockMenu, /document\.body\.append\(menu\)/);
  assert.match(dockCss, /\.profile-dock-menu \{[^}]*position: fixed/s);
  assert.doesNotMatch(dockCss, /\.profile-dock-menu \{[^}]*position: absolute/s);
  // Menue bleibt im sichtbaren Bereich.
  assert.match(dockMenu, /window\.innerWidth - width - 8/);
});

test("Menue-Geometrie: feste Breite und ueber der Sidebar (Live-Fehler 2026-07-17)", () => {
  // Nach dem Umhaengen an <body> waere "100%" die FENSTERbreite gewesen
  // (live gemessen: 885px). Und die Sidebar liegt auf z-index 70.
  assert.match(dockCss, /\.profile-dock-menu \{[^}]*width: 232px/s);
  assert.doesNotMatch(dockCss, /\.profile-dock-menu \{[^}]*min-width: max\(100%/s);
  const z = dockCss.match(/\.profile-dock-menu \{[^}]*z-index: (\d+)/s);
  assert.ok(z && Number(z[1]) > 70, `Menue muss ueber der Sidebar liegen (z-index > 70), ist ${z && z[1]}`);
});

test("Abgemeldet zeigt das Dock weder Namen noch Bild (Live-Fehler 2026-07-17)", () => {
  // Befund des Betreibers: "ich kann nicht ausloggen". Technisch war er abgemeldet
  // (Token weg, Server-Session beendet) — aber das Dock zeigte weiter Name + Bild,
  // weil der Name aus dem gespeicherten Profil kam, ohne Statuspruefung.
  assert.match(dockJs, /function resolveDisplayName\(\) \{\s*\n\s*if \(!isSignedIn\(\)\) return t\("Nutzer"\);/);
  assert.match(dockJs, /const picture = isSignedIn\(\) \? readProfilePicture\(\) : "";/);
  // Abgemeldet auch keine Initiale — sonst stuende dort ein "n" von "Nutzer".
  assert.match(dockJs, /const initial = isSignedIn\(\) \? displayName\.trim\(\)\.charAt\(0\) : "";/);
  // Anmeldestatus aus BEIDEN Quellen: Server-Token und lokale Session.
  assert.match(dockJs, /AUTH_TOKEN_KEY = "smejj\.auth\.accessToken\.v1"/);
  assert.match(dockJs, /read\(STORAGE_KEYS\.session\)\.authenticated === true/);
  // Abgemeldet gibt es kein "Ausloggen" im Menue.
  assert.match(dockMenu, /if \(logout\) logout\.hidden = !signedIn;/);
});

test("Abmelden loescht das Profil NICHT, blendet es nur aus", () => {
  // Bild und Profil bleiben erhalten und kehren beim naechsten Anmelden zurueck.
  assert.doesNotMatch(dockJs, /removeItem\(STORAGE_KEYS\.profile\)|clearProfilePicture/);
});
