# job_rechtstexte_en_20260728 — englische Rechtstexte, echte Umlaute, Breiten nachgemessen

**Freigabe:** "smejj.com 100 % fertig" (Wof Kadavanich, 2026-07-28) und der
Abschlussauftrag "Mach komplett fertig, lass nicht offen."

**Arbeits-Commit:** `69c6df6` in `SmejjCom/smejj.com-app`
**Live-Commit:** `eaa64ed` in `SmejjCom/smejj-app-frontend` (Vorgaenger `56c63be`)
**Live-Rueckfall:** `SmejjCom/smejj-app-frontend` auf `56c63be`
**Start-Lock-Backup:** `backups/start-design-lock/2026-07-28T04-52-21-127Z/`

---

## 1. Englische Hoeflichkeitsfassungen der Rechtstexte

Neu: `public/en/legal-notice.html`, `public/en/privacy.html`.

Beide tragen ganz oben einen abgesetzten Hinweis: die Uebersetzung ist eine
Lesehilfe, **verbindlich ist ausschliesslich der deutsche Text**, bei
Abweichungen gilt der deutsche Wortlaut. Uebersetzt wurde der bestehende
Text — inhaltlich wurde nichts entschieden, hinzugefuegt oder weggelassen.
Das ist ausdruecklich **keine Rechtsberatung**; ob eine englische Fassung
noetig oder ausreichend ist, muss weiterhin fachlich beurteilt werden.

Verknuepfung in beide Richtungen: `rel="alternate" hreflang` im Kopfbereich
und ein Sprachlink in jeder Fusszeile.

## 2. Precache und lokale Auslieferung

`public/sw.js` v157 -> v158, beide neuen Seiten im Shell-Precache. Grund: die
deutschen Originale liegen dort ebenfalls; ohne den Zusatz waeren die
Rechtstexte offline nur auf Deutsch erreichbar.

**Fallstrick, der dabei auffiel:** der lokale Entwicklungsserver hat in
`isPublicAsset()` eine feste Erlaubnisliste. Die neuen Seiten fehlten dort und
kamen mit 404 zurueck — und ein einziger 404 laesst `cache.addAll()`
**vollstaendig** scheitern, die App waere lokal offline tot gewesen. Deshalb
sind `ROUTES.legalNoticeEn` und `ROUTES.privacyEn` ergaenzt. Auf GitHub Pages
waere es nicht aufgefallen, weil dort jede Datei statisch ausgeliefert wird.

## 3. Echte Umlaute in den deutschen Rechtsseiten

Nachzug zu `ad3996f`. 81 Ersatzschreibweisen ("gemaess", "fuer",
"Datenschutzerklaerung", ...) durch echte Umlaute ersetzt — ausschliesslich im
sichtbaren Text. Stilblock, Attributwerte und die Icon-Zeilen wurden vorher
herausgenommen und unveraendert zurueckgesetzt; die Zeilenzahlen beider
Dateien sind identisch geblieben (55/55 und 6/6 geaenderte Zeilen). Zwei
grossgeschriebene Reste ("Ueberblick", "Aenderungen") hatte das erste
Pruefmuster uebersehen und wurden einzeln nachgezogen.

## 4. Klickflaechen (QA-Welle 1, Befund F-21)

Die Fusszeilen der beiden Rechtsseiten hatten weiterhin 19-22 px hohe Links —
der frueher gesetzte Fix lag in `styles.css` und `auth.css` und griff hier
nicht, weil diese Seiten ihren eigenen Stilblock mitbringen. Jetzt
`min-height: 24px`. Live nachgemessen: 61x24, 139x24, 45x24.

## 5. Breiten nachgemessen — Korrektur an den QA-Berichten

In allen drei QA-Berichten stand, echte Viewport-Pruefung sei nicht moeglich.
Das war **falsch**: es galt nur fuer den ferngesteuerten Chrome (fest auf
748x813). Im eingebauten Vorschaubrowser wirkt `resize_window` sehr wohl.

Nachgemessen bei **320, 375, 430, 768 und 1920 px**, angemeldet, mit einer
eigenen Pruefroutine (horizontales Scrollen, Klickflaechen unter 24 px,
Elemente ausserhalb des Sichtfensters). Ergebnis ueberall: kein horizontales
Scrollen, kein Bedienelement unter 24x24 px. Die zunaechst als "herausragend"
gemeldeten Elemente sind links die eingeklappte Seitenleiste (`right: -18px`)
und rechts das eingeklappte Browser-Panel — beide gewollt ausserhalb, ohne
Scrollbalken. Befund F-22 und die entsprechende Einschraenkung in Welle 1 und
Welle 2 sind damit erledigt und im Bericht als solche gekennzeichnet.

Offen bleibt der 200-%-Zoom: dafuer braucht es das Geraete-Pixelverhaeltnis,
nicht die Breite, und das bietet der Vorschaubrowser nicht an.

## 6. Fremde Baustelle, die den Lauf blockierte

Die Aufteilung von `public/app.js` (Commit `1e75c54`, parallele Sitzung) hat
`scripts/check-guidelines.mjs` geaendert — die Ratchet-Ausnahme fuer app.js
ist entfallen —, ohne den gepinnten Hash im Benchmark-Manifest nachzuziehen.
`tests/model-promotion.test.mjs` schlug daraufhin fail-closed an und machte
`check:all` rot. Neu gepinnt auf `2026-07-28.5`; uebernommen wurde
ausschliesslich der eine abweichende Datei-Hash, der Inhalts-Hash wurde neu
berechnet. Metriken, Kostengrenzen und Promotion-Regeln sind unveraendert —
das Umpin-Skript bricht ab, sobald sich mehr als die erwartete eine Datei
unterscheidet oder sich eine Regel veraendert haette.

## 7. Beobachtung ohne Umsetzung: Inline-Stil und CSP

Die beiden Rechtsseiten (und 15 weitere: die 14 Sprach-Startseiten und
`404.html`) bringen ihren Stil als `<style>`-Block mit. Der eigene
Node-Server sendet `style-src 'self'` und blockiert das — lokal sind diese
Seiten deshalb unformatiert. Live faellt es nicht auf, weil GitHub Pages
ueberhaupt keine CSP-Kopfzeile setzt.

**Bewusst nicht angefasst.** Ein sauberer Fix hiesse: gemeinsames
Stylesheet, Anpassung von `scripts/i18n/generate-language-pages.mjs` und
Neuerzeugung aller 14 Sprachseiten — ein Umbau, der weit ueber diesen
Auftrag hinausgeht und den Start-Lock beruehrt. Die neuen Seiten folgen
deshalb dem etablierten Muster der 17 bestehenden. Wer das spaeter angeht,
findet hier die Begruendung.

---

## Verifikation

| Pruefung | Ergebnis |
|---|---|
| `npm run check:all` | gruen |
| `npm run release:preflight` | gruen |
| `check:favicon-lock` | OK, 23 HTML-Seiten (neu eingefroren) |
| `check:start-lock` | OK, 31 Dateien (neu eingefroren, sw.js) |
| Live `/impressum.html`, `/datenschutz.html` | 200, echte Umlaute, Fusszeile 24 px |
| Live `/en/legal-notice.html`, `/en/privacy.html` | 200, Hinweis auf deutsche Verbindlichkeit sichtbar |
| Live `sw.js` | `smejj-shell-v158`, beide Seiten im Precache |
| Darstellung 375 px | Bildschirmfoto, kein Ueberlauf |

## Stolperstein fuer die naechste Sitzung

`docs/frontend/favicon-lock-manifest.json` wurde nach dem Einfrieren **zweimal**
auf den alten Stand zurueckgesetzt, obwohl die Pruefung unmittelbar davor
gruen war — Google-Drive-Synchronisation gegen eine parallele Sitzung.
Erfolgreich war erst: schreiben und `git add` im **selben** Befehl, danach
sofort committen. Wer hier eine Lock-Datei anfasst, sollte das Ergebnis nicht
nur pruefen, sondern sofort in den Index legen.
