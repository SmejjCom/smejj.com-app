// smejj.com — Tests fuer Modul L, Teil 2 (Sicherheitslage).
// Ausfuehren: node --test control-server/src/admin/opsSicherheitsLage.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { endpunktLage, sicherheitsLage } from "./opsSicherheitsLage.js";

const JETZT = Date.parse("2026-08-23T06:30:00.000Z");

test("Endpunkte: gezaehlt wird, was ZU ist — und die offene Liste ist kurz und benannt", () => {
  const l = endpunktLage();
  assert.ok(l.bekannt > 20, "es gibt mehr als 20 bekannte API-Pfade");
  assert.ok(l.geschlossen > l.offen, "die Mehrheit muss geschlossen sein (Erlaubnisliste)");
  assert.ok(l.offeneListe.includes("/api/health"), "die Liveness-Sonde muss offen bleiben");
  assert.ok(!l.offeneListe.some((p) => p.startsWith("/api/admin")), "kein Admin-Pfad darf offen sein");
});

test("Zugaenge: Werte verlassen das Modul nie; Pflichtwerte fehlen sichtbar", async () => {
  const u = await sicherheitsLage({
    env: { SMEJJ_SESSION_SECRET: "sehr-geheim-1234567890", IDRIVE_E2_ACCESS_KEY: "AK", SMEJJ_AUTOPILOT_KEYS: "a:1,b:2" },
    jetztMs: JETZT, wurzel: mkdtempSync(path.join(tmpdir(), "sl-")),
    leseFreigaben: async () => ({ ok: true, approvals: [] })
  });
  const text = JSON.stringify(u);
  assert.ok(!text.includes("sehr-geheim"), "ein Geheimniswert darf nie in der Antwort stehen");
  const z = Object.fromEntries(u.zugaenge.map((x) => [x.name, x]));
  assert.equal(z.SMEJJ_SESSION_SECRET.zustand, "gesetzt");
  assert.equal(z.IDRIVE_E2_SECRET_KEY.zustand, "fehlt-pflicht");
  assert.equal(z.STRIPE_SECRET_KEY.zustand, "fehlt");
  assert.equal(z.SMEJJ_AUTOPILOT_KEYS.beleg, "2 Kennungen hinterlegt");
  assert.deepEqual(u.pflichtFehlt, ["IDRIVE_E2_SECRET_KEY"]);
});

test("Vier-Augen: nur offene Antraege zaehlen, mit Wartezeit", async () => {
  const u = await sicherheitsLage({
    env: {}, jetztMs: JETZT, wurzel: mkdtempSync(path.join(tmpdir(), "sl-")),
    leseFreigaben: async () => ({ ok: true, approvals: [
      { id: "a1", action: "user.delete", target: "user_a", reason: "Antrag", requestedBy: "x@y", requestedAt: "2026-08-23T06:10:00.000Z", expiresAt: "2026-08-24T06:10:00.000Z", status: "pending" },
      { id: "a2", action: "plan.change", target: "user_b", reason: "alt", requestedBy: "x@y", requestedAt: "2026-08-20T06:10:00.000Z", status: "approved" }
    ] })
  });
  assert.equal(u.vierAugen.offen, 1);
  assert.equal(u.vierAugen.gesamt, 2);
  assert.equal(u.vierAugen.liste[0].wartetSeitMin, 20);
});

test("Freigaben nicht lesbar: erreichbar=false, kein erfundenes 'nichts offen'", async () => {
  const u = await sicherheitsLage({
    env: {}, jetztMs: JETZT, wurzel: mkdtempSync(path.join(tmpdir(), "sl-")),
    leseFreigaben: async () => { throw new Error("s3 down"); }
  });
  assert.equal(u.vierAugen.erreichbar, false);
  assert.match(u.vierAugen.grund, /s3 down/);
});
