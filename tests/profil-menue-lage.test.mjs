// smejj.com — Lage des Profil-Menues am Handy (Geraetetest 22.09.2026, iPhone):
// der Tipp auf "Mein Konto" ging durch das Menue auf die Chatliste dahinter,
// weil die Lage ueber `bottom: innerHeight - anchor.top` gesetzt war und
// innerHeight in der iOS-App nicht zum Layout-Viewport passt. Die Rechnung
// haengt jetzt NUR am Anker (Oberkante), nie an innerHeight.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { lageUeberKnopf } from "../public/profile-dock-menu.js";

const basis = { ankerOben: 700, ankerUnten: 744, ankerLinks: 12, menueBreite: 232, menueHoehe: 320, fensterBreite: 393, fensterHoehe: 852, saOben: 62 };

test("die Oberkante haengt am Anker, nicht an innerHeight (800 und 852 ergeben dieselbe Lage)", () => {
  const a = lageUeberKnopf({ ...basis, fensterHoehe: 852 });
  const b = lageUeberKnopf({ ...basis, fensterHoehe: 800 });
  assert.deepEqual(a, b);
  assert.equal(a.oben, 700 - 320 - 8);
  assert.equal(a.links, 12);
});

test("ohne Platz darueber rutscht das Menue unter den Knopf, aber nie unter die Fensterkante", () => {
  const eng = lageUeberKnopf({ ...basis, ankerOben: 100, ankerUnten: 144 });
  assert.equal(eng.oben, 144 + 8);
  const ganzUnten = lageUeberKnopf({ ...basis, ankerOben: 100, ankerUnten: 144, fensterHoehe: 300 });
  assert.equal(ganzUnten.oben, Math.max(8 + 62, 300 - 320 - 8));
});

test("das Menue bleibt seitlich im Fenster", () => {
  const rechts = lageUeberKnopf({ ...basis, ankerLinks: 380 });
  assert.equal(rechts.links, 393 - 232 - 8);
  const links = lageUeberKnopf({ ...basis, ankerLinks: -20 });
  assert.equal(links.links, 8);
});

test("das Modul setzt top und loest bottom — und die Menuepunkte sind Bedienflaechen", () => {
  const quelle = fs.readFileSync(new URL("../public/profile-dock-menu.js", import.meta.url), "utf8");
  assert.match(quelle, /menu\.style\.bottom = "auto"/);
  assert.match(quelle, /menu\.style\.top = /);
  assert.doesNotMatch(quelle, /window\.innerHeight - anchor\.top/);
  assert.match(quelle, /if \(open\) raeumeTextauswahlAuf\(\)/);
  const css = fs.readFileSync(new URL("../public/profile-dock.css", import.meta.url), "utf8");
  assert.match(css, /\.profile-dock-menu \[role="menuitem"\] \{[^}]*touch-action: manipulation/);
});
