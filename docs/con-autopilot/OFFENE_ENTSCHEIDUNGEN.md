# con-Autopilot — offene Entscheidungen und ihre Zahlen

Stand 2026-09-04. Alles hier ist gemessen, nicht geschaetzt.

## 1. GLM-5.3 nach e2 holen? — Empfehlung: NEIN, jedenfalls nicht so

| Punkt | Wert |
|---|---|
| Groesse | 756 GB (bisher in e2: 61 KB, also praktisch nichts) |
| Ueber die Leitung des Betreibers | ~100 KB/s → **87 Tage** |
| Ueber einen gemieteten Rechner direkt nach e2 | ~10 MB/s → **21 Stunden**, rund **2 USD** |
| Danach in e2 belegt | 808 GB + 756 GB = 1.564 GB von 2.000 GB |

**Warum trotzdem nein:** GLM-5.3 laeuft auf keiner Karte, die wir mieten koennen. Die
groesste bei Salad hat 24 GB; fuer 756 GB Gewichte braeuchte es rund 32 davon,
zusammengeschaltet. Salad vermietet einzelne Karten. Das Modell waere reiner Lagerbestand,
der drei Viertel des freien Platzes belegt — genau wie GLM-5.2 (755,7 GB), das seit Wochen
unbenutzt liegt.

**Wenn doch:** nicht ueber den Mac, sondern als Salad-Job wie beim Basismodell
(`CON_JOB_MODUS=spiegel`, ein Lauf, ~2 USD). Der Weg ist gebaut und bewiesen.

## 2. MacBook 1 — Empfehlung: die beiden Upload-Dienste einstellen

`durchreiche.sh` und `upload_qwen38.sh` liefen auf MacBook 1 (192.168.1.116). Der Rechner
ist seit dem 03.09. nicht mehr im Netz. Beide Dienste haben nur einen Zweck: grosse
Modelle ueber die Hausleitung nach e2 zu tragen. Genau das macht ein Salad-Job in einem
Bruchteil der Zeit fuer wenige Cent (55,6 GB in 90 Minuten fuer 0,44 USD, gemessen 03.09.).
Qwen3.8-27B liegt vollstaendig in e2 — der eigentliche Auftrag der Dienste ist erfuellt.

## 3. Zwei Zugangsdaten, die nur der Betreiber anlegen kann

Beides sind Geheimnisse; ich darf sie weder erzeugen noch in Formulare eintragen.

| Was | Wo | Wofuer |
|---|---|---|
| `CODEBERG_TOKEN` | Codeberg → Einstellungen → Anwendungen (Recht `write:repository`), dann GitHub → Settings → Secrets and variables → Actions | taeglicher Spiegel um 11:20 UTC. Der Automat ist eingeschaltet und laeuft bis genau zu dieser Stelle (Lauf #1 am 04.09. bewiesen) |
| Zeabur-API-Schluessel | `~/.config/zeabur/cli.yaml`, Feld `token` | Protokolle lesen und Dienste bauen ohne Browser; seit 02.09. HTTP 401 |

## 4. Was laeuft, ohne dass jemand etwas tun muss

* con-Autopilot auf Zeabur: tickt alle 5 Minuten, Stapel-Prioritaet, Tagesdeckel 5,50 USD,
  Gesamtdeckel 10 USD. Adresse `https://smejj-con-autopilot.zeabur.app`.
* Wache: `npm run check:con-wache` prueft Erreichbarkeit, Herzschlag, Fehler, Blockaden und
  Kosten gegen den Deckel **des Dienstes**. Exit 1 bei Rot.
* Datensatz `con-grundfaehigkeiten-v1` in e2: 3.707 gepruefte Paare, davon Rechnen und Logik
  gegen die gemessene Schwaeche und Sicherheitsbeispiele gegen den Rueckfall von con-1.1.
