# Maus-Pruefbericht — iMild.com Startseite (2026-07-26)

Lauf: `pruefbericht-imild-start-v1`, lokal mit der echten Maus-Engine
(Playwright, 0 EUR) gegen https://imild.com/. Die Engine hat **nur Fakten
gesammelt** (extract + httpRequest + Screenshots); die Bewertung unten stammt
aus der Auswertung dieser Fakten — die Engine bewertet nie selbst.

## Rohbefunde der Maus

| Geprueft | Ergebnis |
|---|---|
| Seitentitel | „iMild.com — Three products. One vision." |
| Meta-Beschreibung | vorhanden, aber **auf Deutsch** |
| `<html lang>` | `en` |
| viewport | `width=device-width, initial-scale=1.0` (korrekt) |
| canonical | **fehlt** |
| og:title / og:description / og:image | **alle drei fehlen** |
| H1 | genau eine („Three products. One vision.") — korrekt |
| H2 / H3 | **keine einzige** |
| `<img>`-Elemente | keine (alles SVG/CSS — gut fuer Ladezeit) |
| Links | 23, alle mit sprechendem Text (kein „hier klicken") — gut |
| Knoepfe | 1 (Menue), mit `aria-label` „Menü öffnen" (**deutsch auf englischer Seite**) |
| robots.txt | 200 ✅ |
| sitemap.xml | 200 ✅ |
| manifest.webmanifest | 200 ✅ |
| favicon.ico | **404** |
| Konsolenfehler | 0 ✅ |

## Verbesserungsvorschlaege, nach Wirkung sortiert

### 1. Social-Vorschau fehlt komplett (groesste Wirkung)
`og:title`, `og:description` und `og:image` sind nicht gesetzt. Wird der Link
in WhatsApp, LinkedIn, X oder Slack geteilt — also genau bei Investoren- und
Presse-Kontakten — erscheint **kein Bild und kein Beschreibungstext**, nur die
nackte URL. Aufwand: 4 Zeilen im `<head>` plus ein Vorschaubild (1200x630).

### 2. Sprach-Widerspruch: englische Seite, deutsche Metadaten
Die Seite laeuft mit `lang="en"` und englischem Inhalt, aber die
Meta-Beschreibung (der Text, den Google im Suchergebnis anzeigt) ist deutsch;
ebenso das `aria-label` „Menü öffnen", das Screenreader vorlesen. Fuer eine
Firma mit dem Anspruch „51 Sprachen" ist das der sichtbarste Qualitaetsmangel.
Empfehlung: Metadaten und `aria-label` an die aktive Sprache koppeln (die
Seite hat mit `data-i18n` bereits die noetige Technik).

### 3. Keine Zwischenueberschriften (H2/H3)
Die Startseite hat genau eine H1 und danach **gar keine** Ueberschriften. Die
Produktnamen (con.ax, smejj, smyst) und die Kennzahlen sind reine Textblöcke.
Folgen: Google erkennt die Struktur schlechter, Screenreader-Nutzer koennen
nicht springen. Empfehlung: Produktnamen als `<h2>`, Kategorien als `<h3>`.

### 4. `canonical` fehlt
Ohne `<link rel="canonical">` koennen `imild.com`, `www.imild.com` und
`/index.html` als drei Seiten mit gleichem Inhalt gewertet werden, was die
Suchmaschinen-Position verwaessert. Aufwand: eine Zeile.

### 5. `/favicon.ico` liefert 404
Moderne Browser finden das Icon ueber die `<link>`-Angaben, aber viele
Dienste (Link-Vorschauen, Feed-Reader, Lesezeichen-Importe) fragen stur
`/favicon.ico` ab und bekommen nichts. Aufwand: eine Datei ablegen.

## Was ausdruecklich gut ist

- Keine Konsolenfehler, sauberes technisches Fundament.
- robots.txt, sitemap.xml und Web-Manifest vorhanden — das haben viele
  Firmenseiten nicht.
- Keine Bitmap-Bilder: schnelle Ladezeit, keine fehlenden Alternativtexte.
- Alle 23 Links haben sprechende Texte.
- Genau eine H1 — korrekt.
- Mobile-Grundlage (viewport) korrekt gesetzt.

## Umsetzung

Punkte 1, 4 und 5 sind reine `<head>`-Ergaenzungen ohne Designaenderung.
Punkt 3 ist Markup (kein sichtbarer Unterschied). Punkt 2 beruehrt die
i18n-Logik. Alle Aenderungen lägen im Repo `iMild.com App/Website/` und
brauchen eine eigene schriftliche Freigabe des Betreibers — dieser Bericht
aendert nichts.
