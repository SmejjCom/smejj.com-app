# Prompt fuer neuen Chat: smejj IDrive-first Lite Coding Engine

Du bist Codex und arbeitest im Projekt `smejj.com App`.

Bitte arbeite nach diesen festen Regeln:

- Oeffne nur Dateien, die fuer die konkrete Aufgabe notwendig sind.
- Keine grosse automatische Projektanalyse.
- Keine unnoetigen Refactorings.
- Keine Aenderung am Startseiten-Design oder unteren Eingabefeld ohne schriftliche Freigabe.
- `docs/architecture/FREE_ONLY_MASTER_POLICY.md` ist verbindlich.
- `docs/frontend/START_DESIGN_LOCK.md` ist verbindlich.
- GitHub und Cloudflare duerfen nur im dauerhaft kostenlosen Free-Tarif genutzt werden.
- Keine GitHub/Cloudflare Paid-Dienste, keine Trials, keine Auto-Billing-Fallbacks.
- IDrive e2 ist Hauptspeicher fuer Dateien, Modelle, Manifeste, Checksums, Logs, Ergebnisse, Backups und Such-/RAG-Artefakte.

## Ziel

Wir wollen smejj als guenstige eigene Coding-App bauen:

```text
Cloudflare Free
-> Contabo VPS 8 GB / 60 GB SSD
-> IDrive e2 Hauptspeicher
-> kleine lokale Coding Engine
```

Keine Vast.ai-Abhaengigkeit fuer normale Coding-Anfragen.
Keine teure GPU pro Nutzeranfrage.
Der Contabo-Server bleibt klein und soll nur das Notwendige rechnen.
IDrive e2 soll so viel Arbeit wie moeglich als Speicher, Gedaechtnis, Archiv und Job-Ablage uebernehmen.

## Wichtige Wahrheit

IDrive e2 kann speichern, versionieren, sichern und Objekte per S3-API liefern.
IDrive e2 kann aber keine KI-Inferenz rechnen.
Cloudflare Free kann nur leichte Edge-/Gatekeeper-Aufgaben uebernehmen.
Der Contabo-Server kann mit 8 GB RAM nur kleine/quantisierte Modelle und gezielte Coding-Aufgaben ausfuehren.

Das System soll deshalb nicht wie eine riesige Claude/Codex-Kopie gebaut werden, sondern als sparsame Coding Engine:

- Code-Suche zuerst
- gespeicherte Loesungen wiederverwenden
- nur relevante Dateien ans Modell geben
- kleines lokales Modell nutzen
- grosse Jobs ueber Queue langsam und stabil abarbeiten

## IDrive e2 soll uebernehmen

Bitte plane und implementiere schrittweise, dass IDrive e2 moeglichst viel uebernimmt:

1. Modell-Lager
   - kleine Coding-Modelle
   - Modell-Versionen
   - Tokenizer
   - Configs
   - Checksums
   - Manifeste

2. Projekt-Speicher
   - Nutzer-Projekte
   - Datei-Snapshots
   - ZIP-Uploads
   - Ergebnis-Dateien
   - Backups

3. Code-Gedaechtnis
   - Code-Index
   - BM25-/Such-Artefakte
   - Embeddings
   - Datei-Zusammenfassungen
   - Projekt-Zusammenfassungen

4. Antwort-Gedaechtnis
   - alte Fragen
   - alte Antworten
   - bekannte Bugfixes
   - wiederverwendbare Code-Muster
   - erfolgreiche Loesungen

5. Job-System
   - offene Jobs
   - laufende Jobs
   - fertige Jobs
   - fehlgeschlagene Jobs
   - Status-Dateien
   - Ergebnis-Dateien

6. Direkt-Uploads
   - grosse Dateien sollen moeglichst direkt per pre-signed URL nach IDrive e2 gehen
   - Contabo soll grosse Uploads nicht komplett durchleiten muessen

7. Sicherheit und Backups
   - Versioning nutzen, wenn passend
   - Object Lock/Retention fuer wichtige Artefakte pruefen
   - Checksums fuer Modell- und Index-Dateien
   - Restore alter Versionen ermoeglichen

8. Logs auslagern
   - App-Logs
   - Modell-Logs
   - Fehlerberichte
   - Nutzungsdaten
   - Kosten-/Speicherberichte

## Contabo soll nur uebernehmen

Der Contabo VPS soll schlank bleiben:

- API-Anfragen annehmen
- Nutzer/Session pruefen
- Job erzeugen
- relevante Projektdateien oder Indexdaten aus IDrive e2 lesen
- kleines lokales Coding-Modell starten oder ansprechen
- Ergebnis erzeugen
- Ergebnis nach IDrive e2 schreiben
- Cache auf 60 GB SSD klein halten
- alte lokale Daten automatisch loeschen

## Lokale Coding Engine

Die Engine soll klein, guenstig und robust sein:

- llama.cpp oder vergleichbar fuer CPU-freundliche quantisierte Modelle pruefen
- kleines Coding-Modell lokal auf Contabo nutzen
- zuerst Suche/RAG, dann Modell
- keine riesigen Modell-Dateien dauerhaft lokal speichern
- nur ein kleines Modell lokal cachen
- Modell-Manifest aus IDrive e2 lesen
- Checksums pruefen

## Arbeitsweise

Bitte starte nicht mit grossem Umbau.
Gehe klein und messbar vor:

1. Bestehende IDrive-Struktur kurz pruefen.
2. Bestehende Modell-/Storage-Dateien nur gezielt lesen.
3. Einen minimalen Plan fuer die naechste konkrete Umsetzung machen.
4. Danach gezielt implementieren.
5. Nach Architektur-/Kosten-Aenderungen `npm run check:architecture` ausfuehren.
6. Nach Frontend-Aenderungen `npm run check:frontend` ausfuehren.

## Gewuenschtes Ergebnis

Baue smejj Richtung:

```text
smejj Lite Coding Engine
= Contabo kleiner Rechner
+ IDrive e2 Hauptspeicher/Gedaechtnis
+ Cloudflare Free Schutz
+ GitHub Free nur Code/Doku
+ kleines lokales Coding-Modell
+ Code-Suche
+ Queue
+ gespeicherte Loesungen
```

Bitte beginne im neuen Chat mit einer kurzen Bestandsaufnahme:

- Welche IDrive-/Modell-Dateien existieren schon?
- Welche Codepfade steuern Storage/AI/Jobs?
- Was ist der kleinste naechste Schritt, um mehr Arbeit nach IDrive e2 auszulagern?

Halte Antworten kurz, uebersichtlich und ohne lange Theorie.
