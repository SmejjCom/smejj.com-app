# Salad-Container-Gruppen: was weg kann und was bleiben muss

**Stand:** 2026-09-08 · Aufgenommen beim Bau der
[Verbindungs-Landkarte](VERBINDUNGS_LANDKARTE_2026-09-08.md).

## Die Ausgangslage

32 Container-Gruppen, davon **eine laufend** (`smejj-training`, legitimes
Training). Die übrigen 31 stehen still. 20 davon ruhen seit über 30 Tagen,
die ältesten seit 66 Tagen — Reste aus der Zeit vor dem Zeabur-Umzug
(Betreiber-Entscheidung 2026-08-12: „Neues nur noch auf Zeabur, Salad ist
Auslaufmodell", siehe [salad-reste-inventar.md](../salad-reste-inventar.md)).

**Wichtig zur Erwartung: Aufräumen spart kein Geld.** Gestoppte Gruppen kosten
bei Salad nichts. Der einzige Gewinn ist Übersicht — und Übersicht ist der
Grund, warum ein vergessener laufender Worker auffällt. Wer 32 Zeilen
überfliegt, sieht die eine laufende; wer 5 Zeilen liest, sieht sie sofort.

## Zuerst gesichert, dann erst löschen

Vor jedem Löschen wurden alle 32 Definitionen gesichert:
[`salad-gruppen-definitionen-2026-09-08.json`](salad-gruppen-definitionen-2026-09-08.json)
— Image, Ressourcen, Kommando, Netzwerk, Neustart-Regel und die **Namen** der
Umgebungsvariablen.

Die **Werte** der Umgebungsvariablen sind bewusst *nicht* enthalten: dort
stünden Schlüssel, und diese Datei liegt in einem öffentlichen Repo. Der
Export bricht ab, wenn ihm etwas Schlüsselähnliches auffällt.

Das heißt auch: Eine gelöschte Gruppe lässt sich aus dieser Datei **fast**
wiederherstellen — Aufbau und Image ja, die Geheimnisse müssten neu gesetzt
werden.

## Was das Werkzeug entfernen würde (11 Gruppen)

Eindeutige Wegwerf-Artefakte aus dem Juli. Sie waren nie Dienste, sondern
einmalige Läufe und Testfassungen:

| Gruppe | Art | ruht seit |
|---|---|---|
| `smejj-job-426689a9…` | Einmal-Job | 58 Tagen |
| `smejj-job-6d4b971e…` | Einmal-Job | 58 Tagen |
| `smejj-job-78640363…` | Einmal-Job | 58 Tagen |
| `smejj-job-8662e958…` | Einmal-Job (**failed**) | 58 Tagen |
| `smejj-job-a44459ed…` | Einmal-Job | 58 Tagen |
| `smejj-job-ea19ee14…` | Einmal-Job | 57 Tagen |
| `smejj-control-rc9-staging` | Testfassung | 58 Tagen |
| `smejj-control-agent-deadline-rc2-staging` | Testfassung | 57 Tagen |
| `smejj-control-pages-layout-rc3-staging` | Testfassung | 57 Tagen |
| `smejj-control-chat-agent-rc1-staging` | Testfassung | 33 Tagen |
| `smejj-browser-agent-rc1-staging` | Testfassung | 57 Tagen |

Sechs Einmal-Jobs mit Hash-Namen (einer davon fehlgeschlagen) und fünf
Testfassungen, deren Namen ihren Zweck selbst benennen.

### Drei, die das Muster absichtlich nicht fängt

`smejj-control-pages-layout-rc3-retry-20260712`,
`…-rc3-final-staging-20260712` und `…-rc3-final2-staging-20260712` sind
offensichtlich ebenfalls Testreste — ihr Name endet aber auf ein Datum, nicht
auf `-staging`. Das Muster greift bewusst nur am Wortende: **lieber eine zu
wenig als eine zu viel.** Ein Muster, das „enthält irgendwo staging" prüft,
würde eines Tages etwas erwischen, das gebraucht wird.

Wer diese drei loswerden will, entfernt sie von Hand in der Salad-Oberfläche.

## Was NICHT gelöscht werden darf

### Läuft oder ist frisch

| Gruppe | Warum |
|---|---|
| `smejj-training` | **läuft gerade** — Training aus einer parallelen Sitzung |
| `con-job` | con ruht auf Betreiber-Wunsch; nicht anfassen ohne neue Ansage |
| `smejj-spiegel` | 3 Tage alt |
| `smejj-lora-trainer-batch` | Trainingskette, wird wieder gebraucht |

### Dienste ohne Zeabur-Gegenstück — hier wäre Löschen echter Verlust

Gegengeprüft am 08.09.: unter `*.zeabur.app` antwortet für diese vier
**nichts** (404). Die Salad-Definition ist die einzige, die existiert:

| Gruppe | Image | Ersatz auf Zeabur? |
|---|---|---|
| `smejj-voice-stt` | `hwdsl2/whisper-server:cuda` | **nein** (404) |
| `smejj-voice-tts` | — | **nein** (404) |
| `smejj-remote-browser` | — | **nein** (404) |
| `smejj-llm-qwen3` / `-v2` | — | **nein** (404) |

Wer diese löscht, verliert eine funktionierende GPU-Konfiguration (Whisper mit
vier GPU-Klassen, Speicher, Kommandozeile), die neu zu bauen Arbeit wäre.

### Abgelöste Dienste — löschbar, aber ohne Eile

`smejj-control`, `smejj-chat-bridge-live`, `smejj-chat-bridge-v88-live`,
`smejj-chat-bridge-v88b-live`, `smejj-remote-browser-live`,
`smejj-remote-browser-bridge-live`, `smejj-maus-engine`,
`smejj-control-staging-codex`, `smejj-control-chat-agent-rc1-staging`,
`smejj-fast-1`.

Diese laufen heute auf Zeabur. Das Inventar vom 13.08. hält aber ausdrücklich
fest, dass der Salad-Control-Server als Rückfall diente. Sie zu löschen ist
vertretbar — aber es ist eine eigene Entscheidung, keine Aufräumarbeit
nebenbei.

## Das Werkzeug

```bash
node scripts/diagnose/salad-gruppen.mjs
```

Zeigt alle Gruppen mit Zustand und Ruhezeit — ohne etwas zu verändern.

Zum Löschen der 13 oben genannten Gruppen, **nur nach ausdrücklicher
Freigabe**:

```bash
node scripts/diagnose/salad-gruppen.mjs --loeschen-wegwerf --ich-bin-sicher
```

Beide Schalter sind nötig. Das Werkzeug löscht **ausschließlich** Namen, die
exakt dem Muster `smejj-job-<32 Hex>` entsprechen oder auf `-staging`
enden — alles andere wählt es nie aus, egal was auf der Kommandozeile steht
(fail-closed). Vorher prüft es, dass die Sicherungsdatei existiert.
