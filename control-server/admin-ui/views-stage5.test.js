// smejj.com — Tests der Deploy-Ansicht (Modul P) im Zeabur-Git-Bau.
// Ausfuehren: node --test control-server/admin-ui/views-stage5.test.js
//
// Befund Live-Audit 15.09.: Release, Gebaut, Pruefsummen standen alle auf "—"
// ("kein Release-Artefakt"), weil Zeabur aus Git baut. Die Ansicht zeigt jetzt
// den laufenden Commit und sagt, warum es kein Artefakt gibt.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const HIER = path.dirname(fileURLToPath(import.meta.url));

function ansichten() {
  const buehne = {};
  buehne.window = buehne;
  buehne.adminApi = {
    escapeHtml: (wert) => String(wert == null ? "" : wert)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;"),
    zeit: (iso) => (iso ? `Zeit(${iso})` : "—"),
    dauer: (sekunden) => `${sekunden} s`
  };
  vm.createContext(buehne);
  vm.runInContext(fs.readFileSync(path.join(HIER, "views.js"), "utf8"), buehne);
  vm.runInContext(fs.readFileSync(path.join(HIER, "views-stage5.js"), "utf8"), buehne);
  return buehne.adminViewsStage5;
}

test("gesund: Zeabur-Git-Bau zeigt Commit und Startzeit statt Release-Striche", () => {
  const html = ansichten().deploy({
    ok: true, bewertung: "zeabur-git", soll: {}, ist: { releaseId: null, fehler: "manifest_nicht_lesbar" },
    git: { commit: "77a96a10d34abc564f00112233445566778899aa", commitKurz: "77a96a10", quelle: "ZEABUR_GIT_COMMIT_SHA" },
    gestartetAm: "2026-09-15T10:00:00.000Z", laufzeitMs: 3_600_000, knoten: "v22.0.0",
    hinweis: "Zeabur baut den Control-Server direkt aus Git."
  });
  assert.equal(html.includes("77a96a10d34abc564f00112233445566778899aa"), true);
  assert.equal(html.includes("Zeit(2026-09-15T10:00:00.000Z)"), true, "Startzeit des Prozesses");
  assert.equal(html.includes("Release-Abgleich"), false, "keine Tabelle voller Striche");
  assert.equal(html.includes("style="), false, "CSP: keine style-Attribute");
});

test("kaputt: ohne Git-Stand bleibt der Artefakt-Abgleich und behauptet keinen Commit", () => {
  const html = ansichten().deploy({
    ok: true, bewertung: "lokal", soll: {}, ist: { releaseId: null }, git: null,
    gestartetAm: null, laufzeitMs: null, knoten: "v22.0.0", hinweis: "x"
  });
  assert.equal(html.includes("Release-Abgleich"), true);
  assert.equal(html.includes("Zeabur-Git-Bau"), false);
});
