// smejj.com — Tests der Cockpit-Ansicht (Sichtbarkeit der Sicherheitsalarme).
// Ausfuehren: node --test control-server/admin-ui/views.test.js
//
// Warum es diesen Test gibt: Die Sicherheitswache meldete bis 2026-08-07 nur
// ins Audit-Log und per Mail. Wer die Konsole aufmachte, sah nichts davon —
// eine Abwehr, von der niemand erfaehrt, verhindert den einen Versuch, nicht
// den naechsten. Jetzt steht sie im Cockpit, und dieser Test haelt sie dort.
//
// views.js ist ein Browser-Skript (IIFE auf window). Es wird deshalb in eine
// kleine Buehne geladen statt importiert.
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
    zeit: () => "07.08.2026 08:15",
    dauer: (sekunden) => `${sekunden} s`
  };
  vm.createContext(buehne);
  vm.runInContext(fs.readFileSync(path.join(HIER, "views.js"), "utf8"), buehne);
  return buehne.adminViews;
}

// Die Seite A "Uebersicht" (Alarm-Lage aus dem Audit) ist am 2026-08-23 ins
// Cockpit gewandert — ihre Tests stehen in opsCockpit.test.js.

// ---- B2 · Aktionsleiste der Nutzerakte --------------------------------------
//
// Befund der A-bis-Z-Pruefung vom 14.08.2026: console.js bindet seit dem
// 28.07.2026 Handler an `#akteAktionen` und `[data-aktion]` — gezeichnet hat
// diese Leiste nie jemand. Der komplette schreibende Adminbereich war damit
// unerreichbar, obwohl Server, Vier-Augen-Freigabe und Audit-Log fertig waren.
// Diese Tests halten die Leiste dort, wo console.js sie sucht.

function akte(user) {
  return ansichten().akte({ user, grund: "Pruefung" });
}

const KONTO = {
  name: "Testkonto", email: "t@example.invalid", userId: "u-1", method: "email",
  role: "user", status: "active", emailVerifiedAt: "2026-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  sessions: []
};

test("die Akte zeichnet die Leiste, an die console.js seine Handler bindet", () => {
  const html = akte(KONTO);
  assert.match(html, /id="akteAktionen"/, "ohne diese Kennung findet console.js gar nichts");
  assert.match(html, /data-aktion="block"/);
  assert.match(html, /data-aktion="role\.grant"/);
  assert.match(html, /data-aktion="delete"/);
  assert.match(html, /data-aktion="impersonation"/);
});

test("ein gesperrtes Konto bietet Entsperren an, kein zweites Sperren", () => {
  const html = akte({ ...KONTO, status: "blocked" });
  assert.match(html, /data-aktion="unblock"/);
  assert.ok(!html.includes('data-aktion="block"'), "Sperren waere hier ein Knopf ohne Wirkung");
});

test("bestaetigte Adressen bekommen kein 'E-Mail bestaetigen'", () => {
  assert.ok(!akte(KONTO).includes('data-aktion="verify"'));
  assert.match(akte({ ...KONTO, emailVerifiedAt: null }), /data-aktion="verify"/);
});

test("Entriegeln und Abmelden erscheinen nur, wenn es etwas zu tun gibt", () => {
  assert.ok(!akte(KONTO).includes('data-aktion="unlock"'));
  assert.ok(!akte(KONTO).includes('data-aktion="sessions.revoke"'));
  const html = akte({
    ...KONTO,
    loginGuard: { failedCount: 5, lockedUntil: "2026-08-14T20:00:00.000Z" },
    sessions: [{ device: "Mac", sidHint: "ab12", lastSeenAt: null, expiresAt: null, active: true }]
  });
  assert.match(html, /data-aktion="unlock"/);
  assert.match(html, /data-aktion="sessions\.revoke"/);
});

test("an einer geloeschten Huelle gibt es keinen einzigen Knopf mehr", () => {
  const html = akte({ ...KONTO, status: "deleted" });
  assert.ok(!html.includes("data-aktion="), "geloeschte Konten duerfen keine Aktionen anbieten");
  assert.match(html, /gelöscht/);
});

// ---- C · Herkunft der eigenen Rolle -----------------------------------------
//
// Am 2026-08-14 loeschte ein einziger fehlerhafter Aufruf die Zeabur-Umgebung.
// Mit SMEJJ_ADMIN_OWNER_EMAILS war der gesamte Adminzugang weg, weil im Konto
// des Betreibers nur die Rolle "user" steht. Die Konsole erwaehnte die Variable
// zwar, nannte aber die Folge nicht.

function rollen(actor) {
  return ansichten().rollen({ actor, permissions: { "users.read": "allow" } });
}

test("Bootstrap-Rechte werden als Einzelrisiko benannt, nicht nur erwaehnt", () => {
  const html = rollen({ role: "owner", roleSource: "bootstrap", storedRole: "user" });
  assert.match(html, /SMEJJ_ADMIN_OWNER_EMAILS/);
  assert.match(html, /ist die Konsole für alle zu/, "die FOLGE muss dastehen, nicht nur die Herkunft");
  assert.match(html, /control_umgebung_wiederherstellen/, "der Weg zurueck gehoert dazu");
  assert.match(html, /user/, "die tatsaechlich gespeicherte Rolle muss sichtbar sein");
});

test("wer seine Rolle aus dem Konto hat, bekommt keine Warnung", () => {
  const html = rollen({ role: "owner", roleSource: "store", storedRole: "owner" });
  assert.ok(!html.includes("SMEJJ_ADMIN_OWNER_EMAILS"),
    "ohne Bootstrap-Herkunft waere die Warnung nur Laerm");
});

test("die Rollen-Ansicht bietet KEINEN Knopf zur Selbstbefoerderung", () => {
  const html = rollen({ role: "owner", roleSource: "bootstrap", storedRole: "user" });
  assert.ok(!html.includes("data-aktion"),
    "Rollenvergabe ist Vier-Augen — ein Knopf hier haette das mit einem Klick ausgehebelt");
  assert.match(html, /Vier-Augen/);
});
