# job_konto_formulare_20260804 — Passwortwechsel und Kontolöschung ohne Browser-Dialoge

## Ziel (Betreiber-Freigabe 2026-08-04, wörtlich)
„Freigabe: account-sessions.js auf richtige Passwortfelder umstellen (Passwort
ändern und Konto löschen). Ich teste den Ablauf nach dem Deploy einmal
angemeldet durch."

Nachtrag zu [job_auth_haertung_20260804](../job_auth_haertung_20260804/capsule.md),
wo derselbe Befund auf der Anmeldeseite behoben wurde.

## Befund
`public/account-sessions.js` nutzte drei Browser-Dialoge:

| Weg | vorher |
| --- | --- |
| Passwort ändern | `prompt("Aktuelles Passwort:")` + `prompt("Neues Passwort…")` |
| Konto löschen | `confirm(…)` + `prompt("KONTO LÖSCHEN")` + `prompt("Passwort")` |

Vier Probleme:
1. **`prompt()` maskiert nicht** — altes *und* neues Passwort standen im Klartext
   auf dem Bildschirm.
2. **Passwortverwaltungen kennen den Dialog nicht** — kein Vorschlag, kein
   Speichern, kein Einfügen.
3. **Chrome bietet nach dem zweiten Dialog an, weitere zu unterdrücken.** Wer das
   anklickte, kam bei der Löschung nie ans Passwortfeld und stand vor einer
   Aktion, die scheinbar nichts tat.
4. **Kein Wiederholfeld** — ein unsichtbarer Tippfehler setzt ein Passwort, das
   niemand mehr kennt, bei sofort beendeten anderen Sitzungen.

Dazu ging **jede** Eingabe ans Netz: auch ein leeres Feld, wenn jemand einen
Dialog wegklickte.

## Umsetzung
| Datei | Änderung |
| --- | --- |
| `public/account-sessions.js` | `changePasswordForm()` + `deleteAccountForm()`; alle Dialoge entfernt; alle Prüfungen **vor** dem Serveraufruf |
| `public/account-privacy.css` | `.account-inline-form` in exakt der Optik der vorhandenen Konto-Felder |
| `public/sw.js` | v210 → v211 (Formulare), v211 → v212 (Nachbesserung) |
| `tests/konto-formulare.test.mjs` | **NEU**, 9 Tests — inkl. zwei Verhaltenstests gegen ein nachgebautes DOM |

Die Zwei-Stufen-Bremse der Löschung bleibt und wird strenger: das wörtliche
`KONTO LÖSCHEN` wird jetzt schon im Browser geprüft, gegen dieselbe Konstante,
die auch in der Beschriftung steht.

## Live-Beweise (Produktionsdomain, ausgelieferter Code)
Die Formulare wurden aus dem **live ausgelieferten** Modul in einer echten Seite
gerendert (`import("/assets/account-sessions.js")`) — kein Login nötig, keine
Server-Aktion.

| Eingabe | Ergebnis | Netzaufrufe |
| --- | --- | --- |
| Löschwort falsch geschrieben | „Bitte exakt „KONTO LÖSCHEN" eingeben. Es wurde nichts gelöscht." | **0** |
| Löschwort richtig, Passwort leer | „Bitte das aktuelle Passwort eingeben. Es wurde nichts gelöscht." | **0** |
| neue Passwörter ungleich | „Die beiden neuen Passwörter stimmen nicht überein." | **0** |
| alles korrekt | Anfrage geht an den Control-Server | 1 |

Gemessen: 4 maskierte Felder mit passendem `autocomplete`, Rahmen
`1px solid rgba(255,255,255,0.13)`, Feldgrund `rgba(0,0,0,0.25)` — identisch mit
den vorhandenen Konto-Feldern.

## Ein Fehler, den erst der Browser zeigte
Die Beschriftung „Zur Bestätigung KONTO LÖSCHEN eingeben" brach in **drei
Zeilen**. Das Label ist eine Flex-Spalte — das darin stehende `<code>`-Element
wurde eine eigene Zeile. Kein Test hätte das gefunden. Behoben (ein Textstück
mit typografischen Anführungszeichen), Schutztest ergänzt, sw v212 ausgeliefert.

## Checks
`npm run check:all` grün (1764 und 1718 in zwei vollständigen Läufen).
Start-Lock neu eingefroren, 31 Dateien, `2026-08-04T01:53:18Z`.

## Rollback
Frontend: `git revert dd626c7` in `smejj-app-frontend`. Dev-Repo: `14f1a3d`.

## Offen / Merkregeln
- **Der Betreiber testet den Ablauf angemeldet durch.** Aus einer Sitzung ist der
  Weg hinter der Anmeldung nicht vollständig prüfbar — Rendern und alle
  clientseitigen Sperren sind belegt, der tatsächliche Serverwechsel nicht.
- **Ein Label als Flex-Spalte macht aus jedem eigenen Element eine eigene Zeile.**
- **`?v=` allein erreicht Bestandsnutzer nicht** — Precache ist cache-first mit
  `ignoreSearch`, nur ein `CACHE_NAME`-Sprung wirkt.
- **Eine Testbühne ohne die echte Ansichtsklasse misst falsch.** Die
  Konto-Variablen hängen an `#profile.premium-view`; ohne die Klasse lösen sie zu
  leer auf und Ränder verschwinden — das sah wie ein CSS-Fehler aus.
- **FREMD, aber ernst:** `tests/lora-trainer-vertrag.test.mjs` startet einen
  lokalen Dienst und wartet 15 s auf `/health`. Unter der Last eines vollen
  `check:all` reicht das manchmal nicht — dreimal an einem Tag rot, isoliert
  immer grün. Ein Pflicht-Gate darf nicht vom Zufall abhängen.
