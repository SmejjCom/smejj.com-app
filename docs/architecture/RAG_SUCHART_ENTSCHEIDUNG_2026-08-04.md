# Entscheidungsvorlage: Wie smejj.com sein Projektwissen findet

**Stand 2026-08-04 · Entscheidung liegt beim Betreiber · nichts umgesetzt**

> **NACHTRAG 2026-08-05 — Stufe 1 wurde gebaut und gemessen. Sie hat nicht
> gewirkt.** Zwei volle Laeufe: RAG-12 78,3 %, mit Nachsortierer 79,0 % bzw.
> 78,7 % — alles innerhalb des Rauschbands von 1,7. Der Nachsortierer bewegt die
> Note nicht. Grund gemessen: in **51 %** der Aufrufe legt BM25 gar keine
> brauchbare Quelle ins Becken (234 unter der Schwelle, 221 abgelehnt von 885).
> Wer besser waehlt, findet nichts, was nicht da ist.
> **Damit ist die in Abschnitt 6 genannte Bedingung fuer Stufe 2 erfuellt.**
> Details: `docs/memory/Memory_Bank_2026-08-05_nachsortierer.md`.

Diese Vorlage beantwortet eine Frage: **Womit sucht smejj.com kuenftig sein
Projektwissen?** Alle Zahlen darin sind gemessen, nicht geschaetzt. Die Messwege
stehen jeweils dabei, damit jede Zahl nachpruefbar bleibt.

---

## 1. Warum ueberhaupt etwas geaendert werden soll

Am 2026-08-04 wurden zwei volle Laeufe ueber 295 Faelle gefahren, identisch bis
auf einen Unterschied: Projektwissen im Prompt (Schwelle 12) gegen kein
Projektwissen. Modell GLM-5.2, je drei Wiederholungen, 1.770 Aufrufe.

| Gruppe | Faelle | vorher → nachher | |
| --- | ---: | --- | ---: |
| MIT Kontext | 217 | 74,3 % → 76,8 % | **+2,5** |
| OHNE Kontext (Kontrollgruppe) | 78 | 80,9 % → 79,4 % | **−1,4** |
| | | **Differenz von Differenzen** | **+4,0** |

**Projektwissen im Prompt wirkt: +4,0 Punkte.** Das liegt ausserhalb des
Rauschbands von 1,7 und ist damit belastbar. Kritische Verstoesse fielen von
61 auf 47.

Die Wirkung ist aber ungleich verteilt:

    gewinnt   router +15,0   ehrlichkeit +12,7   kosten +10,5
              performance +8,1   logik +7,6   rag +7,0
    verliert  training −14,4   schutz −9,2

Die Verluste sind der Grund fuer diese Vorlage.

---

## 2. Die gemessene Ursache

Die Suche arbeitet heute mit BM25 — reiner Wortstatistik. Sie kennt
Wortdeckung, aber keinen Themenbezug. Drei Beispiele, alle nachgemessen:

| Frage | was BM25 auf Platz 1 zieht |
| --- | --- |
| Sind Task Capsules als Trainingsdaten nutzbar? | `AI_Guidelines.md :: 7. Kosten-Guardrails` |
| Darf eine verifizierte Funktion ausgebaut werden? | `FREE_ONLY_MASTER_POLICY :: Skalierungsregel` — der Change-Lock in `AGENTS.md` liegt auf Platz 3 |
| API-Key vorsorglich rotieren? | `MULTI_KI_ENV_VORLAGE.md` — eine Deploy-Vorlage statt der BYOK-Sicherheitsregel |

Das zustaendige Dokument existiert jeweils, gewinnt aber nicht. Ein Dokument,
das dieselben Woerter enthaelt, verdraengt es.

**Bereits verworfener Loesungsversuch.** Der MASTER_PROMPT benennt fuenf
Dokumente als verbindlich; nur eines stand in der Quellen-Priorisierung
(`ragRanking.js`). Die vier fehlenden wurden ergaenzt, gemessen — und wieder
zurueckgenommen: bei `lock-funktion-rueckbau` rutschte danach die
Trainingsdaten-Policy auf Platz 2, bei einer Frage zum Change-Lock.

> **Autoritaet ist kein Ersatz fuer Themenbezug.** Eine Gewichtung kann zwischen
> zwei zustaendigen Quellen entscheiden, aber keine unzustaendige aussortieren.

---

## 3. Randbedingungen, die jede Option einhalten muss

Gemessen bzw. aus den Regeldokumenten:

| Groesse | Wert | Bedeutung fuer die Wahl |
| --- | --- | --- |
| Wissenskorpus | **663 Abschnitte, 95 Dateien, 397 KB** | Winzig. Es braucht **keine** Vektordatenbank; ein direkter Vergleich aller 663 Vektoren dauert Mikrosekunden. |
| Laufzeit-Abhaengigkeiten heute | **null** | Eine neue Bibliothek waere die erste ueberhaupt. MASTER_PROMPT: jede Abhaengigkeit muss ihr Gewicht rechtfertigen. |
| Control Server | 2 vCPU / 8 GB, 6 USD/Monat | Traegt kein grosses Modell. |
| Chat-Bruecke | hat **keine** Repo-Dateien | Laedt einen fertig gebauten Index (`installRagIndex`). Jede Loesung muss als Artefakt ausgeliefert werden koennen — der Weg dafuer existiert (`npm run rag:export` → IDrive e2). |
| Budget erster Token | **unter 1,0 s** | Harte Grenze fuer die Schnellspur. |
| Antwortzeit tiefe Spur | p95 9,3 s (GLM-5.2, gemessen) | Hier ist Spielraum. |

---

## 4. Die vier Optionen

### Option A — Nachsortierer (Reranker) mit dem Modell, das schon laeuft

BM25 liefert statt 3 Treffern ein Becken von 10. Ein kurzer Modellaufruf waehlt
daraus die Passage, die die Frage wirklich beantwortet — oder antwortet „keine",
dann wird kein Kontext eingespeist.

**Als Prototyp gebaut und ueber 12 Faelle gemessen:**

| Ergebnis | Faelle |
| --- | ---: |
| BM25 korrigiert (Platz 2, 4, 5, 5, 7 nach vorn) | **5** |
| „keine Passage passt" → fail-closed, kein Kontext | **5** |
| BM25 auf Platz 1 bestaetigt | 1 |

Jede Korrektur holte ein zustaendiges Regeldokument nach vorn
(`SMEJJ_1_0_TRAINING_DATA_POLICY`, `BYOK_SECURITY_POLICY`,
`GITHUB_PAGES_DEPLOY`, `RAG_PROJEKTWISSEN`). Der Nachsortierer repariert damit
**beide** gemessenen Fehlerarten: er hebt die richtige Quelle, und er verhindert
falschen Kontext, indem er ihn ablehnt.

**Zeitkosten: Median 1,2 s, p95 2,1 s** (GLM-5.2 als Nachsortierer, 60 Token).

- Neue Abhaengigkeit: **keine**
- Neuer Anbieter: **keiner**
- Neuer Dienst: **keiner**
- Laufende Kosten: ein kurzer Zusatzaufruf je Frage mit Kontext (BYOK, Bruchteil eines Cents)
- **Haken:** 1,2 s passen **nicht** ins 1-Sekunden-Budget der Schnellspur.
  Loesung: den Nachsortierer auf der **Schnellspur** laufen lassen (Groq 8B,
  gemessene Erst-Token-Zeit 0,70 s) und nur die tiefe Spur damit bedienen —
  dort sind +1,2 s auf p95 9,3 s rund 13 %.

### Option B — Semantische Suche mit lokalem Einbettungsmodell

Ein kleines mehrsprachiges Modell (z. B. multilingual-e5-small, ~118 Mio.
Parameter, 384 Dimensionen) rechnet die 663 Abschnitte einmalig in Vektoren um.
Zur Laufzeit wird nur die **Frage** eingebettet, dann per Kosinus verglichen.

- Speicher: 663 × 384 × 4 Byte = **~1 MB** — faellt neben dem heutigen Index (1,0 MB) nicht auf
- Suche: Vergleich aller 663 Vektoren, **unter 1 ms**
- Fragen-Einbettung auf 2 vCPU: geschaetzt 20–50 ms (**nicht gemessen — Modell muesste geladen werden**)
- Neuer Anbieter: **keiner**. Laufende Kosten: **null**
- **Haken:** braucht `onnxruntime-node` oder Vergleichbares — **die erste
  Laufzeit-Abhaengigkeit des Projekts**, rund 50–150 MB. Das Modell selbst
  (~120 MB) muesste ins Object Brain und in jedes Abbild.

### Option C — Semantische Suche ueber eine Einbettungs-API

Wie B, aber die Einbettung kommt per API.

- Neue Abhaengigkeit: keine. Speicherbedarf: ~1–3 MB
- **Haken 1:** **gemessen — der vorhandene Zhipu-Schluessel hat keinen Zugang zu
  Einbettungsmodellen** (`embedding-3` und `embedding-2` liefern beide
  „Modell existiert nicht"). Es braeuchte also einen **neuen Anbieter**
  → **Rote Liste, schriftliche Freigabe noetig**.
- **Haken 2:** je Frage ein zusaetzlicher Netzaufruf (100–300 ms) und ein
  weiterer Dienst, dessen Ausfall die Suche trifft.

### Option D — Einbettungsdienst auf Salad

Ein eigener kleiner Container haelt das Einbettungsmodell bereit.

- Anbieter bereits freigegeben, Abrechnung stundenweise
- **Haken:** ein **dauerhaft** laufender Dienst — sonst kaltet er aus und die
  erste Frage wartet Minuten. Das ist eine **neue laufende Kostenposition**
  → **Rote Liste**. Fuer 397 KB Wissen ein sehr grosses Werkzeug.

---

## 5. Vergleich

| | A Nachsortierer | B lokal | C API | D Salad |
| --- | :-: | :-: | :-: | :-: |
| Loest das **gemessene** Problem | **belegt** | wahrscheinlich | wahrscheinlich | wahrscheinlich |
| Neue Abhaengigkeit | nein | **ja (erste)** | nein | nein |
| Neuer Anbieter | nein | nein | **ja** | nein |
| Neue laufende Kosten | nein | nein | gering | **ja** |
| Rote Liste beruehrt | nein | nein | **ja** | **ja** |
| Zusatzzeit je Frage | 1,2 s (Median) | ~20–50 ms | 100–300 ms | 100–300 ms |
| Rueckbau bei Misserfolg | ein Schalter | Abhaengigkeit wieder raus | Vertrag | Dienst abschalten |

**Nur bei Option A ist die Wirkung heute belegt.** B, C und D sind plausibel,
aber unmessbar, ohne sie vorher zu bauen.

---

## 6. Empfehlung

**Stufe 1 zuerst: Option A umsetzen und ueber alle 295 Faelle messen.**

Gruende:
1. Sie ist die einzige Option mit belegter Wirkung auf genau den gemessenen Fehler.
2. Sie beruehrt die Rote Liste nicht — keine Abhaengigkeit, kein Anbieter, keine
   laufenden Kosten.
3. Sie ist in einem Schalter rueckbaubar.
4. Sie liefert nebenbei die Messlatte, an der B/C/D spaeter beurteilt werden.

**Stufe 2 nur, wenn Stufe 1 an eine Decke stoesst.** Ein Nachsortierer kann nur
waehlen, was BM25 ins Becken gelegt hat. Bleibt nach Stufe 1 eine Restmenge von
Fragen, deren richtige Quelle gar nicht erst unter den Top 10 auftaucht, ist das
der Beleg fuer semantische Suche — und dann ist **Option B** die richtige
(kein neuer Anbieter, keine laufenden Kosten), trotz der ersten Abhaengigkeit.

Diese Restmenge laesst sich nach Stufe 1 **kostenlos** beziffern: es genuegt zu
zaehlen, wie oft der Nachsortierer „keine Passage passt" sagt, obwohl die Frage
durch ein vorhandenes Dokument gedeckt waere.

**Option C wird nicht empfohlen** (neuer Anbieter fuer einen 397-KB-Korpus).
**Option D wird nicht empfohlen** (dauerhafte Kosten fuer dieselbe Aufgabe).

Dass Kosten keine Rolle spielen, aendert die Empfehlung nicht: A ist nicht
empfohlen, weil sie billig ist, sondern weil sie als **einzige** belegt wirkt
und am schnellsten zur naechsten belastbaren Messung fuehrt.

---

## 7. Was der Betreiber entscheiden muss

- [ ] **Stufe 1 (Option A) freigeben?** Beruehrt die Rote Liste nicht; im Rahmen
      der Gruenen Liste umsetzbar, sobald gewuenscht.
- [ ] **Nachsortierer auf welcher Spur?** Empfehlung: Schnellspur als
      Nachsortierer, nur fuer die tiefe Spur — sonst reisst das 1-Sekunden-Budget.
- [ ] **Stufe 2 erst nach der Messung entscheiden** — die Zahl aus Stufe 1
      beantwortet, ob sie ueberhaupt noetig ist.

**Ohne Freigabe wird nichts umgesetzt.** `ragRanking.js` steht unveraendert im
Stand von HEAD; der verworfene Versuch aus Abschnitt 2 wurde zurueckgenommen.

---

## 8. Messplan fuer Stufe 1

1. Nachsortierer hinter einem Schalter bauen (aus = heutiges Verhalten, Byte fuer Byte).
2. `npm run eval:rag-deckung` — wie viele Faelle bekommen ueberhaupt ein Becken.
3. Voller Lauf ueber 295 Faelle, GLM-5.2, drei Wiederholungen, **mit**
   Nachsortierer — gegen den bestehenden Bericht
   `modeleval-smejj-chat-breit-glm-5-2-rag12-2026-08-04.json`.
4. Kontrollgruppe mitrechnen (Faelle ohne Kontext), sonst wird die Wirkung
   wieder unterschaetzt.
5. Erfolg heisst: **training und schutz verlieren nicht mehr**, und die
   Gesamtwirkung bleibt mindestens bei +4,0.
6. Zusatzzeit gegen die Budgets messen (erster Token, API-p95).

Verschlechtert sich etwas, wird der Schalter umgelegt und der Befund
festgehalten — wie beim verworfenen Versuch aus Abschnitt 2.
