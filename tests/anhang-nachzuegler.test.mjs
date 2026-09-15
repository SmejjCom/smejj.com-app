// Dateiwahl vor dem Anbinden geht nicht verloren (15.09.2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
for (const [datei, kopf] of [["public/composer-plus-menu.js", "function bindAttachInput("], ["public/composer-bild-anhang.js", "export function bindBildAnhang("]]) {
  test(`${datei}: liegt beim Anbinden schon eine Datei vor, wird sie uebernommen`, () => {
    const q = fs.readFileSync(datei, "utf8");
    const rumpf = q.slice(q.indexOf(kopf), q.indexOf("\n}\n", q.indexOf(kopf)));
    const listener = rumpf.indexOf('fileInput.addEventListener("change"');
    const nachzuegler = rumpf.indexOf('if (fileInput.files?.length) fileInput.dispatchEvent(new Event("change"));');
    assert.ok(listener > 0 && nachzuegler > listener, "erst Listener, dann Nachzuegler");
  });
}
