# Widerruf: Sprachserver-Freigabe vom 2026-08-03 (VORLAGE)

Datum der Vorlage: 2026-08-14
Status: **NICHT UNTERSCHRIEBEN.** Bis der Betreiber den Wortlaut unten bestaetigt,
bleibt die Freigabe vom 2026-08-03 in Kraft und `workers/smejj-voice` unangetastet.

## Worum es geht

Am 2026-08-03 wurde in `ENTSCHEIDUNG_SPRACHSERVER_KOSTEN_2026-08-03.md`
Variante C freigegeben:

> Freigabe Sprachserver (Betreiber, 2026-08-03): Deploy von workers/smejj-voice
> als Salad-GPU-Containergruppe (RTX 3090), nur-bei-Nutzung mit Idle-Abschaltung,
> Budget-Deckel maximal 10 USD/Monat, fail-closed; Dienst: SaladCloud (bestehendes
> Konto), Betrag: bis 10 USD/Monat.

Diese Freigabe ist nie ausgefuehrt worden und kann heute nicht mehr ausgefuehrt
werden — aber sie steht weiter im Repo. Solange sie steht, ist jedes Aufraeumen
an `workers/smejj-voice` ein Verstoss gegen einen gueltigen Beschluss.

## Warum sie ueberholt ist (gemessen, nicht vermutet)

1. **Die Plattform gibt es fuer uns nicht mehr.** `docs/salad-abschaltung-checkliste.md`
   haelt fest: alle vier Salad-Containergruppen wurden am 2026-08-13 gestoppt,
   Ziel „100 % Zeabur, Salad-Kosten auf null". Eine Salad-GPU-Gruppe laesst sich
   nicht mehr anlegen, ohne diese Entscheidung zurueckzunehmen.
2. **Die Aufgabe ist anderweitig erledigt.** Die Stimme laeuft ueber
   `smejj-voice-piper` auf Zeabur (Piper, `de_DE-thorsten-medium`, nur intern
   erreichbar) — eine andere Fassung, nicht dieser Code.
3. **Der Dienst sagt es selbst.** `workers/smejj-voice/README.md`, Zeile 11:
   „no deploy, no live services".
4. **Er wird auch nicht gebaut.** Es gibt einen vollstaendigen Bauweg
   (`workers/smejj-voice/Dockerfile` +
   `scripts/deploy/build_and_push_voice_worker_image.sh` nach ghcr.io), aber
   kein Deployment, das daraus entstanden waere.

## Was der Widerruf kosten wuerde

Nichts an laufender Funktion — und das ist nachpruefbar: der Ordner ist an
keiner Stelle im Betrieb verdrahtet. Was verloren ginge, ist die fertige
Vorarbeit: rund 1.160 Zeilen Python (Pipecat-Pipeline, Whisper-STT, Silero-VAD,
Router-Anbindung, Idle-Abschaltung) samt Tests und Dockerfile. Wer die
Streaming-Sprachspur spaeter doch bauen will, faengt neu an — oder holt den
Stand aus der Git-Historie zurueck.

**Das ist der ganze Grund, warum hier nur eine Vorlage steht und nicht schon
geloescht wurde.**

## Wortlaut zum Bestaetigen

> Widerruf Sprachserver-Freigabe (Betreiber, 2026-08-__): Die Freigabe vom
> 2026-08-03 zum Deploy von `workers/smejj-voice` als Salad-GPU-Containergruppe
> ist hiermit widerrufen. Es wird kein Sprachserver auf Salad in Betrieb
> genommen; der Budget-Rahmen von 10 USD/Monat entfaellt. Die Sprachwelle bleibt
> bei der bestehenden Loesung (Groq-Whisper fuers Hoeren, `smejj-voice-piper`
> fuers Sprechen).

## Was DANACH erlaubt waere — jeweils einzeln zu entscheiden

Der Widerruf allein loescht nichts. Er macht nur den Weg frei. Diese drei
Schritte gehoeren getrennt betrachtet, weil sie verschieden weit reichen:

| # | Schritt | Umfang | Wirkung auf den Betrieb |
|---|---|---|---|
| 1 | `workers/smejj-voice/` entfernen | Ordner + Dockerfile + Tests | keine — nichts importiert ihn |
| 2 | `scripts/deploy/build_and_push_voice_worker_image.sh` entfernen | 1 Datei | keine — baut nur den Ordner aus 1 |
| 3 | Salad-Sprachsteuerung im Control-Server entfernen | `control-server/src/voice/voiceWorkerControl.js` + Routen + Tests | **zu pruefen** — haengt an `SALAD_*`-Variablen und gehoert zur groesseren Salad-Endreinigung, nicht zu dieser Freigabe |

Empfehlung: 1 und 2 zusammen, 3 getrennt mit der uebrigen Salad-Endreinigung.

## Nebenwirkung, die man kennen sollte

Mit Schritt 1 verschwinden auch die letzten offenen CVE-Befunde des Projekts:
`pipecat-ai 0.0.67` (CVE-2025-62373) steht ausschliesslich in der
`requirements.txt` dieses Ordners. Das ist ein Nebeneffekt, kein Argument —
eine Luecke verschwinden zu lassen, indem man die Datei loescht, waere nur dann
ehrlich, wenn der Code ohnehin weg soll. Genau das ist hier die Frage.

## Belege

- `ENTSCHEIDUNG_SPRACHSERVER_KOSTEN_2026-08-03.md` — die Freigabe im Wortlaut
- `docs/salad-abschaltung-checkliste.md` — Salad gestoppt, Ziel 100 % Zeabur
- `workers/smejj-voice/README.md` — „no deploy, no live services"
- `scripts/deploy/build_and_push_voice_worker_image.sh` — der Bauweg, der nie lief
