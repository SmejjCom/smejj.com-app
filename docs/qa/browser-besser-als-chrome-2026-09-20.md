# smejj Browser — zweite Prüfung A bis Z (20.09.2026): „muss besser als Chrome sein"

Geprüft live auf https://smejj.com/ (Chrome, angemeldet, SW v907 → v909), Gegenprobe lokal mit einem Prüfstand,
der die echte neue Server-Route wie das Panel einbettet.

## Gefunden und behoben

| Nr. | Befund (live gemessen) | Behoben |
|---|---|---|
| C1 | **Jede Proxy-Seite ohne Stil**: github.com als nackte Linkliste (38 Stylesheets ohne Wirkung), die Suchtreffer (DuckDuckGo = jede Suche über die Adressleiste) in Times New Roman mit kaputten Bildsymbolen. | v908 |
| C2 | **Bedienung der Proxy-Seiten tot**: Linkklick, Scroll-Merken, Suche in der Seite, Rechtsklick — gemessen kam KEINE Nachricht aus dem Rahmen. | v908 |
| C3 | `http://…` an der Adressleiste → http-Rahmen, der grau blieb (nur https-Rahmen erlaubt). | v908: https zuerst; der Agent lehnt http weiter ab |
| C4 | Neue Route schickte HTML unkomprimiert: github.com 305 KB, Übertragung 15–30 s über die langsame Leitung des Betreibers — der Rahmen blieb so lange weiß. | v909: Brotli/Gzip, 30,8 KB, 0,95–2,6 s gesamt |
| C5 | Nebenbefund: v907 (andere Sitzung) hatte `composer-tools.js` ohne neue ?v=-Marke geändert; `api.smejj.com` stand noch auf v906. | v908: Marke geheilt, Bauzweig zieht v907 nach |

**Ursache C1/C2:** Das Panel bettete das umgeschriebene HTML als `srcdoc` ein. Ein srcdoc-Rahmen ERBT die
Sicherheitsregel des Einbetters (`style-src`/`img-src`/`script-src 'self'`) — fremde Stylesheets, Bilder und das
eingefügte Inline-Navigationsskript wurden still blockiert (dieselbe Falle wie am 19.08. bei der Live-Bühne).

**Lösung:** `GET /api/browser/page` liefert die Seite als EIGENES Dokument mit eigener Regel
(`control-server/src/routes/browserPageRoute.js`): Stil/Bilder/Schriften direkt vom Original (der Control-Server wird
kein Bild-Proxy), Skript nur unseres per Nonce, `sandbox` ohne `allow-same-origin`, `frame-ancestors` nur unsere Seiten,
Auslieferung nur in einen Rahmen (`Sec-Fetch-Dest: iframe`, sonst 403 — fremder Inhalt stünde sonst unter unserem Namen
im Adressfeld), dieselbe Zielprüfung wie `/api/browser/fetch`. Der alte srcdoc-Weg bleibt als Rückfall.

## Live-Nachweis (v909)

| Prüfpunkt | Ergebnis |
|---|---|
| `/api/browser/page` als Rahmen / als Registerkarte / privates Netz / Metadaten-Dienst | 200 mit eigener Regel / 403 / 400 / 400; genau 1 Skript (Nonce), 0 fremde |
| github.com/torvalds/linux und /nodejs/node im Panel | Original-Design (Kopf, Reiter, Dateiliste, Symbole) — vorher Linkliste |
| Suche „wetter berlin" | gestylte Treffer mit Favicons; Scrollen auf Befehl, `scrollState` kommt beim Panel an |
| Übertragung github.com | 30,8 KB (br) statt 305 KB; gesamt 0,95–2,6 s statt 15–30 s |
| Adressleiste: `javascript:`, `file:`, `chrome:`, `localhost:3000` | werden zur Suche, nie ausgeführt; `http://192.168.1.1/` → Fehlerseite |
| Nicht erreichbare Adresse | eigene Fehlerseite „Keine Verbindung" mit „Erneut laden" |

## Wo der Browser heute besser ist als Chrome — und wo ehrlich nicht

Besser: KI-Maus bedient Seiten, Seitentext geht in den Chat, https ohne Ausnahme, fremde Seiten ohne Skripte und ohne
Kamera/Mikrofon/Standort, kein Verlauf bei einer Suchmaschine (Vorschläge nur aus dem eigenen Verlauf), Sitzungen im
Live-Browser überleben Zurück/Neu laden/Größenänderung (0,7–2,4 s).
Nicht besser — und mit dieser Bauart auch nicht erreichbar: rohe Geschwindigkeit und volle Interaktivität jeder Web-App.
Proxy-Seiten laufen bewusst OHNE die Skripte der Seite; was Skripte braucht, geht in den Live-Browser (ein Bild je Aktion,
0,5–0,7 s). Offen bleiben: Downloads/Uploads im Live-Browser, Videostrom statt Einzelbildern, warmer Chromium (Start 6–9 s).
Vorbestehend rot und NICHT von dieser Arbeit: `sprachwelle-layout` (Hinweistext) und `startgewicht` (Messlatte) seit v906/v907.

Auslieferung: v908 (App 3b75c715, Bauzweig b040d15a, Frontend cc2d299), v909 (App 197d97d8, Bauzweig 11b0d69c, Frontend 2df808a);
Anker `schutz-100-2026-09-20-browser-v908*` und `…-v909*`. Tests: `tests/browser-livetest-2026-09-18.test.mjs` (jetzt 21).

## Nachtrag 20.09. — Dateien im eingebauten Browser (SW v910)

| Nr. | Befund (live, v909) | Behoben |
|---|---|---|
| C6 | PDF, ZIP, Bild und Textdatei landeten als abgeschotteter Direkt-Rahmen: Bild = Sperrsymbol (raw.githubusercontent.com verbietet Rahmen), alles andere weiß — kein Hinweis, kein Download. | v910: `/api/browser/page` liefert für Nicht-HTML eine Dateiansicht |

Dateiansicht (`dateiAnsicht()` in `browserPageRoute.js`): **Bild** direkt vom Original (keine Serverlast), **Text** lesbar und maskiert
(der Server liest nur Text, gedeckelt — nie Bilder oder Archive), **PDF/ZIP/sonstiges** als Karte mit Name (aus `Content-Disposition`),
Größe und EINEM Knopf in eine neue Registerkarte (Popups entkommen der Sandbox) — dort öffnet oder lädt der Browser des Nutzers mit
seiner eigenen Prüfung. Bewusst ohne unser Navigationsskript. Client: `data.html === null` geht in die Dateiansicht statt in den Direkt-Rahmen.

Live nachgewiesen (v910, api.smejj.com + Panel auf smejj.com): ZIP → Karte „Hello-World-master.zip · 351 B · Herunterladen" (0,51 s),
PDF → Karte „… .pdf · 992 KB · PDF öffnen" (0,55 s, im Panel gesehen), PNG → Bild im Panel gesehen (0,57 s), TXT → Text (2,2 s); 0 Konsolenfehler.
Nicht per Automat prüfbar: der Klick auf den Knopf (der Chrome-Automat erreicht abgeschottete Rahmen nicht) — das Verhalten
(`target=_blank` + `allow-popups-to-escape-sandbox`) ist Browser-Standard.
Auslieferung v910: App d0bb3169, Bauzweig 4af5d082, Frontend a9d8e9b; Anker `schutz-100-2026-09-20-browser-v910*`.
