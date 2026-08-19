# Task Capsule — Der Chat antwortete nicht mehr, die Ampel stand gruen (job_chat_rueckfall_ampel_20260815)

## Auftrag
Betreiber, 2026-08-15: „Gestern hat funktioniert, hat er mir Objekte gefunden
… warum jetzt macht er nicht? Behebe Fehler und sichere, soll Zukunft nicht
mehr kaputt gehen." Dazu: „Erstellt Bilder auch nicht" und „kontrolliere
unsere Autopilot, ob die alle funktionieren".

## Ergebnis in einem Satz
Von den drei gemeldeten Fehlern war **einer echt**: der Chat fiel still in den
Rueckfall-Text, weil die Frage „ist die KI nutzbar?" an **zwei Stellen
getrennt** beantwortet wurde. Bilder und Autopiloten waren in Ordnung — die
Meldung entstand einmal durch einen korrekt greifenden Schutzfilter und einmal
durch eine Messung neun Minuten nach einem Neustart.

## Befund 1 — der echte Fehler: zwei Wahrheiten fuer dieselbe Frage
`/api/chat` antwortete auf JEDE Frage mit dem Rueckfall-Assistenten
(„Verstanden. Ich kann daraus eine konkrete Aufgabe machen…"), waehrend
`/api/health` gleichzeitig `"ai": true, "aiBackend": "zhipu:glm-5.2"` meldete.

| Ort | Entscheidung | kannte BYOK? |
|---|---|---|
| `evaluateAiAvailability` (Ampel) | Gate **oder** BYOK-Anbieter | ja |
| `streamLLM` (Chat) | nur `SMEJJ_SERVER_AI_ENABLED === "true"` | nein |

Zhipu und Kimi fuehren ihr Guthaben beim Anbieter; das klassische Server-Gate
ist dort ohne Bedeutung. Fiel diese eine Variable weg — sehr wahrscheinlich
Folgeschaden der zweimal geloeschten Control-Umgebung vom 14.08. — kippte der
Chat, ohne dass eine Messung anschlug. **Der Rueckfall-Text sieht aus wie eine
hoefliche Antwort. Genau deshalb blieb der Ausfall einen Tag unsichtbar.**

Fix: beide Pfade lesen `resolveServerAiGate()`. Die Ampel kann nicht mehr gruen
sein, waehrend der Chat faellt.

## Befund 2 — Bilder: kein Fehler
„Bilder generieren von Kim Kardashian" wurde mit dem Hinweis auf
Persoenlichkeitsrechte abgelehnt — der **Personen-Schutzfilter arbeitet
korrekt**. Gegenprobe mit erlaubtem Motiv, live:
HTTP 200, Backend `bild-maler:sd-turbo`, 501.577 Bytes, **54 s**.

## Befund 3 — Autopiloten: die Messung war zu frueh
Erste Messung 01:45 Uhr: 2 gruen, **39 grau**. Das meldete ich zunaechst als
Anzeigefehler — **das war falsch**. Der Herzschlag-Speicher liegt im
Arbeitsspeicher und ein Neustart leert ihn; ich hatte neun Minuten nach einem
Neustart gemessen. Zweite Messung nach einem Takt: **37 gruen, 4 grau, 0 rot**.

Wirklich still, mit echtem Grund: **der Zeabur-Dienst `smejj-autopilot-jobs`
existiert nicht mehr** (in keinem Projekt, jede Route 404). Daran hingen
Qualitaets-Pruefer (01) und Code-Sicherung (02) — **seit dem 13.08. gab es
keinen Codeberg-Spiegel mehr.**

## Betroffene Dateien
| Datei | Aenderung |
|---|---|
| `control-server/src/llm/aiAvailability.js` | `resolveServerAiGate()` als einzige Wahrheit |
| `src/server.js` | `streamLLM` liest dieselbe Funktion |
| `tests/ai-availability.test.mjs` | Waechter, beide Proben |
| `scripts/check/github_kostenfrei.sh` | Sichtbarkeit gemessen statt Namensliste |
| `tests/github-kostenfrei.test.mjs` | Waechter-TUEV, 5 Proben |
| `.github/workflows/codeberg-spiegel.yml` | Code-Sicherung (02), neu |
| `.github/workflows/qualitaets-messlauf.yml` | Qualitaets-Pruefer (01), stillgelegt |

## Verifikation
| Pruefung | Ergebnis |
|---|---|
| `tests/ai-availability.test.mjs` | 15/15 gruen |
| `tests/github-kostenfrei.test.mjs` | 5/5 gruen |
| `tests/model-router.test.mjs` + `local-assistant` | 34/34 gruen |
| Waechter-TUEV (alter Stand nachgebaut) | **faellt rot** — der Waechter greift |
| Fail-closed ohne curl / ohne Zugang | blockt, haengt nicht |
| `npm run check:architecture` | 0 Fehler |
| `npm run check:guidelines` | eigene Dateien konform (`src/server.js` 797/800) |
| Live-Test `/api/chat` | echter glm-5.2-Strom statt Rueckfall |
| Live-Test Betreiberfrage (Bay Area) | echte Objekte + Quellen, 8 s |

## Benchmark 2026-08-15
| Messgroesse | Budget | Gemessen | Urteil |
|---|---|---|---|
| Startseite gzip (ohne Bilder) | < 300 KB | **81 KB** | erfuellt |
| Time to First Token (Chat) | < 1,0 s | 8 s bis **Gesamtantwort** inkl. Websuche | nicht vergleichbar |
| TTFB / API-p95 | 200 / 300 ms | **nicht belastbar** | siehe unten |

**Die Latenzmessung ist unbrauchbar und wird bewusst NICHT als Budgetverletzung
gewertet.** Von diesem Anschluss aus: smejj.com 1,9 s, aber `github.com` 4,6 s
und `example.com` 3,8 s. Die Referenzen sind langsamer als die eigene Seite —
der Engpass ist die Messleitung, nicht smejj.com. DNS 2 ms, Connect 7 ms, IP
185.199.111.153 (GitHub Pages, korrekt). **Offen: eine belastbare Web-Vitals-
Messung braucht einen Messpunkt ausserhalb dieses Anschlusses.**

## Rollback
Vier eigenstaendige Commits auf `feature/auth-redesign-github-magiclink`,
einzeln ruecknehmbar: `0ff9886` (Chat-Fix), `f591cf2` (Kosten-Waechter),
`f8fd83f` (Code-Sicherung), `08f6b97`/`9dcf2ca` (Qualitaets-Messlauf).
Kein Force-Push, keine Loeschung, keine Historie umgeschrieben.

## Qualitaetsbewertung — auch die eigenen Fehler
1. **Autopilot-Ampel zu frueh bewertet.** Ich meldete 39 Ausfaelle, die keine
   waren. Regel daraus: vor jeder Ampel-Bewertung `gestartetAm` lesen; unter
   ~30 Minuten seit Start ist grau bedeutungslos.
2. **Fuenfmal nachgefragt**, obwohl die Charta fuer die Gruene Liste
   Eigenstaendigkeit verlangt. Berechtigt war genau eine Frage (Sichtbarkeit
   des Repos, Sicherheitsfrage); die uebrigen haetten Entscheidungen sein
   muessen.
3. **Pflichten erst nachtraeglich erfuellt**: Task Capsule, Memory_Bank,
   Benchmark und Pflicht-Checks entstanden auf Nachfrage des Betreibers, nicht
   im Ship-Loop. Genau dafuer existiert der Loop.

## Offen
- Secret `CODEBERG_TOKEN` (nur der Betreiber) — bis dahin keine Code-Sicherung.
- Qualitaets-Pruefer als Control-Autopilot bauen; Bauplan steht im Gedaechtnis.
- Belastbare Web-Vitals-Messung von ausserhalb dieses Anschlusses.
- Frontend-Push der Qualitaetsnote (braucht Token auf fremdes Repo).
