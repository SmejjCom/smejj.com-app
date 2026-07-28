// smejj.com Operations Console — die Ansichten.
//
// Jede Ansicht ist eine reine Funktion (Daten -> HTML-Zeichenkette). Kein
// Zustand, kein Netzzugriff: das Laden macht console.js, das Zeichnen hier.
// Damit sind die Ansichten einzeln pruefbar und bleiben unter 800 Zeilen.
//
// Keine style="..."-Attribute: die CSP des eigenen Servers verbietet
// Inline-Stile. Balkenbreiten setzt console.js ueber die CSSOM-Schnittstelle.
(function () {
  "use strict";
  const A = window.adminApi;
  const e = A.escapeHtml;

  function kachel(titel, wert, unterzeile, ton) {
    return '<div class="kpi glass"><div class="k">' + e(titel) + '</div>'
      + '<div class="v">' + e(wert) + '</div>'
      + '<div class="d ' + (ton || "") + '">' + e(unterzeile || "") + '</div></div>';
  }

  function pille(text, ton) {
    return '<span class="pill ' + (ton || "") + '">' + e(text) + '</span>';
  }

  function kopf(buchstabe, oberzeile, titel, text) {
    return '<div class="head"><div class="eyebrow"><span class="kbd">' + e(buchstabe) + '</span>'
      + e(oberzeile) + '</div><h1>' + e(titel) + '</h1><p>' + e(text) + '</p></div>';
  }

  function panel(titel, unter, inhalt, werkzeuge) {
    return '<section class="panel glass"><div class="ph"><h3>' + e(titel) + '</h3>'
      + (unter ? '<span class="sub">' + e(unter) + '</span>' : "")
      + '<span class="spacer"></span>' + (werkzeuge || "")
      + '</div>' + inhalt + '</section>';
  }

  function tabelle(spalten, zeilen) {
    if (!zeilen.length) return '<div class="pb flush"><div class="leer">Nichts vorhanden.</div></div>';
    return '<div class="pb flush"><table><thead><tr>'
      + spalten.map((s) => "<th>" + e(s) + "</th>").join("")
      + '</tr></thead><tbody>' + zeilen.join("") + '</tbody></table></div>';
  }

  function fehlerblock(text) {
    return '<div class="note glass fehler"><div class="nx">▲</div><div>'
      + '<div class="nt">Das hat nicht geklappt</div>'
      + '<div class="ns">' + e(text) + '</div></div></div>';
  }

  // ---- A · Übersicht ---------------------------------------------------------

  function uebersicht(d) {
    const index = d.nutzer && d.nutzer.index ? d.nutzer.index : {};
    const kette = d.audit && d.audit.chain ? d.audit.chain : {};
    const systeme = (d.compliance && d.compliance.systeme) || [];
    const pflichtig = systeme.filter((s) => s.transparenzpflicht).length;

    const kacheln = '<div class="kpis">'
      + kachel("Konten", index.count == null ? "—" : String(index.count),
        index.unreadable ? index.unreadable + " unlesbar" : "alle lesbar", index.unreadable ? "wr" : "up")
      + kachel("Index-Alter", A.dauer(index.ageSeconds),
        index.refreshing ? "wird gerade aufgefrischt" : "aktuell", index.refreshing ? "wr" : "up")
      + kachel("Audit-Eintraege", d.audit && d.audit.total != null ? String(d.audit.total) : "—",
        "Zeitraum " + e((d.audit && d.audit.window) || "—"))
      + kachel("Nachweiskette", kette.ok ? "intakt" : "gebrochen",
        kette.ok ? "lueckenlos geprueft" : String(kette.reason || ""), kette.ok ? "up" : "dn")
      + kachel("KI-Systeme", String(systeme.length),
        pflichtig + " mit Transparenzpflicht")
      + '</div>';

    const dienste = tabelle(["Bereich", "Stand", "Anmerkung"], [
      '<tr><td><b>Nutzer-Index</b></td><td>' + (index.count == null ? pille("nicht gebaut", "bad") : pille("bereit", "ok"))
        + '</td><td>' + e(index.builtAt ? "gebaut " + A.zeit(index.builtAt) : "—") + '</td></tr>',
      '<tr><td><b>Audit-Log</b></td><td>' + (kette.ok ? pille("unveraendert", "ok") : pille("pruefen", "bad"))
        + '</td><td>' + e(kette.ok ? "Hash-Kette lueckenlos" : String(kette.reason || "")) + '</td></tr>',
      '<tr><td><b>EU AI Act</b></td><td>' + (d.compliance && d.compliance.hochrisiko === false
        ? pille("kein Hochrisiko", "ok") : pille("unbekannt", "warn"))
        + '</td><td>' + e(d.compliance ? "Durchsetzung ab " + (d.compliance.rechtsrahmen || {}).durchsetzungAb : "—") + '</td></tr>',
      '<tr><td><b>Schreibende Aktionen</b></td><td>' + pille("gesperrt", "acc")
        + '</td><td>Stufe 2 ist bewusst rein lesend</td></tr>'
    ]);

    return kopf("A", "Cockpit", "Übersicht",
      "Der Betriebszustand auf einen Blick. Alle Zahlen kommen live aus der eigenen API — nichts ist hier fest verdrahtet.")
      + kacheln + '<div class="stack">' + panel("Zustand", "live abgefragt", dienste) + '</div>';
  }

  // ---- B · Nutzer -------------------------------------------------------------

  function nutzer(d) {
    const index = d.index || {};
    const eintraege = d.entries || [];
    const zeilen = eintraege.map((n) =>
      '<tr class="klickbar" data-akte="' + e(n.userId) + '">'
      + '<td><b>' + e(n.name || "—") + '</b><br><span class="mono">' + e(n.email) + '</span></td>'
      + '<td><span class="mono">' + e(n.userId) + '</span></td>'
      + '<td>' + (n.role === "user" ? '<span class="pill">user</span>' : pille(n.role, "acc")) + '</td>'
      + '<td>' + (n.status === "active" ? pille("aktiv", "ok") : pille(n.status, "bad")) + '</td>'
      + '<td>' + (n.emailVerified ? pille("ja", "ok") : pille("nein", "warn")) + '</td>'
      + '<td>' + e(String(n.activeSessions)) + '</td>'
      + '<td>' + e(A.zeit(n.createdAt)) + '</td>'
      + '<td><span class="act">Akte öffnen</span></td></tr>');

    const werkzeuge = '<span class="btn" id="neubauKnopf">Index neu bauen</span>';
    const suche = '<div class="bar"><input class="suche-feld" id="sucheFeld" type="search" '
      + 'placeholder="Name, E-Mail oder Konto-ID …" value="' + e(d.suchbegriff || "") + '">'
      + '<span class="btn" id="sucheKnopf">Suchen</span>'
      + (d.suchbegriff ? '<span class="btn" id="sucheLeeren">Zurücksetzen</span>' : "") + '</div>';

    const stand = "Index " + A.dauer(index.ageSeconds) + " alt"
      + (index.refreshing ? " · wird aufgefrischt" : "")
      + (index.unreadable ? " · " + index.unreadable + " unlesbar" : "");

    return kopf("B", "Nutzer", "Nutzerverwaltung",
      "Suchen und blättern. Die Liste zeigt nur Metadaten — der Blick in eine Akte verlangt einen Grund und wird protokolliert.")
      + suche
      + '<div class="stack">' + panel(
        "Konten", (d.total || 0) + " Treffer · " + stand,
        tabelle(["Nutzer", "Konto-ID", "Rolle", "Status", "Verifiziert", "Sitzungen", "Registriert", ""], zeilen),
        werkzeuge) + '</div>';
  }

  // ---- B2 · Nutzerakte --------------------------------------------------------

  function akte(d) {
    const u = d.user || {};
    const sitzungen = (u.sessions || []).map((s) =>
      '<tr><td><b>' + e(s.device) + '</b></td>'
      + '<td><span class="mono">' + e(s.sidHint) + '…</span></td>'
      + '<td>' + e(A.zeit(s.lastSeenAt)) + '</td>'
      + '<td>' + e(A.zeit(s.expiresAt)) + '</td>'
      + '<td>' + (s.active ? pille("aktiv", "ok") : pille("beendet", "dim")) + '</td></tr>');

    const stamm = tabelle(["Merkmal", "Wert"], [
      '<tr><td><b>Name</b></td><td>' + e(u.name || "—") + '</td></tr>',
      '<tr><td><b>E-Mail</b></td><td><span class="mono">' + e(u.email) + '</span></td></tr>',
      '<tr><td><b>Konto-ID</b></td><td><span class="mono">' + e(u.userId) + '</span></td></tr>',
      '<tr><td><b>Anmeldeweg</b></td><td>' + e(u.method) + '</td></tr>',
      '<tr><td><b>Rolle</b></td><td>' + (u.role === "user" ? "user" : pille(u.role, "acc")) + '</td></tr>',
      '<tr><td><b>Status</b></td><td>' + (u.status === "active" ? pille("aktiv", "ok") : pille(u.status, "bad")) + '</td></tr>',
      '<tr><td><b>E-Mail bestätigt</b></td><td>' + e(u.emailVerifiedAt ? A.zeit(u.emailVerifiedAt) : "nein") + '</td></tr>',
      '<tr><td><b>Registriert</b></td><td>' + e(A.zeit(u.createdAt)) + '</td></tr>',
      '<tr><td><b>Zuletzt geändert</b></td><td>' + e(A.zeit(u.updatedAt)) + '</td></tr>',
      '<tr><td><b>Fehlversuche</b></td><td>' + e(String((u.loginGuard || {}).failedCount || 0))
        + ((u.loginGuard || {}).lockedUntil ? " · " + pille("gesperrt bis " + A.zeit(u.loginGuard.lockedUntil), "bad") : "") + '</td></tr>',
      '<tr><td><b>Offene Verifikation</b></td><td>' + (u.hasPendingVerification ? pille("ja", "warn") : "nein") + '</td></tr>',
      '<tr><td><b>Offener Reset</b></td><td>' + (u.hasPendingReset ? pille("ja", "warn") : "nein") + '</td></tr>'
    ]);

    const nachweis = '<div class="note glass"><div class="nx">§</div><div>'
      + '<div class="nt">Dieser Zugriff wurde protokolliert</div>'
      + '<div class="ns">Grund: „' + e(d.grund) + '“ — als <span class="mono">user.record.read</span> '
      + 'unveränderlich im Audit-Log. Passwort-Hash, Token und vollständige Sitzungs-IDs werden gar nicht erst übertragen.'
      + '</div></div></div>';

    return kopf("B", "Nutzerakte", u.name || u.email || "Akte",
      "Einsicht in ein einzelnes Konto. Nur die Felder, die der Adminbereich sehen darf.")
      + '<div class="bar"><span class="btn zurueck" id="zurueckKnopf">← Zurück zur Liste</span></div>'
      + '<div class="stack">' + nachweis
      + panel("Stammdaten", u.userId || "", stamm)
      + panel("Sitzungen", (u.sessions || []).length + " insgesamt",
        tabelle(["Gerät", "Sitzung", "Zuletzt", "Läuft ab", "Stand"], sitzungen))
      + '</div>';
  }

  // ---- O · Audit --------------------------------------------------------------

  function audit(d) {
    const kette = d.chain || {};
    const zeilen = (d.entries || []).map((eintrag) =>
      '<tr><td><span class="mono">' + e(A.zeit(eintrag.at)) + '</span></td>'
      + '<td><b>' + e(eintrag.actorEmail) + '</b><br>' + pille(eintrag.actorRole, "acc")
      + (eintrag.actorRoleSource === "bootstrap" ? " " + pille("bootstrap", "warn") : "") + '</td>'
      + '<td><span class="mono">' + e(eintrag.action) + '</span></td>'
      + '<td><span class="mono">' + e(eintrag.target) + '</span></td>'
      + '<td>' + e(eintrag.reason) + '</td>'
      + '<td><span class="mono">' + e(eintrag.ip) + '</span></td></tr>');

    const kettenblock = kette.ok
      ? '<div class="note glass"><div class="nx">⛓</div><div><div class="nt">Kette lückenlos</div>'
        + '<div class="ns">Jeder Eintrag trägt die Prüfsumme seines Vorgängers. Es fehlt keiner, '
        + 'und keiner wurde nachträglich verändert.</div></div></div>'
      : '<div class="note glass fehler"><div class="nx">▲</div><div><div class="nt">Kette gebrochen</div>'
        + '<div class="ns">Grund: ' + e(kette.reason) + ' bei Eintrag ' + e(String(kette.brokenAt))
        + '. Das ist ein ernster Befund — bitte sofort prüfen.</div></div></div>';

    const zeitraum = '<div class="bar zeitraum">'
      + '<span>Zeitraum</span>'
      + '<input type="date" id="von" value="' + e(d.von || "") + '">'
      + '<span>bis</span>'
      + '<input type="date" id="bis" value="' + e(d.bis || "") + '">'
      + '<span class="btn" id="zeitraumKnopf">Anwenden</span>'
      + (d.von || d.bis ? '<span class="btn" id="zeitraumLeeren">Zurücksetzen</span>' : "")
      + '</div>';

    const umfang = d.window === "all" ? "gesamtes Log"
      : d.window === "2m" ? "laufender und voriger Monat"
        : d.window === "memory" ? "Arbeitsspeicher" : "gewählter Zeitraum (" + e(d.window || "—") + ")";

    return kopf("O", "Audit", "Audit-Log",
      "Jede schreibende Aktion und jede Akteneinsicht. Anfügend, unveränderlich — auch für den Owner.")
      + zeitraum
      + '<div class="stack">' + kettenblock
      + panel("Einträge", (d.total || 0) + " im Umfang: " + umfang,
        tabelle(["Zeit", "Wer", "Aktion", "Ziel", "Grund", "Herkunft"], zeilen))
      + '</div>';
  }

  // ---- C · Rollen -------------------------------------------------------------

  function rollen(d) {
    const rechte = d.permissions || {};
    const namen = { allow: ["darf", "ok"], dual: ["Vier-Augen", "warn"], consent: ["mit Einwilligung", "warn"], deny: ["nein", "bad"] };
    const zeilen = Object.keys(rechte).map((schluessel) => {
      const stufe = namen[rechte[schluessel]] || ["—", ""];
      return '<tr><td><b>' + e(schluessel) + '</b></td><td>' + pille(stufe[0], stufe[1]) + '</td></tr>';
    });

    const hinweis = '<div class="note glass"><div class="nx">⚿</div><div>'
      + '<div class="nt">Serverseitig durchgesetzt, nicht im Browser</div>'
      + '<div class="ns">Diese Liste zeigt nur, was der Server ohnehin erzwingt. Die Rolle wird bei '
      + 'jeder Anfrage frisch aus dem Nutzer-Store gelesen — nie aus dem Sitzungs-Token.'
      + (d.actor && d.actor.roleSource === "bootstrap"
        ? ' Diese Rolle stammt aus <span class="mono">SMEJJ_ADMIN_OWNER_EMAILS</span>, nicht aus dem Konto.'
        : "")
      + '</div></div></div>';

    return kopf("C", "Rollen", "Deine Rechte",
      "Was dein Konto in dieser Konsole darf — und was zusätzlich eine zweite Freigabe oder eine Einwilligung braucht.")
      + '<div class="stack">' + hinweis
      + panel("Berechtigungen", "Rolle: " + ((d.actor || {}).role || "—"),
        tabelle(["Berechtigung", "Stufe"], zeilen)) + '</div>';
  }

  // ---- N · EU AI Act ----------------------------------------------------------

  function compliance(d) {
    const systeme = d.systeme || [];
    const zeilen = systeme.map((s) =>
      '<tr><td><b>' + e(s.id) + '</b></td>'
      + '<td>' + e(s.zweck) + '</td>'
      + '<td>' + e(s.anbieter) + '</td>'
      + '<td>' + (s.risiko === "minimal" ? pille("minimal", "dim") : pille("begrenzt", "acc")) + '</td>'
      + '<td>' + (s.transparenzpflicht
        ? pille(s.verschaerft ? "verschärft" : "vorhanden", s.verschaerft ? "warn" : "ok")
        : pille("nicht nötig", "dim")) + '</td>'
      + '<td>' + (s.protokolliert ? pille("aktiv", "ok") : pille("—", "dim")) + '</td></tr>');

    const rahmen = d.rechtsrahmen || {};
    const kacheln = '<div class="kpis">'
      + kachel("Durchsetzung ab", String(rahmen.durchsetzungAb || "—"), rahmen.name || "")
      + kachel("Hochrisiko", d.hochrisiko === false ? "nein" : "unbekannt",
        d.hochrisiko === false ? "kein Fall aus Anhang III" : "", d.hochrisiko === false ? "up" : "wr")
      + kachel("Erfasste Systeme", String(systeme.length),
        systeme.filter((s) => s.transparenzpflicht).length + " mit Transparenzpflicht")
      + '</div>';

    const hinweise = d.hinweise || {};
    const texte = '<div class="pb"><div class="field"><label>Allgemeiner Hinweis</label>'
      + '<div class="in">' + e(hinweise.allgemein || "") + '</div></div>'
      + '<div class="field"><label>Maus-Engine (verschärft)</label>'
      + '<div class="in">' + e(hinweise.mausEngine || "") + '</div>'
      + '<div class="hint">Dieser Text geht mit jeder Antwort der Maus-Engine mit — im Feld '
      + '<span class="mono">transparenzhinweis</span> und als Kopfzeile '
      + '<span class="mono">x-smejj-ai-notice</span>.</div></div></div>';

    return kopf("N", "KI-Nachweise", "EU AI Act",
      "Bestandsverzeichnis, Einstufung und die Hinweistexte — live aus dem öffentlichen Transparenzbericht.")
      + kacheln
      + '<div class="stack">'
      + panel("Eingesetzte KI-Systeme", "Stand " + e(A.zeit(d.stand)),
        tabelle(["System", "Zweck", "Anbieter", "Risiko", "Transparenz", "Protokoll"], zeilen))
      + panel("Hinweistexte", "maschinenlesbar ausgeliefert", texte)
      + panel("Belege", "aufbewahrungspflichtig, 10 Jahre",
        tabelle(["Dokument"], (d.dokumentation || []).map((doc) =>
          '<tr><td><span class="mono">' + e(doc) + '</span></td></tr>')))
      + '</div>';
  }

  window.adminViews = {
    uebersicht: uebersicht,
    nutzer: nutzer,
    akte: akte,
    audit: audit,
    rollen: rollen,
    compliance: compliance,
    fehlerblock: fehlerblock
  };
})();
