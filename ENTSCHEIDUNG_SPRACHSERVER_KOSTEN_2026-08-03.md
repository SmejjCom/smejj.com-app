# Entscheidungsvorlage: Sprachserver für die Sprachwelle (2026-08-03)

**Für:** Betreiber (Wof Kadavanich)
**Von:** KI-Session, im Anschluss an Sprachwelle Stufe 1–3 (sw v200–v202) und den
ChatGPT-Voice-Live-Vergleich vom 2026-08-03.
**Zweck:** Die eine offene Frage der Sprachwelle ist eine Geldfrage, keine
Technikfrage. Hier sind die Varianten mit echten Zahlen — zum Entscheiden reicht
das Kopieren einer Freigabe-Zeile am Ende.

---

## Ausgangslage — was schon da ist (wichtig!)

1. **Die Browser-Sprachwelle ist fertig ausgereizt** (Stufe 1–3 live): kein
   Selbstabbruch mehr, echter Mute, strenge Barge-in-Schwellen, Rückfrage statt
   Blindantwort, Doppel-Sende-Schutz. Verbleibende Schwächen sind
   architektur-bedingt: die Browser-Spracherkennung verhört sich („smeeting
   nach"-Klasse), und Unterbrechen-mitten-im-Wort gegen den eigenen
   Lautsprecher geht nur serverseitig.
2. **Ein kompletter Streaming-Sprach-Worker liegt fertig im Repo:**
   `workers/smejj-voice/` — Pipecat-Pipeline (Browser-Mikro per WebSocket →
   faster-whisper large-v3 mit automatischer Spracherkennung → smejj-Router →
   Piper/XTTS-Neuralstimme), Silero-VAD-Barge-in, Budget-Gate gespiegelt vom
   Control-Server, **Idle-Auto-Abschaltung nach 120 s** (GPU-Abrechnung endet,
   wenn niemand spricht), harter Laufzeitdeckel. Status:
   `proposed-pending-deploy` — gebaut gegen die damalige Vorgabe „nur bei
   Nutzung, Auto-Abschaltung, **max 10 USD/Monat**, fail-closed". Es fehlt nur
   der Deploy-Beschluss.
3. **Das Frontend ist bereits verdrahtet:** die Premium-Stimme
   (`voice-premium-tts.js`) prüft beim Öffnen des Sprachmodus, ob ein
   Server-TTS-Worker läuft, und fällt sonst lautlos auf die Browser-Stimme
   zurück. Ein deployter Worker würde ohne Frontend-Änderung greifen.
4. **Groq-Free-Tier ist bereits genehmigt und live** (Welle 2, Freigabe
   2026-07-21, 0-Euro-Deckel, kein Zahlungsmittel hinterlegt) — derselbe
   Anbieter bietet Whisper-Transkription an.

---

## Die Varianten

### A — Status quo (0 €/Monat)

Bleibt wie es ist. Nach Stufe 1–3 solide; beim Zuhören nach der Antwort sogar
strenger als ChatGPT (gemessen: ChatGPT beantwortet Raumgeräusche, wir fragen
nach). Schwächen: Verhörer der Browser-Erkennung, Barge-in stoppt satzweise
statt wortgenau.

### B — „Groq-Ohr": Whisper-Transkription über den bestehenden Groq-Zugang (≈ 0 €/Monat)

Der größte Qualitätssprung pro Euro. Die schwächste Komponente ist die
Browser-Spracherkennung — genau die ließe sich ersetzen: Browser nimmt die
Äußerung auf (MediaRecorder), schickt sie über die Bridge an **Groq
`whisper-large-v3-turbo`**, bekommt ein Transkript in ChatGPT-Qualität zurück.

- **Kosten:** Free-Tier erlaubt **2 000 Transkriptions-Anfragen pro Tag** —
  eine Äußerung = eine Anfrage; selbst Dauernutzung bleibt weit darunter.
  **0 €**, im bereits freigegebenen 0-Euro-Deckel-Muster (kein Zahlungsmittel
  im Konto). Käme je ein Bezahlkonto: 0,04 USD pro Audio-Stunde — eine Stunde
  Sprechen am Tag wäre ~1,20 USD/Monat.
- **Was es bringt:** wortgenaue Transkription inkl. Interpunktion, automatische
  Spracherkennung aller Sprachen (das 14-Sprachseiten-Problem löst sich mit).
  Verhörer-Klasse „smeeting nach" verschwindet weitgehend.
- **Was es NICHT bringt:** kein wortgenaues Barge-in (das Vorlesen bleibt wie
  heute), Latenz pro Frage ~0,5–1 s höher als Web Speech (Aufnahme erst zu Ende,
  dann Transkription — Groq transkribiert eine Stunde Audio in ~15 s, die
  Anfrage selbst ist schnell).
- **Ehrlich zu wissen:** Die Audio-Daten gehen an Groq (US-Server). Heute gehen
  sie bereits an Google (Web Speech API) — datenschutzlich also kein neues
  Fass, aber es gehört in die Datenschutzerklärung.
- **Aufwand:** überschaubar (Bridge-Route + Aufnahme-Pfad im Browser +
  Fallback auf Web Speech, wenn die Route nicht antwortet).

### C — Der fertige Voice-Worker auf Salad-GPU (ChatGPT-Architektur, ~2–8 USD/Monat bei Nutzung)

Deployt `workers/smejj-voice/` — dann läuft die volle Streaming-Pipeline:
Whisper-Transkription, **wortgenaues Barge-in** (Silero VAD schneidet die
Ausgabe sofort), natürliche Neuralstimme, alle Sprachen automatisch.

- **GPU-Preise Salad (Stand 2026-08):** RTX 3060 12 GB **0,084 USD/h**,
  RTX 3090 24 GB **0,124 USD/h**, RTX 4090 **0,204 USD/h**. Empfehlung:
  RTX 3090 (large-v3 + TTS bequem im Speicher).
- **Nur-bei-Nutzung (so ist der Worker gebaut):** Abrechnung läuft nur, solange
  gesprochen wird; 120 s nach der letzten Sitzung schaltet er sich ab.
  - 30 min Sprachnutzung/Tag → ~17 GPU-h/Monat → **~2,10 USD/Monat**
  - 1 h/Tag → ~33 GPU-h → **~4,10 USD/Monat**
  - 2 h/Tag → ~64 GPU-h → **~7,90 USD/Monat**
  - Alles innerhalb des ursprünglich vorgesehenen 10-USD-Deckels; das
    Budget-Gate erzwingt ihn fail-closed.
- **Der ehrliche Haken — Kaltstart:** Nach der Abschaltung braucht der nächste
  Sitzungsstart Minuten (Salad-Container-Start; gemessen an euren anderen
  Workern eher 5–15 min). Die erste Sprachfrage des Tages hätte also eine
  spürbare Wartezeit, oder man hält Warmfenster:
  - Warmfenster 8 h/Tag (z. B. 9–17 Uhr): ~244 GPU-h → **~30 USD/Monat (3090)**
    bzw. ~20,50 USD/Monat (3060) — sprengt den 10-USD-Deckel.
  - Pragmatischer Mittelweg: Nur-bei-Nutzung + der Sprachmodus-Knopf weckt den
    Worker und überbrückt die Startminuten mit der heutigen Browser-Pipeline
    (die bleibt als Fallback ohnehin bestehen).
- **Aufwand:** Image bauen/pushen (Skript existiert), Salad-Containergruppe
  anlegen (im genehmigten Salad-Rahmen), ENV-Budget-Gate setzen, Latenz- und
  Barge-in-Messung live. Kein Frontend-Umbau nötig (Punkt 3 oben).

### D — Fertig-APIs als Referenz (OpenAI Realtime): **nicht empfohlen**

ChatGPTs eigene Technik als Miet-API: je nach Gesprächsanteil ~0,06–0,11 USD
**pro Minute** — eine Stunde Gespräch am Tag wären **~110–200 USD/Monat**.
Kollidiert mit Free-only und ist gegen Variante C um den Faktor 20–50 teurer.
Nur als Anker aufgeführt.

---

## Empfehlung

**Zweistufig:**

1. **Variante B zuerst** — 0 €, im bereits genehmigten Groq-Muster, beseitigt
   die mit Abstand meistgespürte Schwäche (Verhörer). Geringes Risiko, voller
   Fallback.
2. **Variante C dazu, wenn der ChatGPT-Eindruck gewünscht ist** — der Worker
   liegt fertig da, kostet bei realer Nutzung 2–8 USD/Monat unter hartem
   10-USD-Deckel. Einzige echte UX-Frage ist der Kaltstart; mit
   Browser-Fallback als Überbrückung ist sie erträglich.

Variante D verwerfen.

---

## Freigabe-Zeilen zum Kopieren

Für **Variante B**:

> Freigabe Sprachwelle Stufe 4 (Betreiber, 2026-08-03): Groq-Whisper-Transkription
> über den bestehenden Groq-Free-Tier-Zugang (0-Euro-Deckel, kein Zahlungsmittel),
> Bridge-Route + Browser-Aufnahmepfad mit Web-Speech-Fallback; Hinweis in der
> Datenschutzerklärung ergänzen.

Für **Variante C** (Betrag laut Policy ausdrücklich nennen):

> Freigabe Sprachserver (Betreiber, 2026-08-03): Deploy von workers/smejj-voice
> als Salad-GPU-Containergruppe (RTX 3090), nur-bei-Nutzung mit Idle-Abschaltung,
> Budget-Deckel maximal 10 USD/Monat, fail-closed; Dienst: SaladCloud (bestehendes
> Konto), Betrag: bis 10 USD/Monat.

Ohne Freigabe passiert nichts — beide Varianten starten keinerlei bezahlte
Ressourcen von selbst.

---

## Quellen

- [Salad GPU Cloud Pricing](https://salad.com/pricing) — RTX-Stundenpreise
- [Groq: Whisper Large v3 Turbo](https://groq.com/blog/whisper-large-v3-turbo-now-available-on-groq-combining-speed-quality-for-speech-recognition) und [Groq-Preisübersicht 2026](https://www.cloudzero.com/blog/groq-pricing/) — 0,04 USD/Audio-Stunde, Free-Tier-Limits
- [OpenAI Realtime API Pricing 2026](https://www.layer3labs.io/guides/openai-realtime-api-pricing) — Minutenkosten der Referenz
- Repo: `workers/smejj-voice/README.md` (Architektur, Budget-Gate, Idle-Abschaltung), `RUNBOOK_WELLE2_GROQ_0EURO_2026-07-21.md` (genehmigtes Groq-Muster)
