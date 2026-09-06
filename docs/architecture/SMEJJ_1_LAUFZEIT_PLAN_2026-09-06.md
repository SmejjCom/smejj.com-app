# Laufzeit für smejj 1 — Plan (Stand 2026-09-06)

Betreiber-Wahl 2026-09-06: „Laufzeit für smejj 1 planen." Nur Plan, nichts gebaut.

## 1. Wozu die Laufzeit da ist — und wann sie sich lohnt

Der Alias `smejj` (Nr. 83) zeigt nur dann live auf ein eigenes Modell, wenn
1. eine Version im Register **stable** ist (besser als Basis nackt, null kritische Fehler),
2. ihre Note die **Referenz der Live-Kette** erreicht (heute 100 % laut Nr. 75, Toleranz 2 Punkte),
3. die Laufzeit steht: `SMEJJ_1_ENABLED=YES` + `SMEJJ_LLM_SMEJJ1_BASE_URL` + `SMEJJ_LLM_SMEJJ1_API_KEY`
   und die Gesundheitsprobe (`modelRuntimeHealth.probeSelbstGehostet`) grün.

**Ehrlicher Stand:** Es gibt heute keinen Kandidaten, der Punkt 1 oder 2 erfüllt (Basis nackt 91,2 %,
drei Adapter je 70,6 %, Beschluss 05.09.: kein Training auf Vorlagen). Eine Laufzeit, die rund um die
Uhr läuft, würde deshalb heute NICHTS bedienen — sie kostete nur. Der Plan ist darum gestuft: erst das,
was nichts kostet und später ohnehin gebraucht wird.

## 2. Drei Wege, mit Zahlen

| | A: Salad-GPU 24/7 | B: Silicon-Valley-Server (CPU) | C: bei Bedarf (Salad-Job) |
|---|---|---|---|
| Technik | vLLM mit `--enable-lora` (Adapter aus e2) ODER llama.cpp mit GGUF | llama.cpp-Server, Qwen3-4B Q4_K_M (~2,5 GB) + Adapter als GGUF-LoRA | wie A, aber Gruppe nur laufend, wenn Nutzer da sind |
| Wo | Salad Container Group `smejj-1`, RTX A5000/3090 Ti, Prioritaet Lowest | Zeabur-Projekt `untitled-1` (2C/8GB, schon bezahlt, neben `smejj-bild-maler`) | Salad, Gruppe `smejj-1` mit replicas 0/1 |
| Tempo | 30–60 Token/s | 3–6 Token/s (2 Kerne), 100 Token ≈ 20–30 s | wie A, plus Kaltstart |
| Kosten | 0,09–0,10 USD/h → **2,2–2,4 USD/Tag, ~70 USD/Monat** | **0 USD** zusätzlich | 0,10 USD je Betriebsstunde; Kaltstart 20–40 min (Abbild-Pull, gemessen 05.09.) |
| Verfügbarkeit | Lowest = Preemption möglich (05.09. dreimal erlebt); Nr. 83 schaltet den Alias bei Rot ab | stabil, aber langsam; RAM teilt sich mit dem Bild-Maler (4 GB) | schlecht: Nutzer warten auf den Start |
| Passt zu | echter Nachfrage nach dem eigenen Modell | Vorbereitung, Beweis, Nischennutzung (`fast`-Profil ohne Tempo-Anspruch) | nichts — nur zum Messen (gibt es schon: Messjob) |

**Empfehlung:** Weg B als Vorbereitung bauen (kostenlos, beweist den ganzen Pfad Router → Laufzeit →
Gesundheit → Alias). Weg A erst, wenn ein Kandidat die Referenz erreicht UND die Antwortzeit von B
gemessen nicht reicht. Das Budget von 10 USD/Monat (Trainingsplan 02.09.) deckt A nicht — A braucht
eine eigene Betreiber-Freigabe über rund 70 USD/Monat.

## 3. Bauschritte für Weg B (Reihenfolge)

1. **GGUF erzeugen (Salad-Job, ~0,05 USD, einmalig je Version):** Basis Qwen3-4B-Instruct-2507 von
   e2 → `convert_hf_to_gguf.py` → Q4_K_M (~2,5 GB) nach e2 `models/gguf/qwen3-4b-instruct-q4km.gguf`;
   Adapter → `convert_lora_to_gguf.py` nach e2 `models/gguf/<version>-lora.gguf` (~130 MB).
   Eigener Job-Ordner `scripts/training/smejj-laufzeit-job/` (Buendel wie beim con-Job, con-Code unangetastet).
2. **Dienst `smejj-hausmodell` in untitled-1:** llama.cpp-Server (OpenAI-kompatibel), `--model` Basis-GGUF,
   `--lora` Adapter-GGUF, `LLAMA_ARG_ALIAS=smejj-1`, ctx 4096, KV-Cache q8_0, `OMP_NUM_THREADS=1`,
   Lebenszyklus wie im Hausmodell-Plan 01.09.: ACTIVE → WARM (5 min) → Gewichte entladen (Leerlauf ≈ 0 MB),
   SSD-Cache 20 GB, höchstens 1 Inferenz gleichzeitig. Schlüssel `SMEJJ_LLM_SMEJJ1_API_KEY` als Bearer/Salad-Header.
3. **Versionswechsel ohne Neustart:** der Dienst liest beim Laden `smejj/versionen/register.json`
   (stable → welche Adapter-GGUF). Nr. 83 hängt um, der Dienst zieht beim nächsten Laden nach. Rückweg = altes GGUF bleibt.
4. **Control-Server:** drei Env-Werte im Zeabur-Portal (Betreiber-Klick), sonst nichts — Registry-Eintrag
   `smejj-1`, Router, Alias und `/api/health.smejjAlias` sind seit 05.09. live.
5. **Wächter-TÜV vor dem Einschalten:** kaputte Probe (Dienst aus → Gesundheit rot → Alias bleibt AUS,
   GLM antwortet) und gesunde Probe (Dienst an → `smejjAlias.live` nur, wenn Register live sagt).
   Livetest: Antwort über `smejj`-Alias, RAM-Entladen nach 5 min, gleichzeitiges Bild ohne OOM-Kill.
6. **Messung derselben Suite über die Laufzeit** (run_model_eval.mjs mit `--model smejj-1`), damit Register-Note und Laufzeit-Note dieselbe Zahl zeigen.

## 4. Was den Plan zu Fall bringt (vorher wissen)

- **RAM auf dem SV-Server:** Bild-Maler hält ~4 GB; Qwen3-4B Q4_K_M braucht ~3 GB + KV-Cache. 8 GB reichen
  nur mit Entladen im Leerlauf und höchstens einer Inferenz. Vor dem Bau messen (Zeabur-Metriken).
- **Tempo:** 3–6 Token/s liegt unter der Schnellspur (Groq 0,7 s bis zum ersten Token). Für `default`/`coding`
  ist das zu langsam; der Alias sollte anfangs nur greifen, wenn die Antwortzeit-Budgets der Suite halten.
- **Der Adapter:** heute gibt es keinen, der besser ist als die Basis. Weg B kann mit dem nackten
  Basismodell (91,2 %) starten — als `smejj-1-0` im Register; er ginge trotzdem nicht live (Referenz 100 %).
- **Salad-Fallen (Memory):** Gruppen starten fertige Jobs neu, Abbild-Pull 20–40 min, Preemption bei Lowest —
  für einen Dauerdienst auf Salad hieße das Prioritaet Medium/High (0,22–0,28 USD/h, ~160–200 USD/Monat).

## 5. Entscheidungen, die nur der Betreiber treffen kann

1. Weg B bauen (0 USD, ~1 Tag Arbeit, beweist den Pfad) — ja/nein.
2. Weg A freigeben (rund 70 USD/Monat bei Lowest, 160–200 bei stabiler Priorität) — heute nicht empfohlen.
3. Nacktes Basismodell als `smejj-1-0` ins Register — ja/nein (ändert nichts am Alias, macht die Laufzeit messbar).
