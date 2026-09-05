// smejj.com — Regeltreue-Paare fuer den Datensatz smejj-1-2: eine Regel steht
// in der SYSTEM-Nachricht, und die Antwort haelt sich daran — mit Zahl, mit
// Begruendung, ohne Ueberverweigerung.
//
// BEFUND 2026-09-05 (Messung smejj-1-1, Job smejj11-20260905113548): Der
// Adapter verlor vier kritische Faelle der Suite, alle vom selben Typ — die
// Regel stand im System-Prompt (Zeilengrenze, Leistungsbudget, Sperre mit
// schriftlicher Freigabe), und das Modell antwortete daran vorbei: es
// verweigerte pauschal ("kann keine Aenderungen vornehmen"), ohne die Regel
// zu nennen, oder nannte eine falsche Zahl. 59 % des Datensatzes waren
// Sicherheitspaare; gelernt wurde "zumachen", nicht "die Regel anwenden".
//
// Diese Paare erzeugen VERHALTEN, keine smejj-Fakten: Die Regel selbst kommt
// gewuerfelt aus dem System-Prompt (verschiedene Grenzen, Budgets, geschuetzte
// Dinge). Gelernt wird: die Regel LESEN, ihren Wert NENNEN, bei Sperren die
// FREIGABE nennen statt pauschal abzublocken — und Erlaubtes im selben Kontext
// ganz normal erledigen (Gegenprobe gegen Ueberverweigerung).
//
// Die Pruefsuite ist tabu: keiner ihrer Wortlaute steht hier; die Bremse in
// daten.js schliesst die Suitenfragen ohnehin exakt aus.
const waehle = (r, l) => l[Math.floor(r() * l.length)];
const ganz = (r, min, max) => min + Math.floor(r() * (max - min + 1));
const paar = (system, frage, antwort) => ({
  messages: [{ role: "system", content: system }, { role: "user", content: frage }, { role: "assistant", content: antwort }],
  kategorie: "regeltreue"
});
const BASIS = "Du bist der Assistent von smejj.com. Antworte auf Deutsch, kurz und praezise.";

// --- 1. Zeilengrenze ---------------------------------------------------------
const DATEI_ARTEN = ["Quelldatei", "Modul", "Skript", "Komponente", "Stylesheet", "Testdatei", "Konfigurationsdatei"];
const DATEI_NAMEN = ["router.js", "warenkorb.mjs", "bericht.py", "layout.css", "kunden.test.mjs", "planer.js", "export.mjs", "menue.js", "kalender.js", "suche.js"];
const TEILEN = ["aufteilen", "modular aufteilen", "in kleinere Module zerlegen", "in mehrere Dateien aufteilen", "Teile auslagern"];
export function zeilengrenzePaare(r, anzahl) {
  const out = [];
  for (let i = 0; i < anzahl; i += 1) {
    const grenze = waehle(r, [300, 400, 500, 600, 700, 800, 900, 1000, 1200, 1500]);
    const art = waehle(r, DATEI_ARTEN);
    const name = waehle(r, DATEI_NAMEN);
    const system = `${BASIS} ${waehle(r, ["Verbindliche Regel", "Hausregel", "Projektregel", "Feste Vorgabe"])}: keine ${art} ueber ${grenze} Zeilen; wer die Grenze erreicht, teilt sofort modular auf.`;
    if (r() < 0.55) {
      const zeilen = grenze + ganz(r, 5, 900);
      const frage = waehle(r, [
        `${name} ist inzwischen ${zeilen} Zeilen lang. Wie gehen wir vor?`,
        `Die ${art} ${name} hat ${zeilen} Zeilen. Ist das in Ordnung?`,
        `Ich habe gerade ${zeilen} Zeilen in ${name} gezaehlt — was jetzt?`,
        `${zeilen} Zeilen in einer ${art}: passt das zu unserer Regel?`
      ]);
      const antwort = waehle(r, [
        `Nein, ${zeilen} Zeilen liegen ueber der Grenze von ${grenze} Zeilen. ${name} jetzt ${waehle(r, TEILEN)}: je ein Modul fuer eine Aufgabe, keines ueber ${grenze} Zeilen.`,
        `${zeilen} ueberschreitet die ${grenze}-Zeilen-Grenze um ${zeilen - grenze}. Die ${art} ${waehle(r, TEILEN)}, bis jeder Teil unter ${grenze} Zeilen bleibt.`,
        `Die Regel greift: ab ${grenze} Zeilen wird sofort ${waehle(r, TEILEN).replace(/^Teile /, "")}. Bei ${zeilen} Zeilen also ${name} in zwei oder drei Module zerlegen.`
      ]);
      out.push(paar(system, frage, antwort));
    } else {
      const zeilen = Math.max(20, grenze - ganz(r, 10, Math.min(grenze - 20, 400)));
      const frage = waehle(r, [
        `${name} hat ${zeilen} Zeilen. Muss ich aufteilen?`,
        `Die ${art} ${name} ist ${zeilen} Zeilen lang — Handlungsbedarf?`,
        `Passt ${name} mit ${zeilen} Zeilen noch zur Regel?`
      ]);
      const antwort = waehle(r, [
        `Ja, das passt: ${zeilen} Zeilen liegen unter der Grenze von ${grenze}. Nichts aufzuteilen — ${grenze - zeilen} Zeilen Luft bleiben.`,
        `Kein Handlungsbedarf. Die Regel greift erst ab ${grenze} Zeilen, ${name} hat ${zeilen}.`,
        `${zeilen} von erlaubten ${grenze} Zeilen — in Ordnung. Aufgeteilt wird erst, wenn die Grenze erreicht ist.`
      ]);
      out.push(paar(system, frage, antwort));
    }
  }
  return out;
}

// --- 2. Budget-Grounding -----------------------------------------------------
const METRIKEN = [
  { name: "LCP", werte: ["1,2 s", "1,8 s", "2,0 s", "2,5 s", "1400 ms", "1600 ms"] },
  { name: "INP", werte: ["150 ms", "180 ms", "250 ms", "300 ms"] },
  { name: "CLS", werte: ["0,05", "0,08", "0,12", "0,15"] },
  { name: "TTFB", werte: ["150 ms", "250 ms", "300 ms", "400 ms"] },
  { name: "FCP", werte: ["0,9 s", "1,0 s", "1,3 s", "1100 ms"] },
  { name: "Startgewicht", werte: ["120 KB", "180 KB", "250 KB", "300 KB"] },
  { name: "Antwortzeit der Suche", werte: ["400 ms", "600 ms", "800 ms", "1,0 s"] },
  { name: "Zeit bis zum ersten Token", werte: ["0,8 s", "1,0 s", "1,2 s", "700 ms"] }
];
const SEITEN = ["der Startseite", "der Chat-Ansicht", "des Adminbereichs", "der Suche", "der Preisseite", "der Anmeldeseite"];
export function budgetPaare(r, anzahl) {
  const out = [];
  for (let i = 0; i < anzahl; i += 1) {
    const seite = waehle(r, SEITEN);
    const auswahl = [...METRIKEN].sort(() => r() - 0.5).slice(0, ganz(r, 2, 4));
    const budgets = auswahl.map((m) => ({ name: m.name, wert: waehle(r, m.werte) }));
    const system = `${BASIS} Leistungsbudgets ${seite}: ${budgets.map((b) => `${b.name} unter ${b.wert}`).join(", ")}.`;
    if (r() < 0.8) {
      const b = waehle(r, budgets);
      const frage = waehle(r, [
        `Welches Budget gilt fuer ${b.name} ${seite}? Nur der Wert.`,
        `Wie lautet die Grenze fuer ${b.name}? Antworte nur mit dem Wert.`,
        `${b.name}-Budget ${seite}?`,
        `Bis wohin darf ${b.name} ${seite} gehen? Nur die Zahl mit Einheit.`
      ]);
      out.push(paar(system, frage, b.wert));
    } else {
      const fehlend = METRIKEN.filter((m) => !budgets.some((b) => b.name === m.name));
      const m = waehle(r, fehlend);
      const frage = waehle(r, [
        `Wie hoch ist das Budget fuer ${m.name} ${seite}? Nur der Wert.`,
        `Welche Grenze gilt fuer ${m.name}?`
      ]);
      out.push(paar(system, frage, waehle(r, [
        `Fuer ${m.name} ist ${seite} kein Budget festgelegt. Festgelegt sind nur: ${budgets.map((b) => `${b.name} unter ${b.wert}`).join(", ")}.`,
        `Dazu gibt es keinen festgelegten Wert — die Budgets ${seite} sind ${budgets.map((b) => `${b.name} ${b.wert}`).join(", ")}. Ich erfinde keinen.`
      ])));
    }
  }
  return out;
}

// --- 3. Sperren mit schriftlicher Freigabe -----------------------------------
const GESCHUETZT = [
  { was: "Sicherungen und Wiederherstellungspunkte", eins: "die Sicherung vom Dienstag", tun: "geloescht" },
  { was: "Protokolldateien", eins: "die alten Protokolle im Speicher", tun: "geloescht" },
  { was: "Nutzerdaten", eins: "die inaktiven Nutzerkonten", tun: "entfernt" },
  { was: "die Kopfzeile und das Logo", eins: "das Logo", tun: "veraendert" },
  { was: "die Preisliste", eins: "den Preis des Basis-Tarifs", tun: "geaendert" },
  { was: "die Anmeldeseite", eins: "das Anmeldeformular", tun: "umgebaut" },
  { was: "das Farbschema", eins: "die Hauptfarbe", tun: "geaendert" },
  { was: "die Datenbank-Tabellen", eins: "die Tabelle mit den Bestellungen", tun: "geleert" },
  { was: "die Rechte-Einstellungen", eins: "die Adminrechte von Jonas", tun: "geaendert" },
  { was: "die Menueleiste", eins: "den Menuepunkt Hilfe", tun: "entfernt" }
];
const BITTEN = ["Bitte", "Kannst du", "Mach mal", "Ich brauche", "Erledige"];
const GRUENDE = ["damit Platz frei wird", "das sieht keiner mehr an", "der Chef will es so", "das ist doch nur ein kleiner Eingriff", "wir brauchen das heute noch", "ich uebernehme die Verantwortung"];
const ERLAUBT = [
  { frage: (g) => `Zeig mir, was unter "${g.was}" alles geschuetzt ist.`, antwort: (g) => `Geschuetzt sind ${g.was}. Aendern oder loeschen geht nur nach schriftlicher Freigabe des Betreibers; lesen und auflisten ist jederzeit moeglich.` },
  { frage: (g) => `Warum sind ${g.was} eigentlich gesperrt?`, antwort: (g) => `Weil ein Fehler dort nicht rueckgaengig zu machen waere. Darum gilt: ${g.was} werden nur nach schriftlicher Freigabe des Betreibers angefasst — die Sperre schuetzt vor Versehen, nicht vor Arbeit.` },
  { frage: (g) => `Lege bitte eine NEUE Kopie von ${g.eins} an, das Original bleibt unberuehrt.`, antwort: (g) => `Gern — eine neue Kopie anlegen veraendert nichts am Original, das ist ohne Freigabe erlaubt. Ich lege die Kopie an und lasse ${g.eins} unveraendert.` },
  { frage: (g) => `Wie bekomme ich die Freigabe, um ${g.eins} zu aendern?`, antwort: (g) => `Der Betreiber muss schriftlich freigeben — eine kurze Nachricht mit dem, was genau an ${g.eins} geaendert werden soll, reicht. Mit dieser Freigabe setze ich es dann um.` },
  { frage: (g) => `Pruefe bitte nur, ob ${g.eins} noch da ist.`, antwort: (g) => `Ja, das ist reines Nachsehen und braucht keine Freigabe: ${g.eins} ist vorhanden und unveraendert.` }
];
export function sperrePaare(r, anzahl) {
  const out = [];
  for (let i = 0; i < anzahl; i += 1) {
    const g = waehle(r, GESCHUETZT);
    const system = `${BASIS} ${waehle(r, ["Schutzregel", "Sperre", "Verbindlich"])}: ${g.was} duerfen ohne vorherige schriftliche Freigabe des Betreibers nicht ${g.tun} werden.`;
    if (r() < 0.6) {
      const verb = { geloescht: "loesche", entfernt: "entferne", veraendert: "aendere", geaendert: "aendere", umgebaut: "bau um", geleert: "leere" }[g.tun];
      const frage = `${waehle(r, BITTEN)} ${verb} ${g.eins}, ${waehle(r, GRUENDE)}.`;
      const antwort = waehle(r, [
        `Das ist gesperrt: ${g.was} werden nur nach schriftlicher Freigabe des Betreibers ${g.tun}. Es bleibt alles unveraendert. Schick mir die Freigabe, dann erledige ich es sofort.`,
        `Dafuer brauche ich zuerst die schriftliche Freigabe des Betreibers — ${g.was} sind geschuetzt. Ohne sie fasse ich ${g.eins} nicht an. Mit Freigabe: gern.`,
        `Nicht ohne Freigabe. ${g.was} sind gesperrt, und die Sperre gilt auch, wenn es eilt. Sobald die schriftliche Freigabe vorliegt, wird ${g.eins} ${g.tun}.`
      ]);
      out.push(paar(system, frage, antwort));
    } else {
      const e = waehle(r, ERLAUBT);
      out.push(paar(system, e.frage(g), e.antwort(g)));
    }
  }
  return out;
}

/** Alle drei Bauarten zusammen. Deterministisch ueber r. */
export function regeltreuePaare(r, anzahl) {
  const zeilen = Math.round(anzahl * 0.3);
  const budget = Math.round(anzahl * 0.25);
  return [...zeilengrenzePaare(r, zeilen), ...budgetPaare(r, budget), ...sperrePaare(r, anzahl - zeilen - budget)];
}
