// smejj.com Operations Console — Zugriff auf die eigene API.
//
// Gleiche Herkunft wie der Control-Server: das Sitzungs-Cookie geht von selbst
// mit, es wird kein Token durch localStorage gereicht. Klassisches Skript
// (kein ES-Modul), damit die CSP-Regel script-src 'self' ohne Sonderfall greift.
//
// Jede Antwort wird auf ein einheitliches Ergebnis gebracht: { ok, status, data,
// fehler }. Die Ansichten sollen Fehler anzeigen, nicht auffangen muessen.
(function () {
  "use strict";

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  async function hole(pfad) {
    try {
      const antwort = await fetch(pfad, { headers: { accept: "application/json" }, cache: "no-store" });
      const text = await antwort.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
      if (!antwort.ok) return { ok: false, status: antwort.status, data, fehler: fehlertext(antwort.status, data) };
      return { ok: true, status: antwort.status, data, fehler: "" };
    } catch (error) {
      return { ok: false, status: 0, data: {}, fehler: "Keine Verbindung zum Control-Server: " + String(error && error.message || error) };
    }
  }

  async function sende(pfad, koerper) {
    try {
      const antwort = await fetch(pfad, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(koerper || {})
      });
      const text = await antwort.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
      if (!antwort.ok) return { ok: false, status: antwort.status, data, fehler: fehlertext(antwort.status, data) };
      return { ok: true, status: antwort.status, data, fehler: "" };
    } catch (error) {
      return { ok: false, status: 0, data: {}, fehler: "Keine Verbindung: " + String(error && error.message || error) };
    }
  }

  // Aus einem Fehlercode wird ein Satz, den ein Mensch versteht.
  function fehlertext(status, data) {
    const code = data && data.error ? String(data.error) : "";
    const bekannt = {
      admin_authentication_required: "Nicht angemeldet. Bitte auf smejj.com anmelden.",
      admin_role_required: "Dieses Konto hat keine Verwaltungsrolle.",
      admin_account_not_active: "Das Konto ist gesperrt.",
      admin_permission_denied: "Diese Rolle darf das nicht.",
      admin_second_approval_required: "Dafuer ist eine zweite Freigabe noetig (Vier-Augen-Prinzip).",
      admin_subject_consent_required: "Dafuer ist die Einwilligung der betroffenen Person noetig.",
      admin_reason_required: "Ohne Grund keine Einsicht — der Zugriff wird protokolliert.",
      admin_directory_unavailable: "Das Nutzerverzeichnis ist nicht erreichbar.",
      admin_audit_unavailable: "Der Nachweis liess sich nicht schreiben, deshalb keine Ausgabe.",
      admin_rate_limit: "Zu viele Anfragen. Bitte kurz warten.",
      admin_user_not_found: "Dieses Konto gibt es nicht.",
      admin_no_change: "Das ist bereits so — nichts zu tun.",
      admin_action_unknown: "Diese Aktion gibt es nicht.",
      admin_self_block_forbidden: "Du kannst dich nicht selbst sperren.",
      admin_self_delete_forbidden: "Du kannst dich nicht selbst loeschen.",
      admin_self_demote_forbidden: "Du kannst dir nicht selbst die Rechte nehmen.",
      admin_last_owner_protected: "Das ist der letzte Owner — sonst sperrt sich die Organisation aus.",
      admin_role_invalid: "Diese Rolle gibt es nicht.",
      admin_approval_required: "Dafuer fehlt die Freigabe der zweiten Person.",
      approval_self_approval_forbidden: "Wer beantragt, darf nicht selbst freigeben. Das ist der Sinn der Sache.",
      approval_expired: "Der Antrag ist abgelaufen (24 Stunden).",
      approval_already_decided: "Ueber diesen Antrag wurde bereits entschieden.",
      approval_already_executed: "Dieser Antrag wurde bereits ausgefuehrt.",
      approval_not_approved: "Dieser Antrag ist noch nicht freigegeben.",
      impersonation_consent_wrong_person: "Nur die betroffene Person selbst kann einwilligen.",
      impersonation_consent_belongs_to_subject: "Die Einwilligung gibt die betroffene Person in ihrem eigenen Konto.",
      impersonation_expired: "Die Anfrage ist verfallen.",
      impersonation_end_not_allowed: "Nur die Beteiligten koennen den Vorgang beenden.",
      impersonation_break_glass_reason_too_short: "Break-Glass verlangt eine ausfuehrliche Begruendung (mind. 20 Zeichen).",
      index_not_built: "Der Nutzer-Index wurde noch nie gebaut.",
      index_requires_object_storage: "Ohne Objektspeicher gibt es keinen Index.",
      audit_list_failed: "Das Audit-Log liess sich nicht lesen."
    };
    if (bekannt[code]) return bekannt[code];
    if (code) return code;
    return "Unerwarteter Fehler (HTTP " + status + ").";
  }

  function zeit(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    const p = (n) => String(n).padStart(2, "0");
    return p(d.getDate()) + "." + p(d.getMonth() + 1) + "." + d.getFullYear()
      + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  function dauer(sekunden) {
    const s = Number(sekunden);
    if (!isFinite(s) || s < 0) return "—";
    if (s < 60) return Math.round(s) + " s";
    if (s < 3600) return Math.round(s / 60) + " Min";
    if (s < 86400) return Math.round(s / 3600) + " h";
    return Math.round(s / 86400) + " T";
  }

  window.adminApi = {
    hole: hole,
    sende: sende,
    escapeHtml: escapeHtml,
    zeit: zeit,
    dauer: dauer,
    ich: function () { return hole("/api/admin/me"); },
    nutzer: function (parameter) { return hole("/api/admin/users?" + new URLSearchParams(parameter || {}).toString()); },
    akte: function (id, grund) {
      return hole("/api/admin/users/" + encodeURIComponent(id) + "?reason=" + encodeURIComponent(grund));
    },
    audit: function (parameter) { return hole("/api/admin/audit?" + new URLSearchParams(parameter || {}).toString()); },
    neubau: function (grund) { return sende("/api/admin/users/index/rebuild", { reason: grund }); },
    compliance: function () { return hole("/api/compliance/ai-systems"); },

    // ---- Stufe 3: schreibende Aktionen ----
    aktion: function (id, name, koerper) {
      return sende("/api/admin/users/" + encodeURIComponent(id) + "/actions/" + name, koerper);
    },
    freigaben: function () { return sende("/api/admin/approvals", {}); },
    freigeben: function (id) { return sende("/api/admin/approvals/" + encodeURIComponent(id) + "/approve", {}); },
    ablehnen: function (id, grund) {
      return sende("/api/admin/approvals/" + encodeURIComponent(id) + "/reject", { reason: grund });
    },
    impersonationBeantragen: function (koerper) { return sende("/api/admin/impersonation/request", koerper); },
    impersonationListe: function () { return sende("/api/admin/impersonation/list", {}); },
    impersonationBeenden: function (id) {
      return sende("/api/admin/impersonation/" + encodeURIComponent(id) + "/end", {});
    },
    eigeneVorgaenge: function () { return hole("/api/account/impersonation"); },
    einwilligen: function (id) { return sende("/api/account/impersonation/" + encodeURIComponent(id) + "/consent", {}); },
    einwilligungAblehnen: function (id) { return sende("/api/account/impersonation/" + encodeURIComponent(id) + "/deny", {}); }
  };
})();
