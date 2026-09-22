# Design V16 — das Schreibfeld trifft die Unterkante (22.09.2026)

**Auftrag (Betreiber, Chat 22.09.2026):** „Soll Schreibfeld (mit gesamte Icons: + Modele, Diktieren,
Sprachwelle/Senden) ganz unten sein, mit ganz untere kante treffen."

## Ausgangslage (gemessen)
Echtes iPhone 17 Pro Max, TestFlight Build 3, Aufnahme für die App-Prüfung: die Symbolzeile des
Schreibfelds endete ~46 pt über der Bildschirmkante. Ursache: V15 hielt den Home-Balken frei
(`bottom: var(--sa-bottom)` = 34 pt) plus 4 px Polster, mobil-dock.js gab dem Feld weitere 4 px.

## Änderung
Neue Schicht `public/design-v16-kante.css` als Kaskaden-Ende nach V15 (100-%-Schutz: keine Schicht
davor angefasst). Nur der Abstand nach unten: laufender Chat `bottom: 0; padding-bottom: 0`, leere
Startseite `margin-bottom: 0; padding-bottom: 0`, offene Tastatur `bottom: 0` (bündig an der
Tastaturkante), Verlaufs-Polster `--feld-hoehe + 12px` statt `+ --sa-bottom + 20px`.
Bündel neu erzeugt (`scripts/build/bundle-start-styles.mjs`), `index.html` → `?v=v16-20260922`,
Cache `smejj-shell-v958`, Spiegel `/assets` nachgezogen, Start-Lock mit dem Wortlaut gestempelt.

## Nachweis
- Kaskade `scripts/einmal/design-v16-kante-2026-09-22.sh`: Bauzweig 9653664f → api.smejj.com v958
  nach 75 s, Frontend-Klon 475cbb2 → smejj.com v958 nach 40 s, Bündel/Index/assets-Index live auf
  v16, **243/243 Precache-Einträge 200**, Anker `schutz-100-2026-09-22-design-v16-v958`.
- Wächter: start-lock, security-lock, auslieferung-lock, markenkette, modul-syntax, startgewicht,
  precache-imports, module-queries grün; `npm run check:frontend` exit 0.
  `check-favicon-lock` war schon am Ausgangsstand (cd43f361) rot (htmlHeadReferences) — nicht Teil
  dieser Runde, nicht angefasst.
- Browser-Messung an der AUSGELIEFERTEN Seite (375×812, lokale Sitzung): Feld-Unterkante = 812 =
  Viewport-Unterkante, `padding-bottom 0`, `margin-bottom 0`, Verlaufs-Polster 60 px (48 + 12).
  Mit künstlicher Safe-Area `--sa-bottom: 34px`: **V16 → 0 px Abstand**, V16-Regel abgeschaltet
  (= V15) → **34 px Abstand**. Damit ist bewiesen, dass genau diese Schicht die Kante schließt.
- Gewicht live (gzip): index.html 18,8 KB, Bündel 30,2 KB (Budget 300 KB weit unterschritten).

## Offen
Sichtprüfung am echten iPhone: die Spiegelung nahm heute keine Hintergrund-Eingaben an und die
Vollbild-Freigabe blieb unbeantwortet — die App lädt smejj.com live, ein Blick aufs Gerät zeigt v958
sofort (ggf. App einmal schließen und neu öffnen).

Hinweis: die Symbolzeile liegt jetzt IM Home-Balken-Bereich (34 pt). Das ist so bestellt; falls
Tipper dort den Home-Wisch auslösen, wäre ein kleiner Rest (z. B. 8 px) die Rückfalloption.
