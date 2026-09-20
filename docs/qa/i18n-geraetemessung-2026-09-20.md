# Gerätemessung 20.09.2026 (SW v917): sichtbare Texte, die in englischer Oberfläche NICHT übersetzt sind

Gemessen im Android-Chrome (en-US, angemeldet) über DevTools, je Ansicht alle sichtbaren Textknoten, Platzhalter und
aria-labels, die weder Schlüssel noch Wert in `public/i18n/en.js` sind. Ziffern sind zu `{n}` verdichtet. Am iPhone
(App `com.smejj.app`, Englisch) im Verlauf bestätigt: „Durchsuchen…", „+ Neu", „Alle", „Mit Datei", „HEUTE", „13 Gespräche".

**Zusätzlich** (hier NICHT gelistet, weil der Schlüssel in en.js schon existiert, der Text aber trotzdem deutsch erscheint —
die Stelle ruft `t()` nicht auf): im Verlauf u. a. „Alle", „Neu", „Heute", „Allgemein".

Titel und Überschrift jeder Ansicht sind seit v917 übersetzt (`view-title.js`). Diese Liste ist Zuarbeit für die laufende
i18n-Inventur der Parallelsitzung (Stufe 1b ff.) — bewusst NICHT doppelt umgesetzt, um die Sprachdateien nicht zu kreuzen.
Technik-/Markentexte (IDrive e2, GLM-5.2, zhipu, IndexedDB / OPFS …) brauchen keine Übersetzung.

## /chat-history (32)
- Text: `＋ Neuer Chat`
- Text: `{n}`
- Text: `Mit Datei`
- Text: `Mit Bild`
- Text: `Mit Code`
- Text: `📁 Alan Test Project`
- Text: `Einkauf`
- Text: `{n}. Aug. {n} · {n} Nachr.`
- Text: `{n} Gespräche`
- Text: `{n}:{n} · {n} Nachr.`
- Text: `Wissen`
- Text: `Technik`
- Text: `Gestern, {n}:{n} · {n} Nachr.`
- Text: `Diese Woche`
- Text: `Freitag, {n}:{n} · {n} Nachr.`
- Text: `Wetter`
- Text: `Donnerstag, {n}:{n} · {n} Nachr.`
- Text: `Rechnen`
- Text: `Mittwoch, {n}:{n} · {n} Nachr.`
- Text: `Dienstag, {n}:{n} · {n} Nachr.`
- Text: `Recherche`
- Text: `Montag, {n}:{n} · {n} Nachr.`
- aria-label: `Zurueck`
- Text: `Zurueck`
- aria-label: `Schliessen und zur Startseite`
- Text: `Schliessen und zur Startseite`
- Platzhalter: `Durchsuchen…`
- aria-label: `Verlauf durchsuchen`
- Text: `Neue Unterhaltung beginnen`
- aria-label: `Aktionen für Projekt Alan Test Project`
- Text: `Projekt-Aktionen`
- Text: `Unterhaltung öffnen`

## /search (7)
- Text: `Globale Suche`
- Text: `Suche über Chats, Projekte, Projekt-Dateien, Uploads und Verlauf. Enter öffnet den besten Treffer.`
- aria-label: `Zurueck`
- Text: `Zurueck`
- aria-label: `Schliessen und zur Startseite`
- Text: `Schliessen und zur Startseite`
- Platzhalter: `Chats, Projekte, Dateien, Code, Quellen suchen`

## /files (15)
- Text: `Meine Sachen`
- Text: `Was du hochgeladen hast — und ob smejj es schon lesen konnte.`
- Text: `Quellen`
- Text: `Sobald eine Antwort Webseiten verlinkt, stehen sie hier.`
- Text: `Dateien auswählen`
- Text: `Wartende Dateien`
- Text: `IDrive e{n} prüfen`
- Text: `Liste herunterladen`
- aria-label: `Zurueck`
- Text: `Zurueck`
- aria-label: `Schliessen und zur Startseite`
- Text: `Schliessen und zur Startseite`
- aria-label: `Quellen der Antworten`
- aria-label: `Dateien für Upload auswählen`
- aria-label: `Wartende Dateien`

## /storage (19)
- Text: `Speicher`
- Text: `Deine Dateien liegen in Europa in deinem eigenen Bereich. Die Zugangsschlüssel bekommt dein Browser nie zu sehen.`
- Text: `Primärspeicher`
- Text: `IDrive e{n}`
- Text: `IndexedDB / OPFS`
- Text: `Abgleich`
- Text: `signierte Adressen folgen`
- Text: `K{n}.{n} Vault`
- Text: `geprueft / Live-Zaehler offen / Inferenz disabled`
- Text: `GLM-{n}.{n} FP{n}`
- Text: `Metadaten archiviert ({n} Objekte) / verified-complete`
- Text: `IDrive e{n} prüfen`
- Text: `K{n}.{n} Vault prüfen`
- Text: `GLM Vault prüfen`
- Text: `Lokalen Speicher anzeigen`
- aria-label: `Zurueck`
- Text: `Zurueck`
- aria-label: `Schliessen und zur Startseite`
- Text: `Schliessen und zur Startseite`

## /memory (12)
- Text: `RAG-Notizen`
- Text: `Memory speichern`
- Text: `Memory/RAG suchen`
- Text: `Gedächtnis herunterladen`
- aria-label: `Zurueck`
- Text: `Zurueck`
- aria-label: `Schliessen und zur Startseite`
- Text: `Schliessen und zur Startseite`
- Platzhalter: `Lokale, browserseitige Notizen`
- Platzhalter: `Lokale Quellen, Begriffe, Snippets`
- Platzhalter: `Suchbegriff`
- aria-label: `Suchbegriff`

## /cost (19)
- Text: `Kosten`
- Text: `Die Auslieferung bleibt dauerhaft kostenlos. Bezahl-Rückfälle, Testphasen und automatische Abbuchung sind gesperrt.`
- Text: `GitHub`
- Text: `Nur kostenfrei`
- Text: `GitHub Pages`
- Text: `AI`
- Text: `enabled (zhipu:glm-{n}.{n})`
- Text: `Eigener Schlüssel`
- Text: `Nutzer-Schlüssel separat`
- Text: `Paid-Fallback`
- Text: `blockiert`
- Text: `Trials`
- Text: `verboten`
- Text: `Kostenschutz anzeigen`
- Text: `Lokale Checks`
- aria-label: `Zurueck`
- Text: `Zurueck`
- aria-label: `Schliessen und zur Startseite`
- Text: `Schliessen und zur Startseite`

## /profile (3)
- Text: `Lokal-first · fail-closed`
- Text: `Google Login aktiv für smejjcom@gmail.com.`
- Platzhalter: `name@example.com`

## /projects (20)
- Text: `Meine Sachen`
- Text: `smejjCloud`
- Text: `Deine Projekte und Sicherungen entstehen zuerst auf diesem Gerät. Die Sicherung in der Cloud kommt danach automatisch.`
- Text: `Projekt erstellen`
- Text: `Liste aktualisieren`
- Text: `Projekt öffnen`
- Text: `Projekt speichern`
- Text: `Snapshot`
- Text: `Projektliste`
- Text: `Import-Datei`
- Text: `Keine Projekte`
- Text: `Erstelle ein lokales Projekt oder importiere ein smejj-Projekt.`
- Text: `Noch kein Projekt`
- Text: `Erstelle ein lokales Projekt, um Manifest, Dateien und Snapshots zu testen.`
- aria-label: `Zurueck`
- Text: `Zurueck`
- aria-label: `Schliessen und zur Startseite`
- Text: `Schliessen und zur Startseite`
- aria-label: `Projekt auswählen`
- aria-label: `Import-Datei auswählen`

## /papierkorb (6)
- Text: `Meine Sachen`
- Text: `Gelöschte Gespräche bleiben hier {n} Tage. Du kannst sie jederzeit zurückholen — erst danach sind sie wirklich weg.`
- aria-label: `Zurueck`
- Text: `Zurueck`
- aria-label: `Schliessen und zur Startseite`
- Text: `Schliessen und zur Startseite`

## /systemzustand (24)
- Text: `Betrieb`
- Text: `Läuft · gemeldet-aber-still · steht. Grau heißt nur: kein Herzschlag angekommen — nicht, dass etwas kaputt ist.`
- Text: `Fähigkeiten`
- Text: `Health`
- Text: `Kostenschutz-Hinweis`
- Text: `Lokaler Arbeitsbereich`
- Text: `Storage`
- Text: `verbunden`
- Text: `lokal bereit`
- Text: `IDrive e{n}`
- Text: `IDrive e{n} (smejj-model-files) OK`
- Text: `AI Mode`
- Text: `enabled (zhipu:glm-{n}.{n})`
- Text: `K{n}.{n} Vault`
- Text: `geprueft / Live-Zaehler offen / Inferenz disabled`
- Text: `Kosten`
- Text: `{n} EUR Risiko / blockiert`
- Text: `Abgleich`
- Text: `local`
- aria-label: `Zurueck`
- Text: `Zurueck`
- aria-label: `Schliessen und zur Startseite`
- Text: `Schliessen und zur Startseite`
- aria-label: `Aktueller Betriebsstatus`

## /smejj-claw (6)
- Text: `smejjBot`
- Text: `Coding bereit.`
- aria-label: `Zurueck`
- Text: `Zurueck`
- aria-label: `Schliessen und zur Startseite`
- Text: `Schliessen und zur Startseite`

## /bereiche (6)
- Text: `Arbeiten`
- Text: `Alle Gespräche eines Bereichs haben denselben Hintergrund — und eine Dauer-Anweisung, die dort in jedem Gespräch gilt.`
- aria-label: `Zurueck`
- Text: `Zurueck`
- aria-label: `Schliessen und zur Startseite`
- Text: `Schliessen und zur Startseite`

## /ai (35)
- Text: `Betrieb`
- Text: `Standardmäßig ist alles aus. Es wird nie automatisch und nie versteckt etwas benutzt, das Geld kostet.`
- Text: `Coding-Modell`
- Text: `KI-Modus`
- Text: `BYOK Endpoint`
- Text: `BYOK Modell`
- Text: `BYOK API-Key`
- Text: `GLM-{n}.{n}`
- Text: `zhipu`
- Text: `{n}M Kontext`
- Text: `flagship`
- Text: `Kimi K{n}.{n}`
- Text: `kimi`
- Text: `{n}K Kontext`
- Text: `agentic-coding`
- Text: `Kimi K{n}`
- Text: `smejj fast {n}.{n}`
- Text: `salad`
- Text: `smejj {n}`
- Text: `hausmodell`
- Text: `assistant`
- Text: `Bereit`
- Text: `KI-Modus prüfen`
- Text: `BYOK-Felder leeren`
- Text: `KI ist deaktiviert. Kimi K{n}.{n} ist Vault/BYOK/Partner/Self-host später, nicht kostenloser Standardmotor.`
- aria-label: `Zurueck`
- Text: `Zurueck`
- aria-label: `Schliessen und zur Startseite`
- Text: `Schliessen und zur Startseite`
- aria-label: `Coding-Modell`
- aria-label: `KI-Modus`
- Platzhalter: `https://api.example.com/v{n}`
- Platzhalter: `provider/model`
- Platzhalter: `Nur Session, nicht dauerhaft speichern`
- aria-label: `Verfuegbare KI-Modelle`

## /browser (15)
- Text: `Schneller Einstieg für Dateien auf diesem Gerät und zum Hochladen.`
- Text: `Browser-Speicher`
- Text: `IndexedDB / OPFS`
- Text: `Secrets`
- Text: `nicht im Browser`
- Text: `Abgleich`
- Text: `lokal zuerst`
- Text: `Dateien öffnen`
- Text: `Speicher prüfen`
- Text: `Local Browser KI`
- Text: `Browser-Bereich bereit.`
- aria-label: `Zurueck`
- Text: `Zurueck`
- aria-label: `Schliessen und zur Startseite`
- Text: `Schliessen und zur Startseite`

## Wiederkehrend in JEDER Ansicht (view-chrome.js)
- `Zurueck` (Text + aria-label)
- `Schliessen und zur Startseite` (Text + aria-label)
