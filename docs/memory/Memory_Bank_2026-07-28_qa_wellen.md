# Memory_Bank Archiv — QA-Wellen 1-3 (2026-07-28)

Ausgelagert am 2026-07-28 aus Memory_Bank.md, weil die Hauptdatei die
800-Zeilen-Regel (AI_Guidelines.md, scripts/check-guidelines.mjs) erreicht hatte.

NICHTS wurde geloescht oder geaendert — der Eintrag steht unten wortgleich.

### [2026-07-28] QA-WELLEN 1-3 VOLLSTAENDIG BEHOBEN (job_qa_wellen_1_3_20260728)

Freigabe "smejj.com 100 % fertig" (Wof Kadavanich, 2026-07-28) plus
Abschlussauftrag "Mach komplett fertig, lass nicht offen".

Verifizierte Ergebnisse (alle live auf https://smejj.com, check:all 37/37 und
release:preflight gruen):

- Recht: Impressum und Datenschutz nannten ZWEI verschiedene Gesellschaften
  (iMild LLC vs. AUS2001 LLC) — vereinheitlicht auf iMild LLC. Salad und Zeabur
  als Auftragsverarbeiter ergaenzt. Die Erklaerung versprach ein HttpOnly-Cookie
  smejj_session, das es nicht gibt; jetzt beschreibt sie den localStorage-Token.
- Sicherheit: Meta-CSP + Klickjacking-Schutz (GitHub Pages kann keine Header).
  /api/auth/me und /api/auth/session-token tragen jetzt no-store — sie trugen
  Identitaet bzw. einen gueltigen Token und waren cachebar.
- Produktkern: Coding-Jobs scheiterten nach jeder Ruhephase, weil der Runner
  Kaltstart-Fehler sofort dreimal wiederholte. Jetzt Wartezeit 45/90 s mit
  sichtbarem Zustand. Repository-Berechtigung greift VOR dem Rechenpfad.
  Ein seit 15 Tagen haengender Job wird beim Hydrieren als failed markiert.
- Suche fand nur den gerade geoeffneten Chat (DOM statt Speicher) — jetzt den
  ganzen Chat-Speicher, Treffer oeffnet die Unterhaltung.
- Barrierefreiheit: Fokusfuehrung im Sprachmodus, ARIA-Reiter in den
  Einstellungen, Seitentitel je Ansicht, eigener Fokusstil, Klickflaechen 24x24.

WICHTIGE LEHREN (verifiziert, gelten weiter):

1. Aufklappmenues bei UI-Pruefungen OEFFNEN. Die Zaehlung nach
   offsetParent !== null uebersieht alles in einem geschlossenen <details> —
   dadurch meldete ich "Projekte nicht loeschbar", obwohl der Knopf im
   "Mehr"-Menue sass (W2-02, im Bericht zurueckgezogen).
2. offsetParent ist bei position:fixed IMMER null. Sichtbarkeit dort ueber
   getBoundingClientRect() pruefen, sonst gilt ein offener Dialog als geschlossen.
3. Vor dem Deploy den Live-Stand gegen den EIGENEN Vorzustand hashen. So fiel
   auf, dass die i18n-Buendel live 2 Schluessel voraus waren — ein Upload der
   lokalen Datei haette sie in 14 Sprachen geloescht.
4. Eine Verschaerfung kann fail-closed zum Totalausfall werden: W3-02 blockierte
   nach dem Release ALLE Coding-Auftraege, weil SMEJJ_GITHUB_OWNER_ALLOWLIST nie
   gesetzt war. Nur der Live-Test hat es gefunden. Allowlist steht jetzt auf
   "smejjcom" (Salad-Env, Version 86).
5. Fehlendes Cache-Control taeuscht Messungen vor: Ein vermeintlicher
   Identitaets-Bug war der HTTP-Cache, der eine angemeldete Antwort auf eine
   anonyme Anfrage auslieferte.
6. check:all und release:preflight riefen pnpm auf, das auf dem Rechner des
   Betreibers fehlt — der Release-Gate war nie ausfuehrbar. Beide nutzen jetzt
   npm; AGENTS.md und FAVICON_LOCK.md nachgezogen.

OFFEN (nicht durch Entwicklung loesbar): englische Rechtstexte und die
juristische Bewertung aller Datenschutz-/Impressumsformulierungen.
Alle vier laufenden Salad-Container sind erforderlich (Zuordnung zu config.js
belegt; die Browser-Bruecke ruft cherry-wasabi ueber
SMEJJ_REMOTE_BROWSER_WORKER_URL).
