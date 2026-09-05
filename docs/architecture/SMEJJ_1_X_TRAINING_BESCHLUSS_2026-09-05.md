# Beschluss 2026-09-05: kein LoRA-Training mehr auf erzeugten Vorlagen

Betreiber-Entscheidung 2026-09-05 (nach drei gemessenen Kandidaten): „Training einstellen,
Beschluss festhalten."

## Was gemessen wurde (smejj-chat-core-v1, 14 Fälle × 3 Wiederholungen, Salad-Messjob)

| Kandidat | Datensatz | Schritte | Loss | Note | Kritisch | Bericht |
|---|---|---|---|---|---|---|
| Qwen3-4B-Instruct-2507 nackt | — | — | — | **91,2 %** | 1 | modeleval-smejj-chat-core-qwen3-4b-basis-smejj11-20260905105320-messung.json |
| smejj-1-1 | 16.234 Paare (59 % Sicherheit), 4.328 gesehen | 541 | 0,0067 | 70,6 % | 4 | …smejj-1-1-smejj11-20260905113548-messung.json |
| smejj-1-2 | 12.386 Paare (gemischt, Regeltreue), 11.016 gesehen | 1.377 | 0,027 | 70,6 % | 4 | …smejj-1-2-smejj11-20260905221014-messung.json |
| smejj-1-2-frueh | wie 1-2, Zwischenstand | 255 | 0,2 | 70,6 % | 4 | …smejj-1-2-frueh-smejj11-20260905224254-messung.json |

Alle drei wurden von Autopilot Nr. 83 abgelehnt (kritische_fehler:4, nicht_besser_als_basis).
Der Alias `smejj` zeigt weiter auf das Standardmodell GLM-5.2.

## Warum

- **Schablonen-Kollaps.** Der erzeugte Datensatz besteht aus wenigen Bauarten mit festen
  Antwortmustern. Das Modell lernt die Muster, nicht das Verhalten: „Das ist gesperrt" auf
  eine Kostenfrage, „Das kann ich nicht tun" auf die Bitte um einen Diff, ein JSON-Objekt statt
  eines Diffs. Der Regeltreue-Datensatz behob die vier Regel-Fälle und riss vier andere.
- **Früher Stopp hilft nicht.** Schon bei Schritt 255 (Loss 0,2) dieselben Muster.
- **Die Basis ist bereits gut.** 91,2 % ohne Training. Jede Vorlagen-Feinabstimmung senkte die
  Note um 20 Punkte — dieselbe Lehre wie am 06.08. (RAG erreichte 96 %, jede Korpus-
  Verbesserung senkte die Note).

## Was bleibt und was gilt

- Kein weiterer LoRA-Lauf auf erzeugten Vorlagen (Stufe 0 des Trainingswegs). Trainingsplan
  02.09. bleibt in Kraft: ein Lauf braucht ≥ 3.000 ECHTE Paare (Einwilligung, Fragen-Erfassung).
- Die Kette ist fertig und bewiesen: Messung (`smejj-1-1-messen.mjs`), Bewertung nach
  `smejj/bewertungen`, Register `smejj/versionen`, Autopilot Nr. 83, Alias im Router,
  `/api/health.smejjAlias`. Sie wartet auf einen Kandidaten, der die Basis schlägt.
- Adapter, Zwischenstände und Berichte bleiben auf e2 bzw. in `docs/benchmarks/` (nichts löschen;
  e2 ist ohnehin unveränderlich).
- Gelernte Fallen (Memory): Salad startet fertige Jobs neu; ein Abbruch hinterlässt halbe
  Zwischenstände; nachträgliches Anhängen eines Adapters an das nf4-Modell stirbt hart;
  Doppelklick-Skripte müssen „deploying" als belegt werten.

## Nächster sinnvoller Schritt (nicht beschlossen)

Echte Paare sammeln: Fragen-Erfassung mit Einwilligung läuft (Nr. 74), aber bei ~1 Frage/Tag.
Bis ≥ 3.000 echte Paare vorliegen, ruht das Training. Alternativ das nackte Basismodell als
`smejj-1-0` mit Laufzeit führen — es bleibt unter der Live-Referenz (100 %) und würde den Alias
nicht übernehmen.
