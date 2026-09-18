# Komplettprüfung A bis Z — 19.09.2026, Stand SW v902

Auftrag des Betreibers: „prüf alles nochmal … teste die gesamte App, Web, PWA, iOS mit
Simulator, Android mit Emulator, von A bis Z … Danach alles 100 % schützen."

Geprüfter Stand:
- Arbeitszweig `feature/design-start-chat-2026-09-13` → `44c4d6e9`
- Bauzweig `feature/auth-redesign-github-magiclink` (Zeabur) → `ef9285c1`
- Frontend `SmejjCom/smejj-app-frontend` main (GitHub Pages) → `13e561d`
- Service Worker live: `smejj-shell-v902` auf smejj.com

## 1. Code- und Regelprüfung
| Prüfung | Ergebnis |
|---|---|
| `npm run check:all` | EXIT 0 |
| `npm audit` | 0 Schwachstellen |
| Dependabot-Alerts | 0 offen |
| Secret-Scanning (beide Repos) | 0 Funde |

## 2. Live = Code
Byte-Vergleich der ausgelieferten Dateien gegen den Frontend-Commit:
`index.html`, `sw.js`, `assets/start-styles.css`, `willkommen.html`,
`assets/offline-banner.js` — identisch.

## 3. Routen und Schnittstellen (live gemessen)
| Adresse | Code |
|---|---|
| `/`, `/willkommen.html`, `/hilfe.html`, `/admin/` | 200 |
| `/manifest.webmanifest`, `/sitemap.xml` | 200 |
| `/impressum.html`, `/datenschutz.html`, `/agb.html` | 200 |
| `api.smejj.com/api/health` | 200 |
| `api.smejj.com/api/status` (ohne Anmeldung) | 401 |

Sicherheits-Kopfzeilen auf api.smejj.com: 5 von 5 gesetzt.

## 4. Web (Chrome, angemeldet)
Neue Frage gestellt → Antwort „Rom." nach 18 s. Zwei Einträge, zwei Leisten,
Menüs vollständig im Bild (11 bzw. 13 Punkte), `elementFromPoint` trifft `menu`,
keine Konsolenfehler, Cache `smejj-shell-v902`.

## 5. Android (Emulator, echter Fingertipp)
Frage „Pruefung 19.09. v902 Nenne die Hauptstadt von Spanien in einem Wort."
→ Antwort „Madrid". Bedienung über `adb shell input`, kein Fehlerbild.

## 6. iPhone — Safari
`https://smejj.com/willkommen.html` im Simulator-Safari: sauberer Aufbau,
**kein** falscher Offline-Balken.

## 7. iPhone — installierte App (Webclip, PWA)
Webclip vom Home-Bildschirm frisch gestartet (Belege
`scratchpad/i19-app1.png`, `i19-app2.png`):
- Landeseite baut vollständig auf, Statusleiste passt zum dunklen Hintergrund.
- Nach 30 s Beobachtung **kein** Offline-Fehlalarm — die Nachfrage-Schleife des
  Bandes (alle 15 s) lief mindestens zweimal durch.

Damit ist der Fehlalarm aus dem Bericht vom 18.09. auch in der installierten App
gegengeprüft.

## 8. Sicherung
- Codeberg-Spiegel angestoßen (Lauf `35401386936`, Zweig Bauzweig).
- Schutzanker `schutz-100-2026-09-19-*` auf allen drei Ständen gesetzt.

## Was nicht beweisbar ist
Kein echter IPv6-Abruf über eine IPv6-Leitung (der Mac hängt an IPv4).
Keine pauschale Aussage „100 % sicher" — belegt ist der Zustand der oben
aufgeführten Messungen zum 19.09.2026.
