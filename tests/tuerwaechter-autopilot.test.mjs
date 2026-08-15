// Wache fuer den Tuerwaechter (2026-08-14). Er ist die Antwort auf zwei stille
// Aussperrungen an einem Tag, bei denen JEDER bestehende Autopilot gruen war:
// sie messen Dienste, nicht den Weg eines Menschen durch die Tuer.
//
// Der Wert dieses Autopiloten haengt an einer einzigen Eigenschaft: Er darf
// Aussperrung und Stoerung nicht verwechseln. Schlaegt er bei jeder 503 an,
// wird er ignoriert — und dann fehlt er genau an dem Tag, an dem es zaehlt.
import test from "node:test";
import assert from "node:assert/strict";
import { bewerteStufe, fasseZusammen, fuehreSelbsttestAus, pruefeTueren } from "../control-server/src/autopilots/tuerwaechterAutopilot.js";

test("erkennt die Admin-Aussperrung, die wochenlang unbemerkt blieb", () => {
  const u = bewerteStufe({ stufe: "adminbereich", status: 403, koerper: { error: "admin_email_not_verified" } });
  assert.equal(u.urteil, "zu");
  assert.match(u.hinweis, /Kontodatensatz/, "der Hinweis muss zur Ursache fuehren");
});

test("erkennt die Chat-Aussperrung", () => {
  assert.equal(bewerteStufe({ stufe: "sitzung", status: 401, koerper: { error: "authentication_required" } }).urteil, "zu");
});

test("kaputte Probe: eine Speicherstoerung ist KEINE Aussperrung", () => {
  const u = bewerteStufe({ stufe: "adminbereich", status: 503, koerper: { error: "admin_directory_unavailable" } });
  assert.equal(u.urteil, "gestoert", "sonst weckt der Waechter den Betreiber wegen jeder Stoerung");
});

test("kaputte Probe: ein Netzfehler ist KEINE Aussperrung", () => {
  assert.equal(bewerteStufe({ stufe: "sitzung", netzfehler: "fetch failed" }).urteil, "gestoert");
});

test("gesunde Probe: 200 heisst offen", () => {
  assert.equal(bewerteStufe({ stufe: "sitzung", status: 200, koerper: { ok: true } }).urteil, "offen");
});

test("Alarm nur bei geschlossener Tuer — nie bei blosser Stoerung", () => {
  assert.equal(fasseZusammen([{ stufe: "a", urteil: "gestoert", grund: "netzfehler" }]).alarm, false);
  assert.equal(fasseZusammen([{ stufe: "a", urteil: "offen" }]).alarm, false);
  const alarm = fasseZusammen([{ stufe: "adminbereich", urteil: "zu", grund: "admin_email_not_verified" }]);
  assert.equal(alarm.alarm, true);
  assert.match(alarm.text, /AUSGESPERRT: adminbereich/, "die Meldung muss die Stufe nennen");
});

test("ohne Messtoken behauptet er NICHT, alles sei gut", async () => {
  const e = await pruefeTueren({ controlOrigin: "https://example.invalid", token: "" });
  assert.equal(e.messbar, false);
  assert.equal(e.grund, "kein_messtoken");
  assert.equal(e.alarm, false, "nicht messbar ist kein Alarm");
  assert.equal(e.text, "nichts geprueft".replace("ue", "ü"), "und auch keine Entwarnung");
});

test("laeuft die ganze Kette ab und meldet die geschlossene Stufe", async () => {
  const antworten = {
    "/api/auth/me": { status: 200, body: { ok: true } },
    "/api/admin/me": { status: 403, body: { error: "admin_email_not_verified" } },
    "/api/admin/geld/abos": { status: 403, body: { error: "admin_email_not_verified" } }
  };
  const fetchFn = async (url) => {
    const pfad = new URL(url).pathname;
    const a = antworten[pfad];
    return { status: a.status, json: async () => a.body };
  };
  const e = await pruefeTueren({ controlOrigin: "https://control.example", token: "t", fetchFn });
  assert.equal(e.alarm, true);
  assert.deepEqual(e.offen, ["sitzung"], "die Sitzung stand offen — genau das taeuschte bisher Gesundheit vor");
  assert.equal(e.ausgesperrt.length, 2);
});

test("Selbsttests des Autopiloten laufen durch", () => {
  const e = fuehreSelbsttestAus();
  assert.equal(e.bestanden, true, e.fehler.join("; "));
});
