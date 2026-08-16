# Werkstatt-Bau-Auftrag (Station 2)

Erzeugt am 2026-08-14T15:19:57.653Z aus docs/werkstatt/backlog.json. Dieser Auftrag ist
in sich geschlossen: alles Noetige steht hier, es gibt keine Sitzung dahinter.

## Die EINE Aufgabe fuer diese Nacht

- **Titel:** pipecat-ai 0.0.67: 2 bekannte Schwachstelle(n)
- **Betrifft:** `bibliothek:pipecat-ai`
- **Quelle:** CVE-Waechter (Dringlichkeit Stufe 2)
- **Befund:** Gemeldet von osv.dev. Beispiele: GHSA-c2jg-5cp7-6wc7, PYSEC-2026-458. Quelle: workers/smejj-voice/requirements.txt. Behebung = Version anheben und den Dienst neu bauen.

## Harte Schutzregeln (bei Verstoss: abbrechen, nichts pushen)

1. Arbeite AUSSCHLIESSLICH auf einem frischen Branch `feature/werkstatt-2026-08-14` ab origin/feature/auth-redesign-github-magiclink.
   Das ist der Stand, der wirklich ausgeliefert wird — und genau der, gegen den
   das Tor misst. NICHT origin/main: der liegt weit zurueck, dort waere das Tor
   aus Gruenden zu, die mit deiner Aufgabe nichts zu tun haben.
   Niemals auf main oder einem fremden Branch committen.
2. GENAU diese eine Aufgabe. Keine Nebenreparaturen, keine "wo ich schon mal
   dabei bin"-Aenderungen — was dir auffaellt, gehoert als Notiz in den
   Commit-Text, nicht in den Code.
3. Gesperrte Dateien sind TABU (Start-Lock: 31 Startseiten-Dateien,
   Security-Lock: 10 Auth-Dateien, Favicon-Lock). Pruefe vorher mit
   `node scripts/check-start-lock.mjs` und `node scripts/check-security-lock.mjs`,
   welche das sind. Braucht die Aufgabe eine gesperrte Datei: NICHT bauen,
   stattdessen im Ergebnis dokumentieren, warum es Betreiber-Freigabe braucht.
4. Keine neuen Dienste, keine neuen Abhaengigkeiten, keine Secrets im Code.
5. Ehrlichkeits-Beschluss beachten (docs/approvals/2026-08-12-ampel-ehrlich-messen.md):
   keine Blind-Stempel, keine erfundenen Messwerte, nicht Gemessenes ist grau.

## Abnahme (Station 3 prueft das fail-closed nach)

- `npm test` ist komplett gruen (volle Suite, rund 60 s).
- `npm run werkstatt:tor -- --schnell` meldet OFFEN.
- Fuer die Aenderung existiert mindestens ein NEUER Test, der ohne sie rot waere.
- Commit-Text erklaert WARUM, nicht nur was (Vorbild: juengste Commits im Log).

## Abschluss

- Push NUR den Branch `feature/werkstatt-2026-08-14`.
- Erzeuge die Freigabe-Karte: `node scripts/werkstatt/freigabe-karte.mjs feature/werkstatt-2026-08-14`
- Wenn der Bau scheitert: Branch trotzdem pushen (unfertig ist ehrlich),
  Karte mit Status GESCHEITERT erzeugen — ein stiller Abbruch waere eine
  stumme Quelle.
