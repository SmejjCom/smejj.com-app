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
* **Tägliche Sicherung (Action)**: bleibt rot, bis der Betreiber das Secret
  setzt. Siehe unten.

## Offen: das Secret für die tägliche Sicherung

Der Spiegel ist jetzt aktuell, aber der automatische Lauf schlägt weiter fehl.
Diesen einen Schritt kann keine Sitzung erledigen — ein Token darf nur der
Betreiber erzeugen:

1. Auf **codeberg.org**: Einstellungen → Anwendungen → „Token generieren",
   Recht `write:repository`.
2. Auf **github.com/SmejjCom/smejj.com-app**: Settings → Secrets and variables
   → Actions → „New repository secret", Name **`CODEBERG_TOKEN`**, Wert = der
   Token.
3. Danach einmal prüfen: Actions → „Code-Sicherung nach Codeberg" → „Run
   workflow", anschließend `node scripts/diagnose/kette-pruefen.mjs`.

Bis dahin hält der SSH-Weg vom Mac aus den Spiegel aktuell — er braucht keine
weiteren Zugangsdaten, aber eben einen Menschen, der ihn anstößt.

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
