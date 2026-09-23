# Drei Gerätebefunde vom 22.09. behoben (23.09.2026, smejj-shell-v960)

Auftrag (Betreiber): „Die drei Gerätebefunde beheben, A bis Z." Befunde aus dem Dreh des
Prüfer-Videos am echten iPhone 17 Pro Max (TestFlight Build 3, 22.09.).

## 1. Profilmenü: der Tipp auf „Mein Konto" ging durchs Menü auf die Chatliste
**Ursache:** das Menü hängt am `<body>` (position: fixed) und wurde über
`bottom: innerHeight - anchor.top + 8` gesetzt. `innerHeight` ist in der iOS-App kein verlässlicher
Maßstab (mobil-dock.js, 08.09.: mal 800, mal 852 je nach Tastatur-Historie). Weicht es vom
Layout-Viewport ab, liegt das Menü für die Trefferprüfung woanders als fürs Auge — genau das
Muster „geht erst nach Verlauf öffnen/schließen" (Neulayout).
**Änderung:** `lageUeberKnopf()` (reine Rechnung, exportiert, 4 Tests): Oberkante aus dem Anker
(`getBoundingClientRect`), ohne innerHeight; unter den Knopf, wenn oben kein Platz; seitlich im
Fenster. Menüpunkte sind Bedienflächen: `touch-action: manipulation`, keine Auswahl, kein Tipp-Blitz.
Beim Öffnen wird eine stehende Textauswahl aufgehoben. Marke profile-dock-menu.js b58, profile-dock.js -14.

## 2. iOS-Auswahlleiste „Korrekturlesen | Umformulieren" klebte über Menüs und Ansichten
**Ursache:** die Leiste ist Apples Textauswahl-Callout; in der Ein-Seiten-App überlebt die
Auswahl jeden Ansichtswechsel. **Änderung:** `mobil-dock.js` hebt die Auswahl bei popstate, beim
Schließen der Spur und bei Klicks auf Dock-Menüpunkte/Sprungknöpfe auf (`raeumeAuswahlAuf`,
`verdrahteAuswahl`, 2 Tests).

## 3. Gastfrage stand über drei Minuten bei „Einen Moment …"
**Ursache:** keine Rückmeldung und kein Ausweg während der Wartezeit; die 45-s-Grenze hängt an
`setTimeout`, und iOS hält Timer an, sobald die App in den Hintergrund geht (Spiegelung,
Sperrbildschirm) — die Uhr stand, die Karte auch. **Änderung:** nach 15 s ein Satz mit Ausweg
„Kostenlos anmelden" (Frage reist mit), eine Wache an der Uhrzeit beim Sichtbarwerden (bricht ab,
wenn die Grenze überschritten ist), `cache: "no-store"`. Text in DE/EN. gast-frage.js v3,
willkommen-sprache.js v3.

## Auslieferung und Nachweis
Kaskade `scripts/einmal/geraetebefunde-2026-09-23.sh`: Bauzweig 8785d74c → api.smejj.com v960 nach
75 s, Frontend-Klon fd3bdcb → smejj.com v960 nach 50 s, 243/243 Precache, Anker
`schutz-100-2026-09-23-geraetebefunde-v960` (von Hand gesetzt: der Bündel-Nachweis lief Sekunden
vor der Pages-Verteilung, live ist die Regel da). Wächter alle grün, `check:frontend` exit 0,
neue Tests 34/34 in den betroffenen Reihen.
Live-Klickprobe (Browser 375×812, lokale Sitzung): Menü per `top: 231px` (9 px über dem Knopf,
`bottom: auto`), `elementFromPoint` auf „Mein Konto" = Menüpunkt, Klick öffnet `/profile`, Auswahl
danach aufgehoben, `touch-action: manipulation`; Gastfrage mit hängendem fetch zeigt nach 15 s den
Hinweis mit Ausweg. Die Versionswache prüft v960 am Gerät.

## Offen
Das Bündel läuft weiter als `?v=v16b-20260922`: die neue touch-action-Regel kam über den
10-Minuten-Cache nach; wer den Service Worker in der ersten Minute installiert hat, hält bis zum
nächsten Cache-Sprung das alte Bündel (nur die Bedienflächen-Regel, die JS-Fixes wirken unabhängig).
Beim nächsten Sprung `?v=` mitheben.
