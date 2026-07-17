# smejj.com — Assistenten-Paritaet: Ist-Stand und Roadmap

> Stand: 2026-07-17. Ziel des Dokuments: ehrlich benennen, wo smejj.com im
> Vergleich zu ChatGPT, Claude und Gemini steht — und was in welcher Reihenfolge
> fehlt. Keine Marketingsprache, keine Behauptungen ohne Live-Beleg.
>
> Regel: Ein Punkt gilt erst als "erledigt", wenn er LIVE auf smejj.com bewiesen
> ist (nicht "implementiert", nicht "getestet" — live bewiesen).

## 1. Was heute live funktioniert (verifiziert)

| Faehigkeit | Stand | Live-Beleg |
|---|---|---|
| Chat mit starkem Modell (GLM-5.2) | live | Antworten korrekt, TTFT ~3,5-8 s |
| **Gespraechsgedaechtnis (Multi-Turn)** | **live seit V80** | "Merke dir 47" -> "Welche Zahl?" -> "Die Zahl war 47" |
| Websuche / Live-Daten | live | Wetter Berlin mit echten Open-Meteo-Daten inkl. Folgetag |
| Coding-Modus mit Reasoning | live | Primzahl-Funktion: Plan + Code, Thinking aktiv |
| Sprachmodus (Zuhoeren/Antworten/Vorlesen) | live | App + 14 Sprachseiten, satzweises Vorlesen ab Satz 1 |
| Barge-in (Reinsprechen unterbricht) | live | E2E im deployten Modul bewiesen (Echo-/Rauschfilter greifen) |
| Mehrsprachigkeit | live | 15 Sprachen, RTL (ar) korrekt |
| Browser-Agent ("Maus") | live | Formular ausgefuellt + abgeschickt, Replay mit Screenshots |
| Autonomes Coding (Task Capsules) | live | Capsule -> Patch -> Verifikation |
| Multi-Model-Router (BYOK) | live | GLM-5.2, Kimi K2.7, Cline; fail-closed ohne Key |
| PWA / Offline-Shell | live | Service Worker v125 |
| Auth (Passkey, E-Mail, Google) | live | — |

## 2. Die groessten Luecken zu ChatGPT/Claude (priorisiert)

### Stufe A — Free umsetzbar, hoher Nutzen

1. **Gespraeche bleiben nicht erhalten (kein echter Chat-Verlauf ueber Sitzungen).**
   Das Gedaechtnis reicht aktuell nur innerhalb der offenen Seite; nach Reload ist
   das Gespraech weg. ChatGPT/Claude haben persistente Threads mit Titeln,
   Umschalten und Suche. Vorhanden ist bereits eine `chatHistory`-View — sie muss
   an echte, auf IDrive e2 gespeicherte Threads angebunden werden.
   *Aufwand: mittel. Kosten: keine (IDrive e2 vorhanden).*

2. **Dateien im Chat (Bild/PDF/Text hochladen und besprechen).**
   Der Composer kann Dateien referenzieren, aber kein Bild verstehen. Fuer
   Text/PDF ist das Free machbar (Extraktion + Kontext), fuer Bildverstehen
   braucht es ein multimodales Modell (Budget, siehe Stufe C).
   *Aufwand: mittel. Kosten: keine fuer Text/PDF.*

3. **Antwort-Steuerung: Stopp-Knopf, Neu-generieren, Antwort bearbeiten.**
   Kleine Dinge, die den Unterschied zwischen "Demo" und "Produkt" ausmachen.
   *Aufwand: klein. Kosten: keine.*

4. **Nutzer-Gedaechtnis ueber Gespraeche hinweg ("Merk dir, dass ich X bevorzuge").**
   Eine `memory`-View existiert (lokal, browserseitig). Anbindung an IDrive e2
   pro Nutzer + Einblendung in den System-Prompt.
   *Aufwand: mittel. Kosten: keine. Achtung: Datenschutz-Text pruefen.*

### Stufe B — Free umsetzbar, mittlerer Nutzen

5. **Antwortqualitaet messen statt behaupten.** Ein kleines, festes Set an
   Pruef-Fragen (Fakten, Coding, Sprache, Halluzinations-Fallen), das bei jedem
   Control-Release automatisch laeuft. Ohne Messung ist "besser als X" eine
   Behauptung. *Aufwand: mittel. Kosten: BYOK-Tokens pro Lauf (gering).*

6. **Code ausfuehren/testen im Chat.** Die Salad-Worker koennen das bereits fuer
   autonome Jobs — im normalen Chat fehlt der Weg dorthin.
   *Aufwand: gross. Kosten: pay-per-use Worker (bereits freigegebener Rahmen).*

7. **Bessere Quellen-Darstellung** (Fussnoten statt Text-URLs), wie Perplexity/
   ChatGPT Search. *Aufwand: klein.*

### Stufe C — braucht ausdrueckliche Budget-Freigabe (Dienst + Betrag nennen)

8. **Erste Antwort unter 2 Sekunden.** Heute 3,5-8 s. Bremsen: GLM-Antwortzeit,
   zwei Netz-Spruenge (Bridge -> Control), Salad-Community-Hardware.
   Hebel: Salad Priority-Tier, Direktpfad ohne Bridge, ggf. schnelleres Modell
   fuer Kurzantworten. *Ohne Budget nicht loesbar — ehrlich so benannt.*

9. **Eigene Stimme / Streaming-Spracherkennung (TTS/STT Stufe 2).** Heute nutzt
   der Sprachmodus die Gratis-Stimmen des Geraets. Eigene Stimme klingt deutlich
   professioneller, kostet aber GPU-Zeit.

10. **Bildverstehen und Bilderzeugung.** Braucht ein multimodales Modell (API-Key
    oder eigener Worker).

11. **smejj 1.0 (eigenes Modell).** Langfristiges Ziel. Voraussetzung: Punkt 5
    (Messung) muss zuerst stehen, sonst ist "besteht die Benchmarks" nicht
    pruefbar. Trainingsdaten-Policy bleibt fail-closed bindend
    (`SMEJJ_1_0_TRAINING_DATA_POLICY.md`): Fremdmodell-Ausgaben sind fuer
    Training gesperrt, solange keine geprüfte Rechtefreigabe vorliegt.

## 3. Was smejj.com heute BESSER kann als die grossen Anbieter

Ehrlich, aber es ist nicht nichts:

- **Nachvollziehbarkeit:** Jede Aenderung hat Rollback-Punkt, SHA-Beleg und
  Memory-Eintrag. Kein grosser Anbieter zeigt dem Nutzer, was sich warum aenderte.
- **Kostenmodell:** BYOK + Free-only-Policy + Budget-Gate. Keine Abo-Falle.
- **Datenhoheit:** Alles liegt auf eigenem Speicher (IDrive e2), nicht beim
  Modellanbieter. Training aus Nutzerdaten ist standardmaessig AUS.
- **Browser-Agent + autonomes Coding** sind bereits integriert statt zugekauft.

## 4. Empfohlene Reihenfolge

1. Persistente Gespraeche (Stufe A.1) — groesster spuerbarer Sprung.
2. Antwort-Steuerung (A.3) — klein, sofort spuerbar.
3. Dateien im Chat, Text/PDF (A.2).
4. Nutzer-Gedaechtnis (A.4).
5. Qualitaets-Messung (B.5) — Pflicht, bevor ueber smejj 1.0 geredet wird.
6. Erst danach Budget-Themen (Stufe C) mit konkreten Betraegen bewerten.

## 5. Arbeitsregel (aus AI_Guidelines 0.1)

Der Betreiber fuehrt keine technischen Schritte selbst aus. Punkte dieser Roadmap
werden von der jeweiligen Session vollstaendig umgesetzt, live getestet und
belegt. Nur Stufe C wird vorgelegt statt ausgefuehrt — dort ist eine
Budget-Freigabe mit Dienst und Betrag zwingend.
