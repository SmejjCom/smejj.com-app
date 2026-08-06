# Freigabe — Toleranz der Trainingsschleife

**Datum:** 2026-08-06
**Betreiber-Freigabe im Wortlaut:**

> FREIGABE — Toleranz der Trainingsschleife, 2026-08-06
> Ich gebe frei, in workers/smejj-lora-loop/cycle.js die Toleranz für unklare
> Statusantworten von 3 auf 16 Abfragen zu erhöhen (90 Sekunden auf 8 Minuten).
> Kosten- und Laufzeitdeckel bleiben unverändert.

## Anlass — drei bezahlte Läufe, die an einem Netzproblem starben

In der Nacht auf den 2026-08-06 brachen drei Trainingszyklen mit
`trainer_zustand_unbekannt` ab, **während die GPU normal weiterrechnete**. Der
Trainer meldete sich dabei durchgehend als gesund (`bereit: true`, Modell
geladen); ausgefallen war Salads Zugangsschicht.

Gemessen: die Statusabfrage der Schleife 24-mal über 12 Minuten exakt
nachgestellt (gleiche Adresse, Kopfzeilen, 30-Sekunden-Takt):

```
Runde  1-2    HTTP 404   (Trainer antwortet korrekt: Lauf gibt es nicht)
Runde  3-6    HTTP 503
Runde  8      fetch failed
Runde 11-24   HTTP 503 — 14 Abfragen AM STÜCK
```

Nur **ein** echter Verbindungsabbruch in 24 Versuchen; der Rest sind 503 des
Gateways. Die alte Toleranz von 3 Abfragen (≈ 90 s) konnte das nicht überbrücken.

| Zyklus | Zuschnitt | Ausfallgrund |
|---|---|---|
| 4 | r16 | Gateway, ~7 min |
| 5 | r32 | Zeitgrenze 90,3 > 90 min (separat behoben) |
| 6 | r8 | Gateway, 78 min |

## Die Änderung

`UNBEKANNT_TOLERANZ` von **3 auf 16**. Bei 30 s Abstand plus 20 s Zeitgrenze je
Abfrage sind das rund **8 Minuten**.

**Was ausdrücklich NICHT geändert wurde:** Laufzeit- und Kostendeckel. Sie werden
in derselben Schleife bei **jedem** Durchgang geprüft (`mussNotausAusloesen`) —
die Karte läuft also zu keinem Zeitpunkt unbeaufsichtigt weiter.

Ein Ausfall wie die gemessenen 78 Minuten führt weiterhin zum Abbruch. Das ist
gewollt: acht Minuten sind ein Schluckauf, achtundsiebzig sind ein Ausfall.

## Nachweis

Zwei neue Tests halten **beide** Seiten der Grenze fest — ohne den zweiten wäre
die Toleranz beliebig erhöhbar, ohne dass ein Test widerspricht:

```
✔ ein achtminuetiger Gateway-Ausfall verwirft den bezahlten Lauf NICHT
✔ ein DAUERausfall bricht weiterhin ab — die Toleranz ist begrenzt

tests/lora-loop-zyklus.test.mjs: 18 bestanden, 0 fehlgeschlagen
```

## Offen

Die Wirkung ist **nicht live gemessen** — dafür braucht es einen Zyklus, der
tatsächlich in einen kurzen Gateway-Aussetzer läuft. In der Nacht der Messung
war das Netz zu instabil, um weitere Zyklen zu kaufen (0,72 USD von 50
verbraucht, fünf Versuche ohne Punktzahl).

**Der changelog-bereinigte Korpus ist damit weiterhin ungemessen.** Beide
verwertbaren Zahlen (61,76 % und 62,75 %) stammen vom alten, verunreinigten
Korpus; die Grundlinie ohne Training liegt bei 95,88 %.
