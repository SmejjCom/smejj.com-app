# Restarbeiten A bis Z — smejj.com, 15.09.2026

Auftrag des Betreibers: „Ich gebe dir alle Rechte von A bis Z 100 %. Mach komplett 100 % fertig,
lass nichts offen." Ausgangsstand: geschützter Stand `stabil-2026-09-15-freigabe-1a-1i-v881`.
Parallel arbeitete die Master-Audit-Sitzung (Brücke v153, Betriebswache) — abgestimmt, keine Überschneidung.

## Erledigt und live nachgewiesen

| Punkt | Umsetzung | Nachweis live |
|---|---|---|
| smejj 1.1 / Übersetzen 33–84 s | Textarbeit hinter Doppelpunkt (Übersetzen, Verbessern, Korrigieren, Umformulieren, Kürzen) löst keine Websuche aus — Server, Brücke v154, Gleichlauf-Test | „Übersetze ins Englische: Guten Morgen …" 0,8 s (vorher 33–84 s) |
| Such-Hänger | Gesamtfrist 15 s für die Websuche im Agenten-Weg, danach ohne Web-Kontext | Unit-Test; Suche läuft im Hintergrund weiter |
| Rückfall-Kopfzeile unehrlich | glm-4.5-flash meldet sich als glm-4-5-flash; `x-smejj-model-fallback` true bei jedem Kettenwechsel | Router-Tests 38/38 |
| S6 Datenleck Status-Routen | /api/health, /api/models*/status, /api/workers/preflight maskiert für Anonyme (Bucket, Host, Env-Namen, Präfixe, Worker-Fakten, Kostenpolitik); Brücken-/health ohne Ziel-Host, Env-Namen, befreite Konten, Modellnamen | 0 Treffer auf 4 Endpunkten; Statusseite 200 |
| Private Adressen | Kaufadresse eines Kunden aus Code-Kommentar und Testdaten (Admin-Lock gestempelt); Werkstatt-Backlog maskiert Adressen beim Erzeugen; aktuelles Backlog und Audit-Notiz maskiert | `git grep` im Repo: keine privaten Adressen mehr |
| Chat-Abgleich | Abgleichsliste nennt Grabsteine, Client holt gelöschte Chats nicht erneut | Ruhezustand: 0 Einzelabrufe je Laden (neues Gerät holt 324 Chats in 6 Ladevorgängen nach) |
| Entwurf geht beim Neuladen verloren | Entwurf-Erhalt (lokal, 24 h, nach Senden/Abmelden weg), nachgeladen — Startgewicht in Toleranz | „Entwurf live 15.09." nach Neuladen wieder im Feld |
| 320-px-Kachel | „Programmieren" nicht mehr abgeschnitten (nur max-width 360px) | 8/8 Kacheln ok bei 320 px |
| Dependabot accelerate | 1.1.1 → 1.15.0 + Importprobe im Dockerfile, Rücksetzzweig `sicherung/maler-vor-cve-20260915` | Zeabur gebaut, echtes Bild 512×512 in 49 s |

| Bild-Verstehen live tot (neu gefunden) | Groq schaltete `qwen/qwen3.6-27b` ab (404); die Spur fiel still auf den Text-Weg. Brücke v155: Modell-Liste mit Nachfolger `qwen/qwen3.8-27b`, Wechsel nur bei 404/400 | Direkt: „Das Bild zeigt die Benutzeroberfläche …" via groq:qwen/qwen3.8-27b; Anhang-Test 2/2 |
| Dateiwahl vor dem Anbinden | Beide Dateifelder übernehmen eine bereits getroffene Wahl, wenn das Modul später bindet (SW v883) | Unit-Test; Live-Rennen nicht erzwingbar, Anhänge grün |
| Kurze Fragen 21–60 s, Autopilot Nr. 29 rot (neu gefunden) | Ursache gemessen, direkt beim Anbieter mit gleichem Schlüssel: glm-4.5-flash (Freikontingent) 27–60 s bis zum ersten Zeichen, glm-5.2 2,5–4 s. Schnell- und Webprofil gingen an glm-4.5-flash. Jetzt führen alle Profile glm-5.2, glm-4.5-flash bleibt Zweitversuch bei leerem Kontingent (Bauzweig 76d04392). Brücke v156: Reserve im laufenden Strom bekommt sofort Lebenszeichen und Restfrist statt 60 s Stille. Kopfzeile `x-smejj-model-fallback` stand bei Auto immer auf true (d5295bbf) | Control direkt 4,6–5,5 s (vorher 30–45 s); Brücke „Nenne drei Farben." 2,1–3,0 s (vorher 21–60 s); Stabilität 8/8 in 0,8–5,8 s; alle 6 Modelle im Menü antworten richtig |
| Knopf-Detektor Regression | 18 Ansichten, 138 Knöpfe echt geklickt | 0 tot, 0 verdeckt, 0 JS-Ausnahmen |

Stände: SW `smejj-shell-v883`, Brücke `20260915-v156-reserve-frist`; vorher Brücke v155, , Brücke `20260915-v154-textarbeit-health`, Control-Server Bauzweig mit 8368aadd/b88d55db, Bild-Maler b1399880.

## Bewusst offen — mit Grund

0. **Kontingent glm-5.2:** Alle Chats nutzen jetzt das Wochen-/Monatskontingent von glm-5.2 (keine neuen Kosten). Ist es leer, antwortet der Anbieter in 0,6 s mit 429 und die Kette fällt auf glm-4.5-flash — dann wieder langsamer (~30 s), aber nie tot.
1. **Dependabot pipecat-ai (kritisch) und transformers (hoch):** Die Lücken sind im Betrieb nicht erreichbar. smejj-voice nutzt kein LiveKit und wird nirgends gebaut. Der Bild-Maler ruft `save_pretrained` nie auf. pipecat 1.10 hat die Sprachpausen-Erkennung umgebaut (vad_analyzer nicht mehr in TransportParams), eine Migration ohne GPU-Bau wäre ungetestet. transformers 5.10.4 scheiterte zweimal live ('PreTrainedModel'). Beides erst mit einem echten Neubau.
2. **Git-Historie:** Private Adressen stehen noch in alten Commits des öffentlichen Repos. Löschen hieße Historie umschreiben und Force-Push auf geschützte Zweige — Rote Liste, braucht eine ausdrückliche Entscheidung.
3. **Sprachmodus Unterbrechen (Barge-in):** 44 Logik-Tests grün; akustisch mit künstlichem Ton nicht messbar (Spracherkennung liefert nur in etwa jedem vierten Lauf eine Mitschrift) — nur am echten Gerät.
4. **Mac:** Xcode-Lizenz nicht bestätigt, Systemgit streikt (`sudo xcodebuild -license`); Arbeit lief über das Git der Command Line Tools.
5. **Test-Chats im Betreiberkonto:** Die E2E-Läufe schreiben unter der Adresse des Betreibers — im Verlauf stehen viele „E2E-…"-Chats. Nicht gelöscht (Daten-Regel).
6. **Zeabur-API-Schlüssel abgelaufen:** nur der Betreiber kann einen neuen anlegen; Neustarts liefen über die Zeabur-Oberfläche.
