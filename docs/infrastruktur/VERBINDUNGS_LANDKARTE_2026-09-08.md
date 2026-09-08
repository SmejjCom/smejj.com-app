# Verbindungs-Landkarte — sind alle Dienste noch miteinander verbunden?

Stand: 2026-09-08

## Warum es das gibt

Die Frage „hängen alle Anbieter richtig zusammen?" war bis heute nur mit sechs
Einzelbefehlen zu beantworten: `dig` für jede Domain, `curl` für jeden Dienst,
`gh run list` für die Sicherung, `git rev-list` für den Spiegel. Wer das nicht
regelmäßig tut, merkt einen Riss nicht.

Und genau das war passiert: der **Codeberg-Spiegel lief seit dem 05.09. jeden
Tag rot** — `Secret CODEBERG_TOKEN fehlt — es wurde NICHTS gesichert`. Drei
Tage ohne Backup, ohne dass jemand es sah, weil ein fehlgeschlagener Cron-Lauf
still bleibt.

Die Lehre dahinter ist allgemein: **eine Architektur besteht aus Kanten, nicht
aus Knoten.** Jeder einzelne Dienst kann kerngesund sein, während die
Verbindung dazwischen gerissen ist. Ein Knoten meldet seinen eigenen Ausfall
nie — und eine gerissene Kante meldet ihn erst recht nicht.

## Der eine Befehl

```bash
node scripts/diagnose/kette-pruefen.mjs
```

Oder per Doppelklick im Finder: **`smejj.com Verbindungen pruefen.command`**
(Bericht landet zusätzlich auf dem Schreibtisch als `smejj-verbindungen.log`).

Der Lauf **ändert nichts**, braucht **kein Geheimnis** (DNS ist öffentlich, die
Health-Wege antworten ohne Anmeldung, der Spiegel-Rückstand steht in der
lokalen Git-Ablage) und **kostet nichts**. Er darf deshalb so oft laufen wie
gewünscht. Rückgabe-Code 1, sobald eine Verbindung gerissen ist.

## Was gemessen wird

| Kante | Beweis | Was ein Riss bedeutet |
|---|---|---|
| Spaceship DNS → GitHub Pages | A-Records von smejj.com | Die Seite ist für alle Besucher weg |
| Spaceship DNS → www | CNAME auf smejjcom.github.io | www läuft ins Leere |
| Spaceship DNS → Zeabur | CNAME api.smejj.com → smejj-control.zeabur.app | Anmeldung und Chat tot |
| Spaceship DNS → Mail | MX + SPF | Anmelde-Links kommen nicht an oder landen im Spam |
| Besucher → smejj.com | HTTP 200 unter der Zeitgrenze | Static-First-Pfad gestört |
| api.smejj.com → Control-Server | `/api/health` mit `ok:true` | Der Server ist nur über *.zeabur.app erreichbar, nicht über die eigene Domain |
| Control-Server → IDrive e2 | `idrive-e2` in der Modell-Registry | Kein Hauptspeicher angebunden |
| Control-Server → Modell-Router | `ai:true` in der Health-Antwort | Die Falle vom 07.09.: alle Ampeln grün, Router ohne lauffähiges Modell |
| Zeabur-Dienste (4) | `/health` je Dienst | Chat-Brücke, Maus-Engine oder Hausmodell fehlen |
| GitHub → Codeberg | jeder Zweig verglichen | **Kein Backup** |
| Tägliche Sicherung | letzter Action-Lauf | Der Spiegel altert unbemerkt |
| Geheimnisse | `.env` ignoriert und nicht eingecheckt | Schlüssel im Repo |

Zwei Entwurfsentscheidungen, die den Wächter brauchbar halten:

* **Der Spiegel wird am Inhalt gemessen, nicht am Job.** Ein grüner Lauf, der
  nichts kopiert hat, wäre genauso wertlos wie ein roter. Deshalb vergleicht
  die Landkarte jeden Zweig einzeln — **ein** zurückliegender Zweig genügt für
  rot. Eine Sicherung, die 39 von 40 Zweigen hat, ist keine Sicherung.
* **Fehlendes Werkzeug ist kein Defekt.** Was ohne Zugangsdaten nicht messbar
  ist, wird grau gemeldet, nicht rot. Ein Wächter mit Fehlalarmen wird nach dem
  dritten Mal weggeklickt.

## Befund vom 2026-09-08

15 von 16 Verbindungen standen. Gerissen war genau eine:

* **GitHub → Codeberg**: 18 Zweige im Rückstand, davon 11 komplett fehlend,
  `feature/design-v11` allein 122 Commits. **Nachgezogen** über
  `scripts/deploy/codeberg_spiegel_sync.sh lokal` (SSH-Weg, funktioniert vom
  Mac aus ohne Token) — danach alle 39 Zweige gleichauf.
* **Tägliche Sicherung**: die Action bleibt rot, bis das Secret gesetzt ist —
  ersetzt durch einen Mac-Termin, der ohne Geheimnis auskommt. Siehe unten.

Ein dritter Fund kam beim Ausliefern dazu: **`scripts/check/github_kostenfrei.sh`
blockierte jeden Push.** Der Wächter fragte die GitHub-API ohne Anmeldung nach
der Sichtbarkeit des Repos und bekam von diesem Anschluss dauerhaft
`API rate limit exceeded` (HTTP 403). Er meldete deshalb immer „privates Repo",
obwohl SmejjCom/smejj.com-app öffentlich ist — eine Messung, die immer dasselbe
Ergebnis liefert, misst nichts mehr. Behoben: fragt zuerst über `gh` (mit
Token, kein Limit), der anonyme Weg bleibt Rückfall, fail-closed unverändert.

## Die tägliche Sicherung läuft wieder — über einen Ersatzweg

Die GitHub Action bleibt rot, solange das Secret `CODEBERG_TOKEN` fehlt, und
ein Token darf nur der Betreiber erzeugen. Ohne Zutun gäbe es damit **gar kein
Backup**. Deshalb läuft die Sicherung jetzt über den einzigen Ort, der bereits
Schreibrecht bei Codeberg hat: den Mac.

* **Termin:** `com.smejj.codeberg-spiegel` (launchd), täglich 14:20 Ortszeit
* **Skript:** `~/.local/share/smejj-codeberg/wache.sh`
  (Kopie im Repo: `scripts/deploy/codeberg_wache_mac.sh`)
* **Termindatei:** `~/Library/LaunchAgents/com.smejj.codeberg-spiegel.plist`
  (Kopie im Repo: `scripts/deploy/com.smejj.codeberg-spiegel.plist`)
* **Zustand:** `~/.local/share/smejj-codeberg/zustand.json`, Log daneben
* Bewiesen am 08.09.: `LastExitStatus = 0`, 39 Zweige und alle Marken gespiegelt

Der Job braucht **kein Geheimnis** (SSH-Schlüssel
`~/.ssh/codeberg_smejj_ed25519` ist bei Codeberg registriert), **keine
Action-Minuten** und **nicht einmal den Projektordner**: er hält einen eigenen
nackten Klon und spiegelt direkt GitHub → Codeberg.

Zwei Fallen, die dabei gemessen wurden — beide sind im Skript vermerkt:

1. **Der erste Entwurf lief im Google-Drive-Ordner.** Von Hand ging das, unter
   launchd brach es sofort ab: `Operation not permitted`. macOS gibt
   Hintergrunddiensten keinen Zugriff auf CloudStorage-Ordner. Der eigene Klon
   ist nicht nur der Ausweg, sondern die bessere Sicherung — unabhängig vom
   Arbeitszweig und davon, ob Drive gerade eingehängt ist.
2. **Ein Schlüssel für zwei Dienste geht schief.** Mit `GIT_SSH_COMMAND` global
   auf den Codeberg-Schlüssel scheiterte schon das Lesen bei GitHub. Die Quelle
   wird deshalb über **HTTPS** gelesen (das Repo ist öffentlich, Lesen braucht
   dort nichts), und der Schlüssel gilt nur für die Codeberg-Pushes.

Gepusht wird **nie** mit `--mirror` und **nie** mit `--force`: ein Zweig, den
GitHub nicht mehr hat, wird auf Codeberg nicht gelöscht, und eine auseinander
gelaufene Historie lässt den Lauf abbrechen statt überschreiben.

### Wie die Landkarte das bewertet

Gefragt ist nicht „läuft die Action?", sondern **„ist der Code gesichert?"**.
Die Zeile *Tägliche Sicherung* liest deshalb beide Wege:

| Lage | Meldung |
|---|---|
| Action erfolgreich | **grün** |
| Action rot, Mac-Termin jünger als 36 h | **grau** — „trägt gerade allein" |
| Mac-Termin älter als 36 h oder fehlgeschlagen | **rot** — nichts sichert mehr |

Grau und nicht grün: der Mac muss dafür laufen, und dieser Vorbehalt darf nicht
unsichtbar werden. Rot wäre aber falsch — an dauerndes Rot gewöhnt man sich,
bis man den echten Ausfall ebenso übersieht. Die 36 Stunden geben eine Nacht
Reserve, ohne einen Ausfall zu verschweigen.

## Dritter Sicherungsweg: der Code liegt jetzt auch in IDrive e2

Der Mac-Termin rettet das Backup, hängt aber an einem eingeschalteten Mac.
Deshalb sichert seit dem 08.09. zusätzlich der Control-Server selbst —
**Autopilot Nr. 85, Code-Sicherung**
(`control-server/src/autopilots/codeSicherungAutopilot.js`).

Er ist der einzige Ort, der **ohne ein einziges neues Geheimnis** sichern kann:
das Repo ist öffentlich lesbar, und die e2-Zugänge liegen längst in seiner
Umgebung. Und er läuft rund um die Uhr, unabhängig von jedem Arbeitsplatz.

* **Ziel:** `sicherung/code/smejj.com-app_JJJJ-MM-TT.tar.gz` im Haupt-Eimer
* **Takt:** höchstens ein Schnappschuss je Tag (rund 9 MB). Liegt der heutige
  Stand schon, wird **gar nichts geladen** — die übrigen Takte kosten eine
  Listen-Abfrage.
* **Kein Überschreiben:** `If-None-Match: *`. Zwei gleichzeitige Takte können
  sich nicht überholen, ein bestehender Schnappschuss wird nie ersetzt.
* **Zwei Prüfungen gegen stilles Scheitern:** vor dem Speichern Größe und
  gzip-Dateikopf (eine GitHub-Fehlerseite darf nie als Sicherung durchgehen),
  nach dem Speichern das ETag von e2 gegen die eigene Prüfsumme — die
  Gegenprobe der *anderen* Seite, nicht die Zusicherung des Absenders. Weicht
  sie ab, ist der Lauf rot.
* **Löscht nichts.** Für eine Aufbewahrungsfrist auf diesem Präfix gibt es
  keine schriftliche Freigabe. Das wächst um rund 3 GB im Jahr — tragbar, aber
  es wächst; eine Frist ist eine Betreiber-Entscheidung.

Damit hängt der Code an drei Fäden statt an einem: **GitHub** (Quelle),
**Codeberg** (unabhängiger Git-Spiegel) und **IDrive e2** (Archiv am dafür
vorgesehenen Ort). Sichtbar im Adminbereich unter *Sicherheit & Wachdienst*.

TÜV: 16 Tests, darunter eine Fehlerseite statt eines Archivs, eine
ETag-Abweichung, zwei gleichzeitige Takte und der Lauf ohne e2-Zugang.

### Wenn du den Token doch noch setzen willst

Dann übernimmt wieder die Action, und der Mac-Job kann weg:

1. **codeberg.org** → Einstellungen → Anwendungen → „Token generieren",
   Berechtigung `repository` auf Read and Write.
2. **github.com/SmejjCom/smejj.com-app** → Settings → Secrets and variables →
   Actions → New repository secret, Name `CODEBERG_TOKEN`.
3. Mac-Termin abschalten:
   `launchctl bootout gui/$(id -u)/com.smejj.codeberg-spiegel`

## Was die Landkarte bewusst NICHT misst

* **IDrive-e2-Schreibtest** — braucht Zugangsdaten. Bisher wird nur gelesen,
  dass der Control-Server e2 als Speicher führt.
* **Salad-Budget-Gate** — ein echter Aufruf würde Rechenzeit kosten.
* Beides ließe sich ergänzen, sobald die Schlüssel im Lauf verfügbar sind.

## Verwandt

* `docs/architecture/CODEBERG_SPIEGEL.md` — der Spiegel-Pfad
* `docs/infrastruktur/DNS_SMEJJ_COM_BESTAND_2026-08-06.md` — DNS-Bestand
* `scripts/diagnose/funktionen-live.mjs` — meldet abgeschaltete Funktionen
  (Knoten-Ebene, ergänzt diese Kanten-Ebene)
