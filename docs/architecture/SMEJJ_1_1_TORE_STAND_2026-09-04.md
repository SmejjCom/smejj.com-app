# smejj 1.1 — welche Tore offen sind und was die restlichen brauchen

Stand: 2026-09-04, abends. Gemessen, nicht geschätzt.

## Warum es dieses Blatt gibt

Der Betreiber hat am 04.09. entschieden: **eigene Paare bauen** statt auf
Nutzerfragen zu warten. Gemessen am selben Tag: 1 erfasste Frage bei einem
Besuch am Tag — auf dem Sammelweg kommen die im Trainingsplan geforderten 3.000
Paare nie zusammen.

Damit ist der einzige Blocker weg, der Zeit gekostet hätte. Was übrig bleibt,
sind Werte im Zeabur-Portal und eine Anbieter-Entscheidung.

## Die sieben Tore

| # | Tor | Stand | Was fehlt |
|---|---|---|---|
| 1 | Daten | **offen** | 10.769 Paare auf e2, Reife Stufe 3/3 (215 %) |
| 2 | Einwilligung | **offen, sobald der Schalter steht** | `SMEJJ_TRAINING_QUELLE=erzeugt` |
| 3 | Messlatte | **offen** | Referenz 90,3 % aus Nr. 75 (tiefe Spur) |
| 4 | Kostenfreigabe | zu | `SMEJJ_LORA_FREIGABE_ID` + Monatsbetrag ≤ 10 USD |
| 5 | Basismodell | zu | Qwen3-4B-Instruct nach e2, dann `SMEJJ_LORA_BASIS_PREFIX` |
| 6 | GPU-Heimat | zu | `SMEJJ_LORA_TRAINER_URL` |
| 7 | Schalter | zu | `SMEJJ_LORA_LOOP_ENABLED`, `SMEJJ_LORA_TRAINING_ENABLED` |

## Die Werte fürs Zeabur-Portal

Alle beim Dienst **smejj-control**. Nach dem Setzen muss der Dienst **neu
gebaut** werden — ein Neustart zieht keine neue Umgebung.

| Variable | Wert | Wofür |
|---|---|---|
| `SMEJJ_TRAINING_QUELLE` | `erzeugt` | Tor 2: ausdrückliche Entscheidung, ohne Nutzerdaten zu trainieren |
| `SMEJJ_LORA_FREIGABE_ID` | frei wählbar, z. B. `freigabe-2026-09-04` | Tor 4: die schriftliche Freigabe bekommt eine Kennung |
| `SMEJJ_LORA_FREIGABE_MONATSBETRAG_USD` | `10` oder weniger | Tor 4: Deckel steht auf 10 USD/Monat |
| `SMEJJ_LORA_BASIS_PREFIX` | `models/staging/qwen3-4b-instruct/` | Tor 5: wo das Basismodell auf e2 liegt |
| `SMEJJ_LORA_TRAINER_URL` | Adresse des Trainers | Tor 6: **Anbieter-Entscheidung, Rote Liste** |
| `SMEJJ_LORA_LOOP_ENABLED` | `true` | Tor 7 |
| `SMEJJ_LORA_TRAINING_ENABLED` | `true` | Tor 7 |
| `SMEJJ_LORA_NOTAUS` | **leer lassen** | gesetzt = Notaus, hält alles an |

## Was noch niemand getan hat: das Basismodell spiegeln

Qwen3-4B-Instruct existiert bei Hugging Face (geprüft 04.09.), rund 8 GB.

**Nicht über den Betreiber-Mac.** Die Leitung liefert 1,5 Mbit/s — 8 GB wären
rund zwölf Stunden, und der Mac ist für Rechenarbeit tabu (Betreiber-Regel).

Der erprobte Weg ist der des con-Autopiloten: `workers/con-autopilot/salad-job/
mirror.py` spiegelt Hugging Face → e2 **auf Salad**, nicht lokal. Für con sind
so 55,6 GB (Qwen3.8-27B) angekommen.

Für smejj 1.1 heißt das: ein Spiegel-Job auf derselben Salad-Gruppe. Das ist
keine neue Kostenposition — die Salad-Freigabe steht, der Deckel liegt bei
10 USD, verbraucht sind bisher 2,85. Es ist aber eine **Entscheidung des
Betreibers**, weil Tor 6 (Anbieter) auf der Roten Liste steht.

## Was danach von allein läuft

Sobald alle sieben Tore offen sind, startet der Modell-Evolutions-Takt
(Autopilot Nr. 72) den Lauf **nicht** von selbst — der GPU-Start bleibt hinter
der Betreiber-Freigabe. Der Takt meldet dann nur: alle Tore offen, Lauf wartet
auf den Klick.

Danach greift die Kette, die seit dem 30.08. gebaut ist: Training → Bewertung
gegen dieselbe Suite, die heute schon misst (smejj-chat-core-v1, 14 Fälle) →
Vergleich gegen die Referenz → Versions-Gate (neue Version nur bei > 3 %
Vorsprung und null kritischen Fehlern) → menschliche Freigabe → Schattenbetrieb.

## Was der Datensatz enthält

10.769 Paare, erzeugt und deterministisch (`scripts/training/smejj-1-1-*.mjs`,
Startwert 20260904 — derselbe Startwert ergibt denselben Datensatz).

| Kategorie | Paare | Was trainiert wird |
|---|---|---|
| Rechnen | 4.454 | Lösung steht rechnerisch fest |
| Abwehr | 4.119 | Angriff in der Frage, Verweigerung IST die Antwort |
| Form | 1.200 | JSON, Rechtschreibung, Plural, Sortieren |
| Ehrlichkeit | 996 | „Das kann ich nicht wissen" statt zu erfinden |

**Warum Abwehr fast so stark wie Rechnen:** con-1.1.0 wurde am 03.09.
verworfen, weil es überwiegend auf Fakten trainiert wurde — es verriet danach
ein Geheimnis und folgte einer Prompt-Injection. Wer nur Fakten trainiert,
trainiert das Verweigern weg.

**Keine Fakten über smejj.com im Datensatz.** Sie ändern sich, und der RAG
deckt sie ab (Lehre 06.08.: jede Korpus-Verbesserung senkte die Note auf
36,6 %, RAG erreichte 96 %).

Die Prüfsuite ist ausgeschlossen — ein Fall im Training würde später nur noch
sich selbst messen.
