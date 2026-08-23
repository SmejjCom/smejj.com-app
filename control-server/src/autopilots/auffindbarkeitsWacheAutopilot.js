// smejj.com — Auffindbarkeits-Wache (Autopilot Nr. 57): prüft täglich die
// AUSGELIEFERTE Startseite auf die handwerklichen Grundlagen, an denen
// Suchmaschinen hängen — Titel, Beschreibung, Sprache, Index-Freigabe.
//
// Kein Ranking-Orakel: ob Google smejj.com mag, misst niemand von hier. Was
// messbar IST: ob die Seite die Pflichtangaben trägt und nicht versehentlich
// "noindex" sagt. Genau solche Regressionen passieren bei Umbauten still —
// dieselbe Klasse Fehler wie die 32 abgesenkten Touch-Ziele.
//
// Gemessen wird gegen https://smejj.com — was der Nutzer (und der Crawler)
// wirklich bekommt, samt Bündel und Service-Worker-Auslieferung.

/**
 * Prüft eine HTML-Quelle auf SEO-Pflichtangaben. Getrennt testbar.
 * @returns {{maengel: string[], geprueft: number}}
 */
export function pruefeSeitenQuelle(html = "") {
  const quelle = String(html || "");
  const maengel = [];
  const titel = quelle.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (!titel || !titel[1].trim()) maengel.push("kein <title>");
  else if (titel[1].trim().length < 10) maengel.push(`<title> zu kurz ("${titel[1].trim()}")`);
  if (!/<meta[^>]+name=["']description["'][^>]+content=["'][^"']{20,}/i.test(quelle)
    && !/<meta[^>]+content=["'][^"']{20,}["'][^>]+name=["']description["']/i.test(quelle)) {
    maengel.push("keine Meta-Beschreibung (mind. 20 Zeichen)");
  }
  if (/<meta[^>]+name=["']robots["'][^>]+noindex/i.test(quelle)) maengel.push("Seite sagt NOINDEX — für Suchmaschinen unsichtbar");
  if (!/<html[^>]+lang=/i.test(quelle)) maengel.push("kein lang-Attribut am <html>");
  if (!/<h1[\s>]/i.test(quelle)) maengel.push("keine <h1>-Überschrift");
  if (!/<meta[^>]+property=["']og:title["']/i.test(quelle)) maengel.push("kein og:title (Teilen-Vorschau)");
  return { maengel, geprueft: 6 };
}

/** Selbsttest: kaputte Quelle MUSS auffallen, gesunde nicht. */
export function fuehreSelbsttestAus() {
  const fehler = [];
  const kaputt = pruefeSeitenQuelle("<html><head><meta name=\"robots\" content=\"noindex\"></head><body>leer</body></html>");
  if (kaputt.maengel.length < 5) fehler.push(`kaputte Quelle: nur ${kaputt.maengel.length}/5+ Mängel erkannt`);
  const gesund = pruefeSeitenQuelle(
    "<html lang=\"de\"><head><title>smejj — dein KI-Begleiter</title>"
    + "<meta name=\"description\" content=\"Chat, Bilder, Recherche und mehr — alles an einem Ort.\">"
    + "<meta property=\"og:title\" content=\"smejj\"></head><body><h1>smejj</h1></body></html>"
  );
  if (gesund.maengel.length !== 0) fehler.push(`gesunde Quelle löst ${gesund.maengel.length} Fehlalarm(e) aus: ${gesund.maengel.join(", ")}`);
  return { bestanden: fehler.length === 0, fehler };
}

/**
 * Der Lauf im Takt: Selbsttest, dann die echte Startseite und robots.txt.
 */
export async function laufAuffindbarkeitsWache({ mitNetz = true, env = process.env, fetchImpl = fetch } = {}) {
  const probe = fuehreSelbsttestAus();
  if (!probe.bestanden) {
    return { ok: false, meldung: `Auffindbarkeits-Wache beurteilt bekannte Fälle falsch: ${probe.fehler.join("; ")}` };
  }
  if (!mitNetz) {
    return { ok: true, meldung: "Netz-Takt abgewartet — Startseite wird im nächsten Lauf gemessen" };
  }
  const basis = String(env.SMEJJ_SEITE_URL || "https://smejj.com").replace(/\/+$/, "");
  let html;
  try {
    const antwort = await fetchImpl(`${basis}/`, { signal: AbortSignal.timeout(15_000), headers: { "User-Agent": "smejj-auffindbarkeits-wache" } });
    if (!antwort.ok) return { ok: false, meldung: `Startseite antwortet HTTP ${antwort.status} — für Crawler wie für Menschen kaputt` };
    html = await antwort.text();
  } catch (f) {
    return { ok: false, meldung: `Startseite nicht erreichbar: ${String(f?.message || f).slice(0, 60)}` };
  }
  const ergebnis = pruefeSeitenQuelle(html);

  let robotsHinweis = "";
  try {
    const robots = await fetchImpl(`${basis}/robots.txt`, { signal: AbortSignal.timeout(10_000) });
    if (!robots.ok) robotsHinweis = "robots.txt fehlt";
    else if (/^\s*Disallow:\s*\/\s*$/mi.test(await robots.text())) ergebnis.maengel.push("robots.txt sperrt ALLES (Disallow: /)");
  } catch { robotsHinweis = "robots.txt nicht abrufbar"; }

  if (ergebnis.maengel.length) {
    return { ok: false, meldung: `${ergebnis.maengel.length} Auffindbarkeits-Mangel/Mängel an der Startseite: ${ergebnis.maengel.join("; ").slice(0, 150)}` };
  }
  return { ok: true, meldung: `Selbsttest 2/2; Startseite trägt alle 6 Pflichtangaben${robotsHinweis ? ` — Hinweis: ${robotsHinweis}` : ", robots.txt in Ordnung"}` };
}
