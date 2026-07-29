// smejj.com — Tests fuer die Upload-Sperre auf IDrive e2.
//
// Kern: fail-closed. Lieber ein Upload, der nicht startet, als eine Rechnung,
// die niemand kommen sah.
//
// Ausfuehren: node --test tests/idrive-quota-guard.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { pruefeKontingent } from "../scripts/deploy/idrive-quota-guard.mjs";

const GIB = 1024 ** 3;
const TIB = 1024 ** 4;

function lage({ bytesGesamt, vollstaendig = true, ok = true, error = "" }) {
  return async () => (ok
    ? { ok: true, bytesGesamt, vollstaendig, hinweis: vollstaendig ? "vollstaendig" : "Mindestwert: ein Eimer war nicht lesbar" }
    : { ok: false, error });
}

test("ein Upload, der hineinpasst, wird freigegeben", async () => {
  const e = await pruefeKontingent({
    zusaetzlicheBytes: 100 * GIB, env: {},
    lageLesen: lage({ bytesGesamt: 1258 * GIB })
  });
  assert.equal(e.ok, true);
  assert.equal(e.lage.nachher.ampel, "ok");
});

test("EIN UPLOAD UEBER DER GRENZE WIRD GESPERRT — MIT DEM PREIS IM KLARTEXT", async () => {
  const e = await pruefeKontingent({
    zusaetzlicheBytes: 800 * GIB, env: {},
    lageLesen: lage({ bytesGesamt: 1258 * GIB })
  });
  assert.equal(e.ok, false);
  assert.equal(e.grund.includes("Grenze 95 %"), true);
  assert.equal(/USD\/Monat/.test(e.grund), true, "die Folge steht als Betrag dabei, nicht als Warnung");
});

test("FAIL-CLOSED: ohne Messung kein Upload", async () => {
  const e = await pruefeKontingent({
    zusaetzlicheBytes: 1, env: {},
    lageLesen: lage({ ok: false, error: "speicher_nicht_eingerichtet" })
  });
  assert.equal(e.ok, false);
  assert.equal(e.grund.includes("nicht messbar"), true);
  assert.equal(e.grund.includes("speicher_nicht_eingerichtet"), true, "der Grund wird durchgereicht");
});

test("ein Mindestwert nahe der Grenze winkt nicht durch", async () => {
  // 88 % gemessen, aber die Messung ist unvollstaendig: die echte Belegung kann
  // hoeher liegen. Innerhalb von zehn Punkten unter der Grenze wird gesperrt.
  const e = await pruefeKontingent({
    zusaetzlicheBytes: 0, env: {},
    lageLesen: lage({ bytesGesamt: 2 * TIB * 0.88, vollstaendig: false })
  });
  assert.equal(e.ok, false);
  assert.equal(e.grund.includes("Mindestwert"), true);
});

test("ein Mindestwert weit unter der Grenze darf durch", async () => {
  const e = await pruefeKontingent({
    zusaetzlicheBytes: 0, env: {},
    lageLesen: lage({ bytesGesamt: 2 * TIB * 0.30, vollstaendig: false })
  });
  assert.equal(e.ok, true, "unvollstaendig heisst nicht automatisch gefaehrlich");
});

test("die Grenze laesst sich bewusst anheben", async () => {
  const streng = await pruefeKontingent({
    zusaetzlicheBytes: 500 * GIB, env: { SMEJJ_IDRIVE_GRENZE_PROZENT: "80" },
    lageLesen: lage({ bytesGesamt: 1258 * GIB })
  });
  assert.equal(streng.ok, false, "bei 80 % ist derselbe Upload gesperrt");

  const locker = await pruefeKontingent({
    zusaetzlicheBytes: 500 * GIB, env: { SMEJJ_IDRIVE_GRENZE_PROZENT: "99" },
    lageLesen: lage({ bytesGesamt: 1258 * GIB })
  });
  assert.equal(locker.ok, true);
});

test("ein groesseres Paket verschiebt die Grenze", async () => {
  const e = await pruefeKontingent({
    zusaetzlicheBytes: 800 * GIB, env: { SMEJJ_IDRIVE_PLAN_TIB: "5" },
    lageLesen: lage({ bytesGesamt: 1258 * GIB })
  });
  assert.equal(e.ok, true, "mit 5 TiB Paket passt derselbe Upload");
});
