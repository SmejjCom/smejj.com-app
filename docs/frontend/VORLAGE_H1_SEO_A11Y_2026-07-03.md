# Entscheidungsvorlage: H1/SEO + Accessibility (Stand 2026-07-03)

Alle Punkte betreffen `public/index.html` — eine Start-Lock-Datei. Nichts hiervon
wird ohne dein schriftliches Ja umgesetzt. Diese Vorlage macht die Freigabe konkret.

## Befund (live gemessen, Desktop + Mobil 390px)

Gut: `lang=de`, Viewport-Meta, 1x `main`, 3x `nav`, 3 aria-live-Regionen,
alle 82 Buttons mit Label, Mobil-Layout sauber (Menü, Composer, Icons).

Lücken:
1. **Kein H1** (0x h1, 19x h2). SEO- und A11y-Schwäche der Startseite.
2. **10 Formularfelder ohne programmatisches Label** (4 file-inputs, 4 selects
   in settings/profile, 1 select in ai, 1 textarea in files). Sichtbare
   Überschriften existieren, aber ohne `for`/`aria-label`-Verknüpfung.
3. **Kein Skip-Link** ("Zum Inhalt springen").

## Vorschlag 1 — H1 ohne sichtbare Design-Änderung (empfohlen)

Die bestehende Frage "Was sollen wir in smejj entwickeln?" ist visuell die
Hauptüberschrift, ist aber ein `h2`. Zwei Optionen:

- **Option A (minimal-invasiv, empfohlen):** Ein visuell verstecktes H1 vor dem
  Start-Feed einfügen:
  `<h1 class="visually-hidden">smejj.com — KI- und Code-Assistent</h1>`
  plus 6 Zeilen CSS (`.visually-hidden`). Pixel-identisches Rendering,
  Screenreader/SEO bekommen die Hauptüberschrift. Byte-Änderung an index.html +
  styles.css → Start-Lock-Re-Freeze nötig, aber KEINE sichtbare Änderung.
- **Option B:** Das bestehende `h2` der Startfrage zu `h1` machen und per CSS
  exakt gleich stylen. Riskanter (Font-Größen-Kaskade), nicht empfohlen.

## Vorschlag 2 — Formular-Labels (A11y)

`aria-label` auf die 10 Felder (keine sichtbare Änderung, keine Layout-Wirkung).
Beispiel: `<select id="settingsLanguage" aria-label="Sprache">`.

## Vorschlag 3 — Skip-Link (optional, niedrige Prio)

Versteckter "Zum Inhalt"-Link als erstes fokussierbares Element; nur bei
Tastatur-Fokus sichtbar. Kann Design-Wahrnehmung nicht stören (nur bei Tab-Fokus).

## Umsetzungsprozess (bei Freigabe)

1. Schriftliches Ja zu Option A + Vorschlag 2 (+ optional 3), Wortlaut wird dokumentiert.
2. Rollback-Punkt, Umsetzung, `check:frontend` + `check:all` + neue Tests
   (H1 vorhanden; Labels vorhanden).
3. `check-start-lock --freeze --confirm "<Wortlaut>"`, Deploy (index.html,
   styles.css), Live-Verifikation inkl. Screenshot-Vergleich (pixel-identisch).

## Erwarteter Nutzen

- SEO: vollständige Überschriften-Hierarchie für Crawler (H1-Signal auf der
  einzigen 200-URL) — letzter struktureller SEO-Blocker vor Werbung.
- A11y: WCAG-Basiskonformität für Formulare (1.3.1/4.1.2), bessere
  Screenreader-Nutzbarkeit — relevant, sobald echte Nutzer kommen.
