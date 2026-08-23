# Task Capsule — job_auslieferung_seite_20260823

**Ziel:** Seite „Was ist wirklich live?" aus dem Design-Vorschlag „Adminbereich" (26.6.26) mit ECHTEN Daten.

## Gebaut (Bau-Branch 8396ae14, Frontend 7eb2a17)
- `control-server/src/admin/opsAuslieferung.js` (+ Test, 6/6): je Dienst Live-Stand (vom Dienst selbst)
  gegen Bau-Stand (Repo/GitHub): smejj.com (sw CACHE_NAME live vs. main), smejj-control (Commit aus
  `ZEABUR_GIT_COMMIT_SHA` — Zeabur liefert ihn — sonst abgeleitet aus Startzeit vs. letztem Bau-Lauf),
  Chat-Brücke (Bündel-Version live vs. `assets/chat-bridge.js`), Wächter, Maus, Video, Bild.
- Sperren byte-genau gegen die Manifeste im Abbild (Admin, Sicherheit, Start, Favicon).
- „Was der Server NICHT messen kann" (Tests, CVE, Screenshot-Vergleich) steht als „nur lokal" — nie grün.
- Modul AL, Seite `/admin/auslieferung/`, Register in Route/Nav/Dateiliste/Sync; Admin-Lock 23 Dateien.

## Live-Beweis (05:46Z, Hard-Reload, keine Konsolenfehler)
Gleich 3 (smejj.com v657 = main v657; smejj-control 8396ae14 = Branch-Spitze; Brücke v140 = Repo),
4 Dienste antworten ohne Version (Wächter, Maus; Video/Bild ohne Gesundheitspfad). Sperren 2/4 stimmen.

## Befunde
- **Sicherheits-Lock „Verändert": `public/chat-bridge.js` weicht vom eingefrorenen Stand (15.08.) ab** —
  jemand hat die Datei auf dem Bau-Branch geändert, ohne neu einzufrieren. Nicht angefasst (Betreiber-Entscheidung).
- Favicon-Lock-Manifest hat ein anderes Format (kein `files`-Objekt) → Anzeige „0 Dateien / nicht im Abbild".

- NACHTRAG 05:53Z: Befund geprüft — Abweichung = Prompt-Caching-Fassung 18.08. (Cherry-Pick aa07a12b ohne Neustempel). Mit Betreiber-Freigabe neu eingefroren (6ddf0433).
