// smejj.com — Türwächter: prüft, ob ein Mensch noch hereinkommt.
//
// WARUM ES DIESE DATEI GIBT (2026-08-14): An einem Tag standen zwei stille
// Aussperrungen nebeneinander, beide vom Betreiber per Screenshot gemeldet,
// beide wochenlang unbemerkt:
//
//   1. Der Adminbereich antwortete jedem Google-Konto dauerhaft mit
//      `admin_email_not_verified`. Der Anmeldeweg legte nie einen
//      Kontodatensatz an, also konnte kein Bestätigungscode je haften.
//   2. Der Chat antwortete "Bitte auf smejj.com anmelden", während die
//      Oberfläche den Nutzer als angemeldet zeigte.
//
// Beide Male war JEDER bestehende Autopilot grün. Zu Recht: Sie messen
// Dienste — läuft der Server, antwortet die KI, ist der Speicher erreichbar.
// All das stimmte. Es kam nur niemand mehr herein.
//
// DIE LÜCKE: Ein Wächter, der nie durch die Tür geht, merkt nicht, dass sie
// klemmt. Dieser Autopilot geht durch — er prüft die Kette, die ein Mensch
// durchläuft, und schlägt an, wenn eine Stufe ihn abweist.
//
// BEWUSST DETERMINISTISCH und ohne Modell: Jede Stufe ist eine nachprüfbare
// Aussage über eine HTTP-Antwort. Eine Regel lügt nie und kostet nichts.
//
// GRUNDSATZ — der Unterschied zwischen "zu" und "gestört":
// Ein Netzfehler oder eine 503 heisst NICHT "ausgesperrt", sondern "unklar".
// Nur eine eindeutige Abweisung (401/403 mit bekanntem Grund) zählt als
// Aussperrung. Sonst weckt der Wächter den Betreiber wegen jeder Störung —
// und wird nach der dritten Fehlmeldung ignoriert. Genau daran ist die
// Ampel-Ehrlichkeit schon einmal gescheitert.

/** Gründe, die eine echte Aussperrung belegen (nicht bloss eine Störung). */
const AUSSPERR_GRUENDE = Object.freeze({
  admin_email_not_verified: "Adminbereich: Adresse gilt als unbestätigt — meist fehlt der Kontodatensatz",
  admin_role_required: "Adminbereich: Rolle fehlt",
  admin_account_not_active: "Adminbereich: Konto ist nicht aktiv",
  authentication_required: "Chat: Token wird abgelehnt",
  email_not_verified: "Anmeldung: Adresse gilt als unbestätigt"
});

/** Gründe, die eine STÖRUNG anzeigen — nie Alarm, aber sichtbar. */
const STOERUNGS_GRUENDE = Object.freeze([
  "admin_directory_unavailable",
  "billing_status_unavailable"
]);

/**
 * Bewertet EINE Antwort der Kette.
 * @param {{stufe: string, status: number, koerper?: any, netzfehler?: string}} antwort
 * @returns {{stufe: string, urteil: "offen"|"zu"|"gestoert", grund?: string, hinweis?: string}}
 */
export function bewerteStufe(antwort) {
  const stufe = String(antwort?.stufe || "unbekannt");
  if (antwort?.netzfehler) {
    return { stufe, urteil: "gestoert", grund: "netzfehler", hinweis: String(antwort.netzfehler).slice(0, 120) };
  }
  const status = Number(antwort?.status || 0);
  const code = String(antwort?.koerper?.error || "");

  if (STOERUNGS_GRUENDE.includes(code) || status === 503 || status === 429) {
    return { stufe, urteil: "gestoert", grund: code || `status_${status}` };
  }
  if (status >= 200 && status < 300) return { stufe, urteil: "offen" };
  if (status === 401 || status === 403) {
    return {
      stufe,
      urteil: "zu",
      grund: code || `status_${status}`,
      hinweis: AUSSPERR_GRUENDE[code] || "Zugang abgewiesen"
    };
  }
  // Alles andere (404, 500 …) ist eine Störung des Dienstes, keine Aussperrung.
  return { stufe, urteil: "gestoert", grund: code || `status_${status}` };
}

/**
 * Fasst die Stufen zu einem Gesamturteil zusammen.
 * Alarm NUR bei mindestens einer eindeutig geschlossenen Tür.
 */
export function fasseZusammen(stufen) {
  const liste = Array.isArray(stufen) ? stufen : [];
  const zu = liste.filter((s) => s.urteil === "zu");
  const gestoert = liste.filter((s) => s.urteil === "gestoert");
  return {
    alarm: zu.length > 0,
    ausgesperrt: zu.map((s) => ({ stufe: s.stufe, grund: s.grund, hinweis: s.hinweis })),
    gestoert: gestoert.map((s) => ({ stufe: s.stufe, grund: s.grund })),
    offen: liste.filter((s) => s.urteil === "offen").map((s) => s.stufe),
    // Sprechender Satz für Ampel und Melder — nennt IMMER die Stufe.
    text: zu.length
      ? `AUSGESPERRT: ${zu.map((s) => `${s.stufe} (${s.grund})`).join(", ")}`
      : gestoert.length
        ? `unklar — ${gestoert.map((s) => `${s.stufe} (${s.grund})`).join(", ")}`
        : liste.length ? "alle Türen offen" : "nichts geprüft"
  };
}

/**
 * Läuft die Kette ab, die ein Mensch durchläuft.
 *
 * Es wird KEIN echtes Passwort verwendet und kein Konto angelegt: geprüft wird
 * mit einem Messtoken (derselbe Weg wie die übrigen Livemessungen). Fehlt es,
 * meldet der Autopilot "nicht messbar" — und behauptet nicht, alles sei gut.
 */
export async function pruefeTueren({ controlOrigin, token, fetchFn = fetch, zeitlimitMs = 15000 } = {}) {
  const basis = String(controlOrigin || "").replace(/\/+$/, "");
  if (!basis) return { messbar: false, grund: "kein_control_origin", ...fasseZusammen([]) };
  if (!token) return { messbar: false, grund: "kein_messtoken", ...fasseZusammen([]) };

  const stufen = [
    { stufe: "sitzung", pfad: "/api/auth/me" },
    { stufe: "adminbereich", pfad: "/api/admin/me" },
    { stufe: "abo-sicht", pfad: "/api/admin/geld/abos" }
  ];

  const ergebnisse = [];
  for (const s of stufen) {
    try {
      const antwort = await fetchFn(`${basis}${s.pfad}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(zeitlimitMs)
      });
      const koerper = await antwort.json().catch(() => ({}));
      ergebnisse.push(bewerteStufe({ stufe: s.stufe, status: antwort.status, koerper }));
    } catch (fehler) {
      ergebnisse.push(bewerteStufe({ stufe: s.stufe, netzfehler: String(fehler?.message || fehler) }));
    }
  }
  return { messbar: true, stufen: ergebnisse, ...fasseZusammen(ergebnisse) };
}

// --- Selbsttests: kaputte UND gesunde Probe je Klasse -------------------------
const SELBSTTEST_FAELLE = Object.freeze([
  {
    quelle: "selbsttest:admin-aussperrung",
    antwort: { stufe: "adminbereich", status: 403, koerper: { error: "admin_email_not_verified" } },
    erwartet: "zu"
  },
  {
    quelle: "selbsttest:chat-aussperrung",
    antwort: { stufe: "sitzung", status: 401, koerper: { error: "authentication_required" } },
    erwartet: "zu"
  },
  {
    quelle: "selbsttest:speicherstoerung-ist-keine-aussperrung",
    antwort: { stufe: "adminbereich", status: 503, koerper: { error: "admin_directory_unavailable" } },
    erwartet: "gestoert"
  },
  {
    quelle: "selbsttest:netzfehler-ist-keine-aussperrung",
    antwort: { stufe: "sitzung", netzfehler: "fetch failed" },
    erwartet: "gestoert"
  },
  {
    quelle: "selbsttest:gesund",
    antwort: { stufe: "sitzung", status: 200, koerper: { ok: true } },
    erwartet: "offen"
  }
]);

/** Führt die Selbsttest-Fälle aus. @returns {{bestanden: boolean, fehler: string[]}} */
export function fuehreSelbsttestAus() {
  const fehler = [];
  for (const fall of SELBSTTEST_FAELLE) {
    const urteil = bewerteStufe(fall.antwort).urteil;
    if (urteil !== fall.erwartet) fehler.push(`${fall.quelle}: erwartet "${fall.erwartet}", bekam "${urteil}"`);
  }
  // Die Zusammenfassung muss bei reiner Störung SCHWEIGEN — sonst wird der
  // Wächter nach der dritten Fehlmeldung ignoriert.
  const nurStoerung = fasseZusammen([{ stufe: "sitzung", urteil: "gestoert", grund: "netzfehler" }]);
  if (nurStoerung.alarm) fehler.push("Zusammenfassung: Störung darf keinen Alarm ausloesen");
  const mitAussperrung = fasseZusammen([{ stufe: "adminbereich", urteil: "zu", grund: "admin_email_not_verified" }]);
  if (!mitAussperrung.alarm) fehler.push("Zusammenfassung: Aussperrung MUSS Alarm ausloesen");
  return { bestanden: fehler.length === 0, fehler };
}
