# Freigabe: Zentraler API-Bereich (2026-08-31)

## Auftrag

Der Betreiber fand den bisherigen API-Bereich unuebersichtlich ("sitzt haesslich
aus, ueberhaupt nicht uebersichtlich") und liess einen Vergleich mit
OpenRouter (https://openrouter.ai/workspaces/default/keys) erstellen. Der
Entwurf (Bild: Desktop- + Handy-Ansicht, OpenRouter-Stil) wurde mit dem
zusaetzlichen Auftrag praezisiert: "Soll eine Zentrale Bereich sein soll nicht
zwei Bereiche sein".

## Schriftliche Freigabe (Wortlaut, 2026-08-31)

> Ich finde deinen Vorschlag gut. Kannst Du umsetzen
>
> Ich gebe dir alle Rechte von A bis z. Mach hundert Prozent fertig. Lass
> nicht offen.

Zusaetzlich (Master-Prompt 2026-08-31): volle Autonomie inkl. Staging/Live,
Live-Test auf der Produktionsdomain, Fehler sofort beheben, danach 100-%-Schutz
aktivieren.

## Was umgesetzt wurde

- NEU: `public/api-center-surface.js` + `public/api-center-surface.css` —
  zentraler API-Bereich im OpenRouter-Stil: Kopfzeile mit einem Hauptknopf
  ("Schlüssel erstellen"), Guthaben-Leiste (Guthaben/Verbraucht/Anfragen
  heute/Token heute), Suche + Typfilter (Alle/smejj/Anbieter), EINE Liste fuer
  alle Schluessel (smejj-API-Schluessel UND eigene Anbieter-Keys) mit
  Statuspunkt und Drei-Punkte-Menue, darunter kompakte Karten "Verbinden"
  (Basis-URL, Modell, curl-Beispiel) und "Preise".
- EIN Bereich statt zwei: der alte Block im Einstellungsreiter "KI-Modelle &
  Anbieter" (api-keys-surface.js) und die Sechs-Karten-Flaeche im Reiter
  "API & Schlüssel" bzw. auf /entwickler.html (api-konto-surface.js) sind in
  der neuen Flaeche aufgegangen. Reiter heisst jetzt "API".
- /entwickler.html rendert dasselbe Modul mit vollem Kopf (eine
  Implementierung, zwei Orte — wie bisher, aber im neuen Gewand).
- Sicherheitsregeln unveraendert: verschluesselte Speicherung serverseitig,
  in der Liste nur maskierte Schluessel (keyHint), Klartext genau einmal nach
  dem Anlegen, Widerruf mit Bestaetigung, BYOK-Test vor dem Speichern.
- i18n: 26 verwaiste Schluessel aus allen 14 Sprachdateien entfernt, 25 neue
  in allen 14 Sprachen (en, es, fr, it, pt, ru, tr, zh, ja, ko, ar, hi, bn, id)
  ergaenzt — identischer Schluesselsatz (tests/i18n-ui.test.mjs).
- Marken: sw.js v718 (neue Precache-Liste), app.js b104, premium-surfaces
  b42f, settings-surface b44, entwickler.js v=3.
- Dateien entfernt: api-keys-surface.js/.css, api-konto-surface.js,
  entwickler.css (jeweils Quelle + assets-Spiegel).

## Locks

- Start-Lock: wurde wegen sw.js/app.js/premium-surfaces.js mit dem
  Freigabewortlaut oben neu eingefroren (Backup backups/start-design-lock/).
- Favicon-Lock, Design-Lock (Startseite/Eingabefeld), Daten-Lock,
  Zugangs-Lock: nicht beruehrt.

## Rollback

- App-Repo: revert des Commits (Basis d93ff60d).
- Frontend-Klon: revert des Deploy-Commits; SW zurueck auf v717 waere
  wirkungslos fuer bereits v718-cachende Browser — der Rollback des Commits
  liefert die alten Dateien wieder aus, der Cache-Stempel muss dann auf v719
  oder hoeher zaehlen.
