// smejj.com — Schutz gegen die MAUS-IMITATION des Chat-Modells.
//
// BEFUND (Betreiber-Chat 2026-09-06, 06:23Z, Gmail-Registrierung): Die Maus
// lief einen Auftrag, schrieb "Maus 1/10: ..."-Zeilen in den Chat und endete.
// Danach fragte der Nutzer nach ("Name: AlanBestT", "Log warum schreibst du
// nicht?"). Diese Nachfragen gehen an das NORMALE Chat-Modell — und das sah im
// Verlauf die Maus-Zeilen, hielt sich fuer die Maus und ERFAND weitere
// "Maus 4/10: Eingeben ..."-Zeilen, ein Protokoll und spaeter Knoepfe
// ("Aktion starten", gelbe Markierung), die es nicht gibt. Der Nutzer glaubte,
// die Maus arbeite noch. Nachmittags dasselbe Muster beim Thema Bruecke.
//
// WARUM HIER, im Server, und nicht im Client: der Client baut die Nachrichten
// aus dem Chat-Fenster (chatClient.js steht unter dem Start-Lock), und BEIDE
// Chat-Wege (Cline und BYOK-Anbieter) landen in diesen Routen. Eine Regel an
// einer Stelle, statt zwei Fassungen, die auseinanderlaufen.
//
// WAS PASSIERT: Enthaelt der Verlauf Spuren eines Maus-Laufs und ist die
// letzte Nutzer-Nachricht KEIN neuer Maus-Auftrag, bekommt das Modell eine
// System-Nachricht mit der Wahrheit: die Maus ist ein eigenes Werkzeug, sie
// laeuft gerade nicht, sie reagiert nur auf die Vorlage, und Schritte, die
// nicht wirklich geschehen sind, duerfen nicht erfunden werden.
//
// Reine Funktion, ohne Netz und ohne Zustand — direkt testbar.

export const MAUS_VORLAGE = "Erledige mit der Maus im Browser:";

// Spuren eines echten Maus-Laufs im Verlauf: die Fortschrittszeilen des
// Panels ("Maus 3/10: ...") und seine Abschlusszeilen.
const MAUS_SPUR = /(^|\n)\s*Maus \d+\/\d+:|Maus fertig(,| nach)|Maus gestoppt|Maus angehalten|Die Maus fängt an\./;

export const MAUS_SCHUTZ_HINWEIS = [
  "WICHTIG — die Maus ist NICHT du.",
  "Im Verlauf stehen Zeilen wie \"Maus 1/10: ...\" oder \"Maus fertig ...\". Die stammen von der MAUS: einem eigenen Werkzeug von smejj.com, das den Browser bedient und seine Schritte selbst in den Chat schreibt. Du bist das Chat-Modell und hast keinen Zugriff auf Browser, Maus, Seiten oder Formulare.",
  "Die Maus laeuft gerade NICHT. Sie startet nur, wenn der Nutzer eine Nachricht schickt, die mit \"" + MAUS_VORLAGE + "\" beginnt — dann uebernimmt sie und schreibt selbst.",
  "Deshalb: Erfinde KEINE Maus-Zeilen, kein Protokoll, keine Schritte, keine Klicks, keine Eingaben und keine Knoepfe oder Menues, die es nicht gibt. Behaupte nie, du haettest etwas im Browser getan oder wuerdest es gleich tun.",
  "Will der Nutzer, dass die Maus weitermacht oder etwas Neues tut (z. B. gibt er Namen, Daten oder ein \"weiter\"), sag ihm kurz und ehrlich: Die Maus wartet auf einen neuen Auftrag. Er soll ihn mit \"" + MAUS_VORLAGE + "\" beginnen und alle noetigen Angaben hineinschreiben, zum Beispiel: \"" + MAUS_VORLAGE + " auf der offenen Seite Vorname Alan und Nachname Best eintragen und auf Weiter klicken\".",
  "Fragt er, warum die Maus stockt oder was passiert ist, erklaere nur, was WIRKLICH in den Maus-Zeilen steht — nicht mehr."
].join("\n");

// ZWEITER FALL (Betreiber-Chat 2026-09-06, 18:39: "Mann geh smejj browser und
// mach das."): KEINE Maus-Spur im Verlauf, aber der Nutzer verlangt eine
// Browser-Handlung ohne die Vorlage. Das Modell antwortete mit einer
// erfundenen "Freigabeliste", einer "Maus-Steuerung", die es angeblich nicht
// abschalten koenne, und einer Anleitung zum Selbermachen. Nichts davon gibt
// es. Der Hinweis hier ist kuerzer: kein Browser, keine Regeln erfinden, auf
// die Vorlage verweisen.
const BROWSER_WUNSCH = /\b(browser|maus|mouse|klick\w*|click\w*|anklick\w*|surf\w*|webseite|website|registrier\w*|anmeld\w*|einlogg\w*|login)\b/i;

export const BROWSER_HINWEIS = [
  "WICHTIG — du hast KEINEN Browser.",
  "Du kannst keine Webseite oeffnen, nichts anklicken, nichts eintippen, kein Konto anlegen und nichts anmelden. Es gibt keine Freigabeliste, keine Maus-Steuerung und keine Regel, die du an- oder abschalten koenntest — erfinde nichts davon.",
  "Fuer Aufgaben im Browser gibt es bei smejj.com die MAUS, ein eigenes Werkzeug. Sie startet NUR, wenn der Nutzer eine Nachricht schickt, die mit \"" + MAUS_VORLAGE + "\" beginnt, gefolgt von der Aufgabe und der Seite, zum Beispiel: \"" + MAUS_VORLAGE + " auf con.ax/en/register ein Konto mit meiner E-Mail anlegen\".",
  "Wenn der Nutzer also etwas im Browser erledigt haben will: antworte in ein bis zwei Saetzen, dass du das nicht selbst tun kannst, und gib ihm den fertigen Satz mit der Vorlage zum Abschicken — keine Schritt-fuer-Schritt-Anleitung zum Selbermachen, ausser er fragt ausdruecklich danach."
].join("\n");

/**
 * Haengt bei Bedarf die Schutz-Nachricht an.
 *
 * @param {Array<{role:string, content:any}>} messages bereits bereinigte Nachrichten
 * @returns {Array} dieselbe Liste (unveraendert) oder eine neue mit dem Hinweis
 */
export function ergaenzeMausSchutz(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return messages;
  const art = brauchtMausSchutz(messages) ? "maus" : brauchtBrowserHinweis(messages) ? "browser" : "";
  if (!art) return messages;
  const hinweis = { role: "system", content: art === "maus" ? MAUS_SCHUTZ_HINWEIS : BROWSER_HINWEIS };
  // Direkt HINTER die vorhandene System-Nachricht — dort liest jedes Modell
  // seine Regeln. Ohne System-Nachricht an den Anfang.
  const erste = messages[0]?.role === "system" ? 1 : 0;
  return [...messages.slice(0, erste), hinweis, ...messages.slice(erste)];
}

/** Braucht dieser Verlauf den Hinweis? (exportiert fuer Tests und Messungen) */
export function brauchtMausSchutz(messages) {
  const letzteNutzer = [...messages].reverse().find((m) => m?.role === "user");
  // Ein NEUER Maus-Auftrag geht seinen eigenen Weg (maus-absicht.js faengt
  // ihn im Client ab) — kommt er doch hier an, soll das Modell nicht
  // zusaetzlich verwirrt werden.
  if (letzteNutzer && textVon(letzteNutzer.content).trim().startsWith(MAUS_VORLAGE)) return false;
  if (messages.some((m) => m?.role === "system" && textVon(m.content) === MAUS_SCHUTZ_HINWEIS)) return false;
  return messages.some((m) => m?.role === "assistant" && MAUS_SPUR.test(textVon(m.content)));
}

/** Verlangt die letzte Nutzer-Nachricht eine Browser-Handlung ohne Vorlage? */
export function brauchtBrowserHinweis(messages) {
  const letzteNutzer = [...messages].reverse().find((m) => m?.role === "user");
  if (!letzteNutzer) return false;
  const text = textVon(letzteNutzer.content).trim();
  if (text.startsWith(MAUS_VORLAGE)) return false;
  if (messages.some((m) => m?.role === "system" && [MAUS_SCHUTZ_HINWEIS, BROWSER_HINWEIS].includes(textVon(m.content)))) return false;
  return BROWSER_WUNSCH.test(text);
}

function textVon(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((p) => (p?.type === "text" ? String(p.text || "") : "")).join("\n");
  return "";
}
