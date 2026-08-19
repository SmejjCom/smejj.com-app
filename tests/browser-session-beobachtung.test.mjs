// smejj.com — das Tor fuer den Seitenzustand (Control-Server).
//
// Gemessen 2026-08-19 an der laufenden Seite: die Erlaubnisliste kannte vom
// Bedienbaum KEIN einziges Feld. Sie liess nur `text` und
// `elements:[{role,name,selector}]` durch — beides schickt der Worker seit dem
// Umbau auf observer.mjs gar nicht mehr. Die Beobachtung kam vollstaendig LEER
// beim Modell an, und die Maus war blind.
//
// Diese Tests halten beide Seiten fest: was DURCH muss, und was NICHT.
import test from "node:test";
import assert from "node:assert/strict";
import { saubereBeobachtungsElement } from "../control-server/src/routes/browserSessionRoutes.js";

test("die Kennung n ueberlebt — ohne sie kann die Maus nicht zielen", () => {
  // Mit n zeigt das Modell auf genau das Element, das es gesehen hat. Faellt
  // die Kennung weg, kann es sehen, aber nicht treffen.
  const e = saubereBeobachtungsElement({ n: 12, tag: "a", x: 100, y: 640, text: "Impressum", href: "/impressum.html" });
  assert.equal(e.n, 12);
  assert.equal(e.tag, "a");
  assert.equal(e.text, "Impressum");
  assert.equal(e.href, "/impressum.html");
  assert.equal(e.x, 100);
  assert.equal(e.y, 640);
});

test("leere Felder werden weggelassen, nicht als leerer String gefuehrt", () => {
  // Vorher wurde jedes Feld zu String(...) gezwungen — aus einem fehlenden
  // role wurde "" . Genau so sah die kaputte Beobachtung aus: neun Elemente,
  // in denen alles ein leerer String war.
  const e = saubereBeobachtungsElement({ n: 1, tag: "button" });
  assert.deepEqual(Object.keys(e).sort(), ["n", "tag"]);
  assert.ok(!("role" in e), "leeres role darf nicht als \"\" erscheinen");
});

test("Passwortfelder bleiben als solche erkennbar", () => {
  const e = saubereBeobachtungsElement({ n: 3, tag: "input", type: "password", masked: true, text: "***" });
  assert.equal(e.masked, true);
  assert.equal(e.text, "***");
});

test("das Tor bleibt ein Tor: Unbekanntes kommt NICHT durch", () => {
  // Der Zustand geht als untrusted Text in einen Modell-Prompt. Ein Feld, das
  // hier nicht genannt ist, hat dort nichts zu suchen.
  const e = saubereBeobachtungsElement({ n: 1, tag: "a", cookie: "geheim", onclick: "alert(1)", __proto__: { boese: true } });
  assert.ok(!("cookie" in e));
  assert.ok(!("onclick" in e));
  assert.ok(!("boese" in e));
});

test("alles wird hart gekappt — Groesse ist Teil der Sicherheit", () => {
  const e = saubereBeobachtungsElement({
    n: 999999, tag: "x".repeat(100), text: "y".repeat(1000), href: "z".repeat(1000), x: 1e9, y: -1e9
  });
  assert.ok(e.tag.length <= 20);
  assert.ok(e.text.length <= 120);
  assert.ok(e.href.length <= 300);
  assert.ok(Math.abs(e.x) <= 20000 && Math.abs(e.y) <= 20000);
  assert.ok(e.n <= 1000);
});

test("ein alter Worker mit fertigem Selektor laeuft weiter", () => {
  // Rueckwaertsvertraeglich: solange nicht ueberall neu gebaut ist, duerfen
  // beide Formen ankommen.
  const e = saubereBeobachtungsElement({ role: "button", name: "Senden", selector: { strategy: "text", value: "Senden" } });
  assert.equal(e.role, "button");
  assert.equal(e.name, "Senden");
  assert.deepEqual(e.selector, { strategy: "text", value: "Senden" });
});
