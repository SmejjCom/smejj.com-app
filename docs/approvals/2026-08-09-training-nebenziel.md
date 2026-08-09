# Beschluss: Training wird Nebenziel — RAG bleibt die Antwort (2026-08-09)

## Wortlaut des Betreibers

> „Ja, Training als Nebenziel führen — RAG bleibt die Antwort"

## Die Zahlen, auf denen der Beschluss steht

    Grundlinie (eingekaufte Kette)          95,88 %     0 kritisch
    Training, 3 Formen, alter Korpus        67,89 %     6 kritisch
    Training, 15 Formen + Changelog         62,75 %     8 kritisch
    Training, 15 Formen, sauberer Korpus    36,60 %    12 kritisch
    RAG auf derselben Suite                 96 %

Vier Messpunkte, vier Konfigurationen (r8/r16/r32, lr 1e-4/5e-5/2e-5) — **jede
Verbesserung am Korpus senkte die Note.** Kein Hyperparameter dreht das.

Der Engpass ist die **Menge**: 731 von rund 30.000 noetigen Fakten, also 2,4 %.
Nicht die Form, nicht das Qualitaetstor. Und mehr Fakten gibt es nur aus echten
Nutzerfragen oder Handarbeit — modellerzeugte Fragen bleiben gesperrt
(`SMEJJ_1_0_TRAINING_DATA_POLICY.md`).

## Was dieser Beschluss praktisch bedeutet

**Nichts laeuft mehr auf der Trainingsspur.** Nachgemessen am 2026-08-09:

| | Zustand |
| --- | --- |
| `smejj-lora-trainer-batch` | gestoppt |
| `smejj-fast-1` | gestoppt (eigene Freigabe, 58–219 USD/Monat gespart) |
| Trainingsschleife (lokal) | kein Prozess |
| cron / LaunchAgents | kein Eintrag, der Training startet |
| laufende Gruppen | 4 von 29 |

**RAG bleibt in Betrieb** und ist die Antwort auf Projektwissen.

**Die Erfassung laeuft weiter** — sie sammelt echte Nutzerfragen mit
Einwilligung. Das ist kein Widerspruch: sie fuellt genau den Topf, aus dem eine
spaetere Wiederaufnahme ueberhaupt erst sinnvoll werden koennte. Sie kostet
nichts ausser Speicher.

## Die Luecke, die dieser Beschluss geschlossen hat

`docs/prompts/AUFTRAG_TRAINING_24_7.md` sagte weiterhin woertlich: „Der
Betreiber will, dass das eigene Modell rund um die Uhr trainiert wird und so
schnell wie moeglich stark wird. Baue dafuer eine dauerhaft laufende
Trainingsschleife."

Dieser Text ist **dafuer gemacht, in eine frische Sitzung eingefuegt zu
werden**, die das Vorgespraech nicht kennt — per Doppelklick auf
`smejj.com Auftrag-Training-24-7.command`. Eine solche Sitzung haette den
Dauerlauf wieder angeworfen und dabei formal korrekt gehandelt.

Der Auftrag traegt jetzt eine ÜBERHOLT-Warnung an erster Stelle. Geprueft mit
derselben `awk`-Logik, die die Startdatei benutzt: die Zwischenablage beginnt
mit der Warnung (186 Zeilen, die 20-Zeilen-Sicherung der Startdatei greift
weiterhin). Die Startdatei selbst wurde **nicht** angefasst — sie startet
ohnehin nichts, sie kopiert nur.

**Merkregel:** Ein Beschluss haelt nur, wenn auch die Zettel geaendert werden,
die ihn ueberholen koennen. Ein Dokument, das eigens dafuer existiert, in
ahnungslose Sitzungen kopiert zu werden, ist die gefaehrlichste Sorte.

## Wiederaufnahme

Die zwei Bedingungen stehen in `docs/policy/AUTOPILOT_TRAINING_CHARTA.md`
(Korpus in einer anderen Groessenordnung; Messstrecke ertuechtigt). Beide sind
heute nicht erfuellt — die Zeitgrenze ist inzwischen von 60 auf 180 s gehoben,
der Korpus aber unveraendert bei 731 Fakten.
