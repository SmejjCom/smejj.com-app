# smejj.com — Infrastruktur von A bis Z

Bericht zum Betreiber-Auftrag vom 2026-09-05. Alle Zahlen sind gemessen, nicht
geschätzt; wo etwas nicht messbar war, steht das da.

## 1. Was schon da war

| Bereich | Stand |
|---|---|
| Model Router | 16 Anbieter im Katalog, Fallback-Kette mit 13 grünen Tests |
| Autopiloten | 83, alle 30 Minuten im Takt |
| IDrive e2 | 939 GB von 2 TB (46 %), Speicherwache läuft |
| API-Schlüssel | 72 im Code, keine hartcodiert, keine im Frontend |
| Webhooks | 1 Stripe-Empfänger, kein Proxy, kein Zweitweg |
| Eigener Server | **keiner** — 14 Zeabur-Container, kein systemd |

## 2. Der wichtigste Befund

**Die Plattform hing an einem einzigen Anbieter.**

Von 6 Modellen in der Registry war genau eines aktiv (`glm-5-2` bei Zhipu),
alle anderen `inactive`. Von 14 Anbietern hatten **zwei** einen Schlüssel.

Am 2. September fiel Zhipu zweimal aus. Der Chat stand stundenlang — bei 64
grünen Ampeln, weil niemand die Kettenlänge maß.

**Die Fallback-Technik war nie das Problem.** Sie ist fertig und geprüft. Es
fehlten Glieder.

## 3. Was neu ist

### Die Kette zählt ihre Glieder (Autopilot Nr. 71, erweitert)

Kein neuer Autopilot — der vorhandene wurde erweitert, wie der Auftrag es
verlangt. Er nennt die Kettenlänge in **jeder** Meldung, auch in der grünen:

```
ACHTUNG: nur 2 von 14 Anbietern hat einen Schlüssel — fällt einer aus, steht der Chat
```

### Schlüssel-Landkarte (`npm run diagnose:schluessel`)

Beantwortet die Frage aus dem Auftrag — „Wie viele Stellen verwenden API X?" —
aus dem Quelltext über 1.153 Dateien:

```
Stellen  Dateien   Hier    Name
     51       41     ja    IDRIVE_E2_ACCESS_KEY
                    Sonstiges (25), API-Route (6), Werkzeug (6), Speicher (4) …
```

**Werte werden nie ausgegeben** — nur Namen, Zahlen und ja/nein.

### Webhook-Zweitweg (Smee) + Autopilot Nr. 84

Ein zweiter Weg für Webhooks über einen Smee-Kanal, mit drei Sicherungen: ohne
Geheimnis geschlossen, zeitkonstanter Vergleich, Signaturprüfung bleibt beim
echten Handler. Ein Ereignis wirkt nur einmal, auch wenn es über beide Wege
kommt. Autopilot Nr. 84 prüft die Strecke — und dass der eigene Eingang Fremde
abweist.

Live bewiesen: Ereignis durch den echten Kanal, Signatur unverändert
angekommen, Wiederholung erkannt und verworfen.

### Zweiter Zahlungsweg (vorbereitet)

Stripe hatte genau einen Empfänger, und der zeigte auf die alte Zeabur-Adresse.
Ein zweiter direkter Empfänger auf `api.smejj.com` liegt als Doppelklick-Datei
bereit; der Server akzeptiert dafür beide Signatur-Geheimnisse.

**Nicht über Smee** — ein Smee-Kanal ist öffentlich lesbar, und
Zahlungsereignisse enthalten Beträge, Kunden-Kennungen und E-Mail-Adressen.

## 4. Das Modell-Lager auf IDrive e2

939 GB von 2 TB, 46 % — kein akutes Kostenrisiko.

| Ablage | GB | Bemerkung |
|---|---|---|
| `glm-5-2-fp8` | **703,8** | 75 % des Lagers; genutzt wird die API, nicht diese Datei |
| `openai_gpt-oss-20b` | 38,5 | |
| `google_gemma-4-26B-A4B-it` | 35,0 | |
| `microsoft_phi-4` | 27,3 | |
| con-Basismodell (Qwen3.8-27B) | 55,6 | in Benutzung, con trainiert damit |
| `smejj-1-0` | 13,8 | alte Trainingsversuche, kein fertiges Modell |
| **`models/staging/qwen3-4b-instruct`** | **8,1** | **neu — Basis für smejj 1.1** |
| `zai-org_GLM-5.3` | 0,0 | **abgebrochener Download** — nur Metadateien |

Nichts wurde gelöscht (Betreiber-Regel: keine Modelle entfernen).

## 5. Sicherheit

Gesucht in Quelltext, Frontend und ausgelieferten Dateien:

| Geprüft | Ergebnis |
|---|---|
| Hartcodierte Schlüssel | keine |
| Schlüsselwerte im Frontend | keine |
| Werte in öffentlich abrufbaren Dateien | keine |
| Schlüssel in Protokollen | keine |
| Verwaiste Schlüssel | 1 (`CLAUDE_CODE_MESSAGING_TOKEN`, gehört zum Werkzeug) |

## 6. Was offen bleibt — und warum

| Punkt | Warum ich es nicht abschließen konnte |
|---|---|
| Smee scharf schalten | Zeabur-Token abgelaufen; Dienst kann nur der Betreiber anlegen |
| Zweiter Zahlungsweg eintragen | Änderungen am Live-Zahlungskonto blockiert der Sicherheitsfilter — richtig so |
| Kette verlängern | Jeder Schlüssel braucht eine Anmeldung beim Anbieter |

Für alle drei liegen Doppelklick-Dateien bzw. fertige Werte bereit.

## 7. Was der Auftrag verlangte und was daraus wurde

| # | Auftrag | Stand |
|---|---|---|
| 1 | Gesamtsystem analysieren | erledigt, Zahlen oben |
| 2 | Alle API-Key-Stellen finden | 72 Schlüssel, Landkarte als Befehl |
| 3 | Zentrale Verwaltung | vorhanden (BYOK verschlüsselt); Betriebsschlüssel im Portal |
| 4 | Kostenlose APIs | 9 Anbieter mit Gratisstufe, eigenes Dokument |
| 5 | Automatisches Failover | Technik vorhanden und getestet; es fehlen Schlüssel |
| 6 | Intelligenter Router | vorhanden (Profile, Reihenfolge, Schlüsselvorrat) |
| 7 | Eigene Modelle getrennt | Versions-Takt Nr. 83, Register auf e2 |
| 8 | Modelle auf e2 finden | 13 Ablagen aufgeschlüsselt, Tabelle oben |
| 9 | e2 als zentraler Speicher | war schon so |
| 10 | e2 ersetzt kein RAM | berücksichtigt — Smee lädt keine Modelle |
| 11–13 | Autopilot für APIs/Modelle | vorhandene erweitert statt neue gebaut |
| 14–17 | Admin-Übersicht | Landkarte + Kettenlänge in der Ampel |
| 18–24 | Smee | gebaut, Kanal erstellt, Strecke live bewiesen, Nr. 84 |
| 25 | Kostenoptimiert | nichts Kostenpflichtiges aktiviert |
| 26 | Kein Single Point of Failure | **gemessen und benannt** — das war der Hauptbefund |
| 27 | Ressourcen | Smee ohne Abhängigkeiten, 64 MB Heap |
| 28 | Leistungsmessung | vorhanden (Nr. 01, 75, Antwort-TÜV) |
| 29 | End-to-End-Tests | Smee-Strecke live; Router-Fallback 13 Tests |
| 30–31 | Autopilot-Zustand | 84 Autopiloten mit eigener Ampel |
| 32 | Sicherheit | geprüft, keine Funde |
| 33–34 | Dokumentation, Bericht | dieses Dokument |

## 8. Wenn du nur eine Sache tust

**Hol dir zwei kostenlose Schlüssel** (Gemini und Cerebras) und trag sie im
Portal ein. Damit hat die Kette vier Glieder statt zwei, und ein
Anbieter-Ausfall legt den Chat nicht mehr lahm.

Die Anleitung steht in `ANBIETER_KETTE_KOSTENLOS_2026-09-05.md`.
