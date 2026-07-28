# job_statusseite_20260728 — öffentliche Statusseite /status.html

**Freigabe:** „Ja" auf den Vorschlag „Statusseite (läuft der Control-Server, die
Chat-Bridge, die Stimme?)" (Wof Kadavanich, 2026-07-28), plus Master-Prompt.
Der Punkt stand seit QA-Welle 1, Abschnitt 8.2 als „sinnvolle Verbesserung"
offen — dort schon mit der Auflage „als statische Seite mit clientseitigem
Health-Abruf".

**Arbeits-Commits:** `6d06605`, `2bdc970`, `62d55a4` in `SmejjCom/smejj.com-app`
**Live-Commit:** `f3a1297` in `SmejjCom/smejj-app-frontend`
**Live-Rückfall:** `ebab85d`
**Start-Lock-Backups:** `backups/start-design-lock/2026-07-28T09-22-46-701Z/`,
`…T09-24-57-688Z/`, `…T09-34-41-986Z/`
**Belege:** `backups/statusseite-live-2026-07-28-v172.png`,
`backups/statusseite-ausfall-2026-07-28.png`,
`docs/benchmarks/webvitals_statusseite_2026-07-28.json`

---

## Architektur

Die Seite liegt als statische Datei auf GitHub Pages und fragt die Dienste
**direkt aus dem Browser des Besuchers** ab. Es gibt **keinen Status-Server**.

Das ist keine Bequemlichkeit, sondern die einzige Bauweise, die den Zweck
erfüllt: Ein Dienst, der Zustände sammelt, wäre selbst ein Single Point of
Failure — fällt er aus, sagt die Statusseite nichts mehr, und zwar genau dann,
wenn sie gebraucht wird. Zusätzlich erzeugt der gewählte Weg **null Dauerlast**
(Vorgabe: der Control Server darf keine Last tragen, die clientseitig lösbar
ist) und **keine neuen Kosten**.

Preis dieser Entscheidung, offen benannt: Was der Besucher sieht, ist *seine*
Verbindung, kein Mittelwert über alle Nutzer. Liegt es an seinem Netz, zeigt die
Seite das genauso an. Der Text auf der Seite sagt das ausdrücklich.

## Ordnerstruktur

```
public/
  status.html          neu — Seite, Meta-CSP mit den drei Hosts
  status.js            neu — Abfrage, Einstufung, Anzeige (im Precache)
  static-pages.css     erweitert um den Block html.p-status
  auth-gate.js         /status in PUBLIC_PATHS
  index.html           Link „Betriebsstatus" in der Rechtliches-Zeile
  sw.js                v172, status.html + status.js im Precache
  impressum.html · datenschutz.html · en/legal-notice.html · en/privacy.html
                       Fußzeilen-Link
src/
  shared/platform.js       ROUTES.status + CSP-connect-src um die drei Hosts
  http/staticServing.js    /status.html in der Erlaubnisliste
tests/
  statusseite.test.mjs neu — 9 Zusicherungen, in check:frontend
```

## Was geprüft wird

| Dienst | Endpunkt | kritisch |
|---|---|---|
| Website | — (die Seite wird ja gerade angezeigt) | ja |
| Anmeldung und Konto | `redbean-caesar…/api/health` | ja |
| Chat und Assistent | `smejj-chat-bridge.zeabur.app/health` | ja |
| Browser-Ansicht | `loganberry-fruit…/health` | nein |

Nur `GET` auf reine Gesundheits-Endpunkte: keine Anmeldedaten, keine
Modellaufrufe, keine Kosten. Zeitgrenze 8 s, Selbstaktualisierung jede Minute —
aber nur, solange der Reiter im Vordergrund ist.

## Vier Entscheidungen, die den Zweck sichern

1. **Öffentlich, nicht hinter dem Anmelde-Gate.** Wer wissen will, ob die
   Anmeldung läuft, kann sich per Definition gerade nicht anmelden.
2. **Im Precache.** Die Seite muss auch bei totem Netz noch anzeigbar sein.
3. **Zustände als Wort, nicht nur als Farbe** („läuft", „gestört", „nicht
   erreichbar") — WCAG 1.4.1.
4. **`noindex`.** Ein Momentwert gehört nicht in den Suchindex; über die
   Fußzeilen bleibt die Seite trotzdem für jeden erreichbar.

## Ein Fehler, den erst der lokale Browsertest zeigte

Die Meta-CSP der Seite allein reichte nicht: Der eigene Node-Server sendet eine
**eigene** CSP-Kopfzeile, und bei zwei Regelwerken gilt die **Schnittmenge** —
`connect-src 'self'` blockierte alle drei Abfragen, die Seite meldete falschen
Alarm. Live wäre es nie aufgefallen, weil GitHub Pages keine CSP setzt.
Behoben in `src/shared/platform.js`; der Test erzwingt jetzt, dass beide Listen
dieselben Hosts nennen.

Lokal bleibt eine Einschränkung, die **richtig so** ist: Die Dienste erlauben
per CORS nur `https://smejj.com` als Herkunft. Von `127.0.0.1` sind sie
unerreichbar — das ist Absicht und wird nicht aufgeweicht. Die Seite zeigt dann
korrekt „nicht erreichbar".

## Verifikation

| Prüfung | Ergebnis |
|---|---|
| `npm run check:all` (isolierter Klon von `62d55a4`) | grün |
| `npm run release:preflight` (ebenda) | grün |
| `check:start-lock` / `check:favicon-lock` | OK, neu eingefroren (24 HTML-Seiten) |
| Live, abgemeldet, `/status.html` | **„Alle Dienste laufen"**, 0 Fehler |
| Messwerte live | Anmeldung 224 ms · Chat 289 ms · Browser 603 ms |
| Gegenprobe: Hauptdienst tot | „Ein Hauptdienst antwortet nicht — Teile der App funktionieren nicht." |
| Gegenprobe: nur Zusatzfunktion tot | „Die Hauptfunktionen laufen. Eine Zusatzfunktion ist gerade gestört." |
| Knopf „Jetzt neu prüfen" | funktioniert |
| App-Regression (Klickpfad) | 0 Fehler, 0 von 22 Tab-Stationen außerhalb |
| Offline-Regression | Shell 96 ms, keine Seitenfehler |
| Web-Vitals kalt | TTFB 70 ms · LCP 340 ms · CLS 0 · INP 40 ms · 273 KB |
| Web-Vitals warm | TTFB 88 ms · LCP 192 ms · CLS 0 · INP 48 ms · 38 KB |

Alle Performance-Budgets eingehalten.

## Beinahe-Unfall: 15 Sprachdateien

Beim Abgleich mit dem Live-Repo standen **15 i18n-Dateien** als „geändert" da.
Die Prüfung der Richtung — genau die Lehre aus `job_qa_wellen_1_3` — zeigte:
Live ist dem Repo **zwei Schlüssel voraus** (`Google-Anmeldung wird
abgeschlossen …` und die zugehörige Fehlermeldung). Ein Upload hätte diese
beiden Übersetzungen in **15 Sprachen gelöscht**. Die Dateien wurden aus dem
Deploy genommen; live ist unverändert.

**Das Repo hinkt hier weiterhin hinterher** — das ist ein offener Punkt, aber
keiner, den ein Deploy lösen darf: Die richtige Richtung ist, die zwei Schlüssel
aus dem Live-Stand ins Repo zu übernehmen, nicht umgekehrt.

## Zweiter Fund: derselbe Cache-Name für zwei Precache-Listen

Statusseite und die Chat-Fassungen einer parallelen Sitzung landeten beide unter
`v171` — zwei verschiedene `SHELL`-Listen unter **einem** Cache-Namen. Wer
`v171` schon installiert hatte, hätte `status.html` nie in den Cache bekommen.
Deshalb der Pflicht-Sprung auf **v172**. Genau dafür ist die Regel da:
geänderter Precache = neue Version.

## Nebenbefund mitgenommen

`public/auth/auth-page.js` trug den Enumeration-Fix (`verificationMailExpected`
statt `mail.sent`) noch nicht live — der Control-Server war bereits umgestellt,
die Oberfläche nicht. Jetzt beide.
