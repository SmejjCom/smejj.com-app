# Korpusarbeit: die drei Blocker sind zu — das Problem ist es nicht

Stand 2026-08-06, gemessen, nicht uebernommen.

## Die drei Blocker aus `PROMPT_TRAINING_KORPUS_BLOCKER.md`

| Blocker | Zustand | Beleg |
| --- | --- | --- |
| 1 — Zerleger versteht `====` nicht | **zu** | MASTER_PROMPT.md: 1 → **13 Fakten** |
| 2 — Regeldokumente fehlen als Quellen | **zu** | `MASTER_PROMPT.md`, `AGENTS.md` in `QUELLEN` |
| 3 — drei Schablonen sind keine Vielfalt | **zu** | `FRAGE_SCHABLONEN`: 3 → **15** |

## Was das gebracht hat

| | Vermessung 2026-08-05 | jetzt |
| --- | --- | --- |
| Dateien | 112 | 119 |
| Zeilen | 2.097 | **10.965** |
| **echte Fakten** | 699 | **731** |
| Zeilen je Fakt | 3 | **15** |

Die Zeilenzahl hat sich **verfuenffacht**. Die Faktenzahl ist um **32**
gestiegen (+4,6 %).

Der gesamte Zuwachs an Zeilen kommt aus der Schablonenzahl, nicht aus neuem
Wissen. Und damit steht die Korpusarbeit vor der Regel, die im Modul
`fragevarianten.js` seit dem 2026-08-05 als Warnung steht:

> Drei Formulierungen derselben Frage sind keine drei Beispiele.
> Sie sind ein Beispiel mit drei Etiketten.

Aus drei Etiketten sind fuenfzehn geworden. Ob das die gemessene
Verschlechterung (Grundlinie 95,88 %, trainiert 67,89 %) lindert oder
**verstaerkt**, ist eine offene empirische Frage — die Richtung ist nicht
selbstverstaendlich, denn jeder Fakt erscheint jetzt fuenfzehnmal in fast
gleicher Rahmung.

## Der eigentliche Engpass, in einer Zahl

Der Trainingsplan veranschlagt **30.000** Beispiele. Der Korpus hat **731
Fakten** — **2,4 %** davon. Kein Umbau am Zerleger und keine weitere
Schablone aendert daran etwas: die 112 Projektdokumente enthalten so viel
Wissen, wie sie enthalten.

Mehr Fakten gaebe es nur aus mehr Quellen. Mehr **Fragenvielfalt** — und die
ist laut Messung das eigentliche Problem — nur aus zwei Richtungen, und beide
brauchen Menschen:

1. **Echte Nutzerfragen** aus dem Betrieb. Die Erfassung dafuer ist gebaut,
   ausgeliefert und geschuetzt — sie kann nur noch nicht schreiben (sechs
   Speicher-Werte fehlen, siehe
   `docs/approvals/2026-08-05-change-lock-einwilligung.md`).
2. **Von Hand geschriebene Fragen** in `training-fragen/varianten.json`,
   Herkunft `hand`.

**Was ausgeschlossen bleibt:** Fragen von einem Sprachmodell erzeugen zu
lassen. Das verbietet `SMEJJ_1_0_TRAINING_DATA_POLICY.md`, und die Regel
richtet sich ausdruecklich gegen den Agenten, der diesen Text schreibt.

## Empfehlung

**Erst messen, dann bauen.** Die naechste sinnvolle Handlung ist nicht ein
weiterer Umbau, sondern die im Auftrag vorgesehene Abschlussmessung: ein
Trainingszyklus mit dem neuen Korpus (Stufe `batch`, rund 2 Cent) und die
volle Suite dagegen.

Sie beantwortet die eine offene Frage — ob 731 Fakten mit 15 Schablonen naeher
an die Grundlinie 95,88 % kommen als 699 mit 3, oder weiter weg. Das
Erfolgskriterium steht im Auftrag und wird nicht nachtraeglich verschoben:
Erfolg ist Annaeherung an die Grundlinie und weniger kritische Faelle, nicht
"befoerdert".

Faellt sie erneut negativ aus, ist das ein ehrliches Ergebnis und die Antwort
lautet **Menge statt Umbau** — also Nutzerfragen erfassen und von Hand
schreiben, nicht weiter am Zerleger drehen.

## Eine Messfalle, in die ich selbst gelaufen bin

Meine erste Faktenzaehlung ergab fuer MASTER_PROMPT.md **1 Fakt** und sah damit
aus, als sei Blocker 1 nicht behoben. Ursache war meine Zaehlung, nicht der
Korpus: `zeilenAusDokument` nimmt die Zerleger-Optionen unter dem Schluessel
`optionen`, und wer sie flach uebergibt, misst still den Zustand ohne
Sonderbehandlung.

**Merkregel:** Ein Nachbau der Aufrufkette misst den Nachbau, nicht die Kette.
Wo es geht, dieselbe Konfiguration verwenden, die auch der Bauer benutzt
(`SONDERBEHANDLUNG` in `scripts/training/build_project_corpus.mjs`).
