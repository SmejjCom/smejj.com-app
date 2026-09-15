// smejj.com — A-bis-Z-Livetest 15.09.2026, zwei Befunde am Profil-Menue:
//
// F8:  Nach dem Abmelden blieb localStorage "smejj.session.v1" stehen (als
//      {authenticated:false}). Abgemeldet heisst: der Eintrag ist WEG — auf allen
//      drei Abmeldewegen (Dock-Menue, Konto-Ansicht, Google-Knopf).
// F12: iPhone: "Einstellungen" im Profil-Menue oeffnete die Ansicht, liess die Spur
//      aber offen und verdeckte sie. Jetzt schliesst sie wie bei "Alle Gespraeche".
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const lies = (d) => readFileSync(`public/${d}`, "utf8");

/** Schreibt ein Abmeldeweg die Sitzung zurueck, statt sie zu entfernen? */
function schreibtSitzungZurueck(quelle) {
  return /setItem\(STORAGE_KEYS\.session, JSON\.stringify\((state\.session|\{ authenticated: false)/.test(quelle)
    && /authenticated: false/.test(quelle);
}
function entferntSitzung(quelle) {
  return /localStorage\.removeItem\(STORAGE_KEYS\.session\)/.test(quelle);
}

test("KAPUTT (v883): der alte Abmeldeweg liess die Sitzung als Eintrag stehen", () => {
  const alt = `    localStorage.setItem(STORAGE_KEYS.session, JSON.stringify({ authenticated: false, mode: "local-only" }));`;
  assert.equal(schreibtSitzungZurueck(alt), true);
  assert.equal(entferntSitzung(alt), false);
});

test("GESUND: alle drei Abmeldewege entfernen smejj.session.v1", () => {
  const dock = lies("profile-dock-menu.js");
  const logout = dock.slice(dock.indexOf("async function logout()"), dock.indexOf("export function vergissProfilEmail"));
  assert.ok(entferntSitzung(logout) && !/setItem\(STORAGE_KEYS\.session/.test(logout), "Dock-Menue");

  const app = lies("app.js");
  const konto = app.slice(app.indexOf('$("#logoutLocal")'), app.indexOf('$("#saveProfile")'));
  assert.ok(entferntSitzung(konto) && !/setItem\(STORAGE_KEYS\.session/.test(konto), "Konto-Ansicht");

  const google = lies("google-login.js");
  const knopf = google.slice(google.indexOf("button.addEventListener(\"click\""), google.indexOf('$("#googleSignIn").append(button)'));
  assert.ok(entferntSitzung(knopf) && !/setItem\(STORAGE_KEYS\.session/.test(knopf), "Google-Abmelden");
});

test("GESUND: auth-gate-frueh gilt ohne Eintrag als abgemeldet (kein Rest noetig)", () => {
  assert.match(lies("auth-gate-frueh.js"), /JSON\.parse\(localStorage\.getItem\("smejj\.session\.v1"\) \|\| "\{\}"\)/);
});

// ---- F12 ----
const quelle = lies("profile-dock-menu.js");
const start = quelle.indexOf("export function schliesseSpurAmHandy");
const schliesseSpurAmHandy = new Function(`${quelle.slice(start, quelle.indexOf("\n}\n", start) + 2).replace("export function", "function")}; return schliesseSpurAmHandy;`)();

function dokument({ offen }) {
  const klassen = new Set(offen ? ["sidebar", "is-open"] : ["sidebar"]);
  const spur = { classList: { contains: (k) => klassen.has(k) } };
  const abdunkler = { click: () => klassen.delete("is-open") };
  return { spur, querySelector: (s) => (s === ".sidebar" ? spur : null), getElementById: (id) => (id === "sidebarBackdrop" ? abdunkler : null) };
}

test("KAPUTT (v883): pushState + popstate allein liess die Handy-Spur offen", () => {
  const dok = dokument({ offen: true });
  const altGoTo = () => { /* history.pushState + popstate — sonst nichts */ };
  altGoTo("/settings");
  assert.equal(dok.spur.classList.contains("is-open"), true, "die Spur verdeckt die Einstellungen");
});

test("GESUND: nach 'Einstellungen' schliesst die Handy-Spur; am Desktop passiert nichts", () => {
  const handy = dokument({ offen: true });
  assert.equal(schliesseSpurAmHandy(handy), true);
  assert.equal(handy.spur.classList.contains("is-open"), false);
  const desktop = dokument({ offen: false });
  assert.equal(schliesseSpurAmHandy(desktop), false);
  assert.match(quelle, /window\.dispatchEvent\(new PopStateEvent\("popstate"\)\);\n\s*schliesseSpurAmHandy\(\);/, "goTo schliesst nach dem Wechsel");
});
