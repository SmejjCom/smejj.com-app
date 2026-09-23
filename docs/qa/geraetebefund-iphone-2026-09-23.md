# Gerätebefund iPhone 17 Pro Max (Testversion 4), 23.09.2026

Auftrag des Betreibers (schriftlich im Chat, 23.09.2026): „AKTUELLE iOS-/ANDROID-FEHLER VOLLSTÄNDIG
BEHEBEN, TESTEN UND TESTVERSIONEN VERÖFFENTLICHEN“. Screenshots vom echten Gerät: Code-Bereich mit
dunkler Fläche oben, „Hier ist dein Bild:“ mit kaputtem „?“, Sprachmodus „Mikrofon nicht erlaubt“
(bei leuchtendem orangem Mikrofon-Punkt).

## Ursachen (gemessen)

| Befund | Ursache | Beleg |
|---|---|---|
| Diktat schreibt nicht, Sprachmodus „Mikrofon nicht erlaubt“ | In der iOS-Hülle fehlt `NSSpeechRecognitionUsageDescription`. WebKit verweigert dann die Spracherkennung mit `service-not-allowed`, das Mikrofon selbst ist frei (orangefarbener Punkt auf dem Screenshot). Diktat (`composer-dictation.js`) und Sprachmodus (`composer-tools.js`) gaben bei diesem Fehler sofort auf, obwohl das eigene Ohr (MediaRecorder → Brücke → Whisper) bereits aufnahm. | Info.plist Build 4 ohne den Schlüssel; Code-Pfad `onerror` → `enterVoiceFallback` |
| Mikrofon bleibt an | `voice-ear.js start()` wartet auf `getUserMedia`; ein `cancel()`/`finish()` in dieser Zeit legte danach trotzdem einen Recorder an, den niemand stoppte. | Test „cancel() während getUserMedia“ |
| Bild „?“ | Beim Speichern tauschte `lagereMedienAus()` das fertig angezeigte `data:`-Bild gegen die Serveradresse `/api/chat-medien?id=…`, die nur mit Anmelde-Schlüssel antwortet (401). Die Anzeige hing danach ganz am Netz (Anzeige-Adresse holen); über LTE ohne Zeitgrenze blieb das kaputte Bildsymbol stehen. Im Simulator (WLAN) trat es nicht auf, Bild und Speicherung (IndexedDB, Server-Medium) waren korrekt. | IndexedDB im Simulator: `src="https://api.smejj.com/api/chat-medien?id=…"`; `curl` ohne Schlüssel → 401 |
| Code-Bereich: dunkle Fläche oben | Der in den Code-Bereich übernommene `#startLog` scrollte selbst (`.start-log{overflow:auto;border-top:1px}`) unterhalb des 56-px-Polsters (plus Safe Area) des Halters: Text wurde dort abgeschnitten, darüber leere Fläche mit Trennlinie. | Browser 440 × 956: `#startLog top 60, overflow auto, border-top 1px` |

Der Chat selbst hat oben keine Fläche: `.mobil-kopfglas` ist seit V15 am Handy ausgeblendet (`display:none !important`), gemessen: kein festes Element mit Hintergrund.

## Änderungen

- `public/composer-dictation.js`: bei `not-allowed`/`service-not-allowed` und aufnehmendem Ohr läuft die Sitzung als reines Ohr weiter; beim Stopp kommt der Text (Budget 30 s). Ist auch das Mikrofon gesperrt: sauberes Ende mit Hinweis.
- `public/voice-ohr-solo.js` + `public/composer-tools.js`: Sprachmodus übernimmt in diesem Fall aufs Solo-Ohr (Parallel-Ohr wird freigegeben, Barge-in schweigt im Ohr-Modus).
- `public/voice-ear.js`: Laufnummer, kein doppelter Start, spät gelieferte Mikrofone werden sofort gestoppt; `finish({budgetMs})`.
- `public/chat-medien.js`: frisch erzeugtes Bild bleibt ohne Netz sichtbar; Zeitgrenze 15 s für jeden Medien-Abruf; Neuversuch bei `online`/Sichtbarwerden; Ladefehler → neuer Abruf oder sichtbarer Hinweis „Bild nicht vollständig geladen“ statt „?“ (mit Schleifenschutz).
- `public/mobil-dock.js` Regel (17): im Code-Bereich ist der Halter der einzige Scroller, keine Linie, kein Kopfrand — der Verlauf läuft bis an die Oberkante.
- iOS-Hülle `~/smejj-ios`: `NSSpeechRecognitionUsageDescription` ergänzt, Build 5 (Rollback: `Info.plist.vor-build5-2026-09-23`).
- Keine Datenbank-, Storage- oder Schema-Änderung. Bestehende Bilder bleiben unverändert.

## Schutz

`tests/geraetebefund-2026-09-23.test.mjs` (9 Tests, u. a. 12-facher Diktat-Stresstest) steht in der
Kaskaden-Testliste. Diese Stellen dürfen ohne schriftliche Freigabe des Betreibers nicht geändert,
entfernt oder abgeschwächt werden: Ohr-Übernahme bei verweigerter Erkennung (Diktat + Sprachmodus),
Laufnummer im Server-Ohr, Anzeige-Gedächtnis für `data:`-Bilder, Zeitgrenzen/Neuversuch/Hinweis in
`chat-medien.js`, Regel (17) in `mobil-dock.js`, `NSSpeechRecognitionUsageDescription` der iOS-Hülle.

## Auslieferung und Nachweis

- LIVE als `smejj-shell-v967` und (Wiederholungslauf, gleicher Inhalt) `smejj-shell-v968`, Kaskade `~/smejj-messwerkzeug/runde21.sh`. Anker `schutz-100-2026-09-23-app-v968` (App cb2689ca, Bauzweig 11544069, Frontend 42d8f9c). Offline-Liste vollständig, Schutz-Echtheit 48/48.
- Tests: 9 neue + 126 betroffene grün; gesamte Sammlung 4338/4346 — die übrigen Fehler gab es schon am Ausgangsstand (Autopilot-Läufer, E2E-Wächter mit Netz, Manifest-Abgleich) bzw. waren die Sperren vor dem Stempel.
- Simulator iPhone 17 Pro Max, Build 5 gegen live v968: Code-Bereich läuft bis hinter die Uhrzeit, keine Fläche/Linie; Chat oben transparent; Diktat schreibt ins Feld (Simulator liefert nur Platzhalter „Test“); erzeugtes Bild „Antalya“ nach App-Neustart sichtbar.
- iOS Build 5 (1.0, `NSSpeechRecognitionUsageDescription`) hochgeladen: Delivery 96750213-3bb1-4bdc-9fc3-4e27c63a3391, App Store Connect `VALID`, TestFlight intern `IN_BETA_TESTING`.
- Android: TWA (Chrome-Hülle um smejj.com) — alle Fixes wirken dort sofort ohne neues Bundle.

## Offen

- Echtes iPhone: Diktat live Wort für Wort erst mit Build 5 (Spracherkennung braucht den neuen Info.plist-Eintrag); mit Build 4 greift jetzt das eigene Ohr (Text nach dem Stopp).
- Bild-Wiederverwendung auf dem Server (Retry ohne neu malen) ist nicht gebaut; ein abgerissener Bild-Strom zeigt jetzt einen klaren Hinweis statt „?“.

## Nachträge

- **Runde 22 (v969):** Nach einem Neustart stand über der Bild-Antwort eine zweite, leere Aktionsleiste (Befund der Versionswache und im eigenen Simulator). Ursache: `chat-store.js renderEntriesInto` legte jeden Eintrag als `entry assistant` an, `.chat-schritte` ging verloren. Fix: Speichern merkt `art:"schritte"`, Altbestand wird am HTML erkannt. Versionswache: v969 grün, genau eine Leiste. Anker `schutz-100-2026-09-23-app-v969`.
- **Runde 23 (v970):** Betreiber-Freigabe „ja, Schreibfeld auf 148 px begrenzen“. `mobil-dock.js` Regel (4b) mit drei IDs schlägt die 320-px-Regel des Start-Stils. Live gemessen (440 × 956, SW v970): 300 → 148 px, Feld scrollt innen. Anker `schutz-100-2026-09-23-app-v970`.
- Schutz erweitert: Test (4) Arbeitsschritte-Art, Test (5) 148-px-Grenze (11 Tests in `tests/geraetebefund-2026-09-23.test.mjs`).
