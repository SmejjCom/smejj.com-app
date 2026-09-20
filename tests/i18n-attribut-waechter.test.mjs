// smejj.com — Waechter: eine Uebersetzung darf nie als nackter TEXT in einem HTML-Attribut landen.
// Live-Fehler v921/v922 (am Android- und iPhone-Geraet gefunden, 20.09.2026): in Template-Strings stand
// `title=t("Zurück")` ohne ${…}. Der Browser las das als Attributwert `t(` — in der Adressleiste des
// eingebauten Browsers stand fuer ALLE Nutzer sichtbar `t("Suchen`, Screenreader lasen `t("Neuer`.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const MUSTER = [
  /\b(title|aria-label|placeholder|alt|value|label)=t\(/,   // attribut=t("…") ohne ${}
  />\s*t\("[^"]+"\)\s*</                                     // >t("…")< als Elementtext
];

function dateien(ordner) {
  const liste = [];
  for (const eintrag of fs.readdirSync(ordner, { withFileTypes: true })) {
    if (eintrag.name === "assets" || eintrag.name === "i18n") continue; // Spiegel bzw. Woerterbuecher
    const voll = path.join(ordner, eintrag.name);
    if (eintrag.isDirectory()) liste.push(...dateien(voll));
    else if (/\.(js|html)$/.test(eintrag.name)) liste.push(voll);
  }
  return liste;
}

test("kein t(\"…\") steht als nackter Text in einem HTML-Attribut oder Element", () => {
  const treffer = [];
  for (const datei of dateien(wurzel)) {
    fs.readFileSync(datei, "utf8").split("\n").forEach((zeile, i) => {
      const roh = zeile.trim();
      if (roh.startsWith("//") || roh.startsWith("*") || roh.startsWith("/*")) return;
      if (MUSTER.some((m) => m.test(zeile))) treffer.push(`${path.relative(wurzel, datei)}:${i + 1}  ${roh.slice(0, 90)}`);
    });
  }
  assert.deepEqual(treffer, [], `Uebersetzung als nackter Text — richtig ist ="\${escapeHtml(t("…"))}":\n${treffer.join("\n")}`);
});

test("die Kopfleiste des Browsers setzt ihre Uebersetzungen mit Anfuehrungszeichen und Escaping ein", () => {
  const quelle = fs.readFileSync(path.join(wurzel, "browser-pane-render.js"), "utf8");
  for (const text of ["Neuer Tab", "Zurück", "Vorwärts", "Diese Seite neu laden", "Suchen oder URL eingeben"]) {
    assert.ok(quelle.includes(`="\${escapeHtml(t("${text}"))}"`), `fehlt: ${text}`);
  }
  assert.match(quelle, /\.replaceAll\('"', "&quot;"\)/, "escapeHtml muss Anfuehrungszeichen entschaerfen");
});

test("das Browser-Fenster ruecksichtigt den oberen Sicherheitsrand der iPhone-App", () => {
  const css = fs.readFileSync(path.join(wurzel, "browser-pane.css"), "utf8");
  assert.match(css, /\.browser-panel\.is-browser-mode:not\(\.is-compact\)\s*\{\s*padding-top:\s*env\(safe-area-inset-top, 0px\);/);
  assert.match(css, /\.browser-panel:not\(\.is-browser-mode\):not\(\.is-compact\)\s*\{\s*padding-top:\s*calc\(32px \+ env\(safe-area-inset-top, 0px\)\);/);
});
