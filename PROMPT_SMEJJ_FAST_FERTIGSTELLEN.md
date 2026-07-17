# Aufgabe: smejj fast 1.0 fertigstellen (Übergabe an neue Claude-Session)

Kopiere alles ab der Linie unten und gib es Claude als neue Aufgabe.

---

Du bist Senior AI Systems Architect für **smejj.com** (Schreibweise IMMER exakt
`smejj.com`, niemals SMEJJ/Smejj). Arbeite eigenständig, triff fachlich sinnvolle
Entscheidungen, frage nicht unnötig nach. Der Betreiber (Wof Kadavanich) ist NICHT
technisch und führt selbst KEINE Schritte aus — du machst alles selbst. Ausnahme:
Kosten und Schutz-Locks brauchen schriftliche Freigabe mit **Dienst + Betrag**;
ein pauschales "Ja" ist KEINE Budget-Freigabe. Antwortstil: kurz, einfache Sprache,
Ergebnis zuerst. Behaupte NIE etwas als erledigt, was du nicht live gemessen hast.

## Pflicht vor dem Start

Lies in dieser Reihenfolge:
1. `AI_Guidelines.md` (besonders Abschnitt 0.1 Arbeitsweise)
2. `Memory_Bank.md` (die letzten Einträge vom 2026-07-17 zu "smejj fast 1.0")
3. `docs/architecture/SMEJJ_FAST_1_SELF_HOSTED_2026-07-17.md`
4. `UPLOAD-ZU-IDRIVE/2026-07-17-smejj-fast/DEPLOY_NOTIZ.md`

## Was bereits fertig ist (nicht neu bauen)

- **Router-Anbindung fertig und getestet.** `src/shared/modelRegistry.js` enthält den
  Eintrag `smejj-fast-1` (provider `salad`, envPrefix `FAST`, Header `Salad-Api-Key`,
  `enabledByDefault: false`, `featureFlag: SMEJJ_FAST_1_ENABLED`,
  `fallbackModelId: glm-5-2`, `defaultModel: "smejj-fast-1"`).
  `autoModelId()` wählt bei Profil `fast` das eigene Modell — NUR wenn Flag UND
  Runtime vollständig sind. 7 Schutz-Tests in `tests/model-registry.test.mjs`.
  Alle Router-/Modell-Suiten: 34/34 grün.
- **Dreifach fail-closed:** Flag aus ODER BASE_URL fehlt ODER API_KEY fehlt ODER
  `SMEJJ_MODEL_AUTO_ENABLED` aus → automatisch GLM-5.2. Live bewiesen.
- **Salad Container Group `smejj-fast-1` läuft** (Version 2, High-Priorität).

## Aktueller Live-Zustand (Stand 2026-07-17, ~18:30)

- Container Group: `smejj-fast-1`, **Version 2**, Status DEPLOYING
- GPU: NVIDIA GeForce RTX 3090, **$0,25/h = ~5,50 EUR/Tag** (Freigabe war 6,60 EUR/Tag)
- Instanz-Fortschritt: DOWNLOADING ~33 % nach 24 Min, ~1,3 %/Min → Ready ca. 18:50–19:10
- Endpunkt: `https://cacao-wasabi-57etuqmqg1gbbsid.salad.cloud/v1`
- Gateway: **Authentication Required** (Header `Salad-Api-Key`)
- Modell: `unsloth/Qwen3.6-35B-A3B-GGUF` / `Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf`
  (Basis `Qwen/Qwen3.6-35B-A3B`, Apache-2.0, 35,95 Mrd. gesamt / ~3 Mrd. aktiv)
- Wichtige ENV der Container Group: `LLAMA_ARG_ALIAS=smejj-fast-1` (= der
  Modellname in Requests!), `LLAMA_ARG_CTX_SIZE=32768`,
  `LLAMA_ARG_CHAT_TEMPLATE_KWARGS={"enable_thinking":false}`, Port 8080

**Freigabe-Stand (schriftlich):** Option A = High-Priorität, 6,60 EUR/Tag,
**ausdrücklich auf 3 Tage begrenztes Experiment**. Abbruch-Kriterium: kein
messbarer Tempo-Vorteil gegenüber GLM-5.2 → stoppen.

## Referenzwerte GLM-5.2 (live gemessen am 2026-07-17, gegen Produktion)

- `/api/chat` Antwortzeit: **3,7–5,4 s**
- `/api/agent` TTFT (Zeit bis erstes Wort): **3,6–8,5 s**
- Control-Server: `https://redbean-caesar-yccqb9olg70i1ehu.salad.cloud`
  (NICHT starfruit-thyme — das gibt 404)

## Deine Aufgaben (Schritt für Schritt)

### 1. Warten bis RUNNING, dann Endpunkt prüfen
Portal: `https://portal.salad.com/organizations/smejjcom/projects/default/containers/smejj-fast-1`
Prüfe `System Events` auf "Instance Interrupted (Node Offline)".
Wenn RUNNING: `GET /health` und `GET /v1/models` gegen den Endpunkt
(Header `Salad-Api-Key`). Erwartung: `/v1/models` listet `smejj-fast-1`.

### 2. Tempo messen (der Moment der Wahrheit)
Miss **TTFT** (Zeit bis erstes Token) und Gesamtzeit, je 5 Läufe, mit identischer
kurzer Frage, gegen BEIDE: das neue Modell UND GLM-5.2. Trage die Zahlen in
`docs/architecture/SMEJJ_FAST_1_SELF_HOSTED_2026-07-17.md` ein.

**Prüfe dabei besonders:** Ob `enable_thinking:false` wirklich greift. Falls die
Antwort mit `<think>` beginnt oder TTFT hoch ist, greift der ENV-Schalter nicht →
dann stattdessen im Request `chat_template_kwargs: {"enable_thinking": false}`
mitsenden (der Router müsste das durchreichen — das ist dann eine Code-Änderung
in `control-server/src/llm/modelRouter.js`, analog zum bestehenden `thinking`-Param).

**Ehrliches Erfolgs-Kriterium:** TTFT deutlich unter 3,6 s. Wenn nicht → stoppen.

### 3. Control-Server verdrahten (NUR wenn Schritt 2 überzeugt)
ENV in der Salad-Gruppe des Control-Servers setzen:
```
SMEJJ_LLM_FAST_BASE_URL=https://cacao-wasabi-57etuqmqg1gbbsid.salad.cloud/v1
SMEJJ_LLM_FAST_API_KEY=<Salad-API-Key>
SMEJJ_LLM_FAST_MODEL=smejj-fast-1
SMEJJ_FAST_1_ENABLED=YES
SMEJJ_MODEL_AUTO_ENABLED=YES
```
**SICHERHEITSREGEL: Du tippst KEINE API-Schlüssel/Secrets selbst in Portale.**
Bereite den Schritt vor und lege ihn dem Betreiber als gesonderte Entscheidung vor.

Danach: neue Control-Server-Version, live testen über smejj.com, Non-Regression
prüfen (Startseite unverändert, 0 Konsolenfehler, Coding-Fragen gehen weiter an
GLM-5.2), Header `x-smejj-model-backend` kontrollieren.

### 4. Danach: Pflicht-Checks + Schutz
`npm run check:guidelines`, `check:architecture`, `check:cost`, `check:security`,
`check:start-lock`, `check:favicon-lock`, `check:llm-router`, plus
`node --test tests/model-registry.test.mjs`. Rollback in
`backups/rollback-2026-07-17-smejj-fast/` aktualisieren, `Memory_Bank.md`
fortschreiben, **vollen Change-Lock** melden.

## Bekannte offene Punkte (nicht vergessen)

1. **Kaltstart-Problem (die eigentliche Dauerlösung):** Jeder Knotenwechsel kostet
   ~80 Min Download. Lösung: eigenes Image mit **eingebackenen** GGUF-Gewichten
   nach ghcr.io. Dann Start ~2 Min → sogar Prioritätsstufe "Lowest" (3,53 EUR/Tag)
   würde wieder funktionieren. ACHTUNG: GitHub-Actions-Runner haben zu wenig
   Plattenplatz für ein ~20-GB-Image — Weg vorher prüfen (lokaler Docker-Push oder
   Gewichte aus IDrive e2 in derselben Region us-west-2 ziehen statt von HuggingFace).
2. **Roter Test, NICHT von dieser Arbeit verursacht:**
   `tests/model-promotion.test.mjs` schlägt fehl mit
   `protected_asset_digest_mismatch` für `scripts/validate-manifests.mjs`,
   `scripts/check-guidelines.mjs`, `tests/training-manifest-policy.test.mjs`.
   Ursache: Diese Dateien wurden am 2026-07-17 (12:51/13:31) legitim geändert, ohne
   die Digests in `idrive-layout/manifests/evaluations/phase1-foundation-benchmark.json`
   nachzuziehen. Das Manifest ist `immutable: true` / `overwriteAllowed: false` =
   SCHUTZ-ARTEFAKT → **nicht eigenmächtig editieren**. Sauberer Weg: neue Suite-Version
   `2026-07-17.1` mit neuen Digests + neuem `versionedObjectKey`. **Braucht Freigabe.**
3. **Trainingsdaten smejj 1.0:** Schritt 1 von 4 ist erledigt (Datenschutz-Abschnitt
   live, SHA `ecf29df1f5f01657074eccfd77c3a5acd40f52b4cfd5d5be3594385788390650` in
   `.env.example` gepinnt). Offen: 12 Schlüssel-ENV-Werte, getrennte
   `IDRIVE_E2_TRAINING_*`-Zugangsdaten, Live-Writer-Probe. Siehe
   `docs/architecture/SMEJJ_1_0_CAPTURE_ABNAHME_2026-07-17.md`.

## Wichtige Lehren aus dieser Runde (nicht wiederholen)

- **Salad-Priorität "Lowest" ist unbrauchbar, wenn der Start länger dauert als die
  Knoten-Lebensdauer.** Belegt: Knoten starb nach 32 Min mitten im Download.
  Faustregel: Startdauer << Knoten-Lebensdauer, sonst höhere Priorität ODER
  Gewichte ins Image backen.
- **Salad hat gepflegte Rezepte** (vLLM, SGLang, llama.cpp, TEI, Ollama) — vor jedem
  Eigenbau die Rezeptliste prüfen.
- **Rezept-Defaults sind nicht sicher:** Der Gateway-Default war "Authentication:
  Not Required" = offener LLM-Endpunkt im Internet. Immer prüfen.
- **50xx-GPUs brauchen CUDA 12.8** (Portal-Warnung) — nur wählen, wenn das Image das
  nachweislich unterstützt.
- **Der served-model-name (LLAMA_ARG_ALIAS) ist der Vertrag** zwischen Container und
  Router. Beide Seiten müssen zusammenpassen, sonst 404.

## Ehrliche Erwartungshaltung (wichtig, bitte dem Betreiber gegenüber vertreten)

Das Ziel des Betreibers lautet: "programmieren wie Codex, chatten wie Codex,
blitzschneller als Gemini/ChatGPT/Claude".

Ehrlich einzuordnen:
- **Erreichbar:** deutlich schneller als der heutige Zustand (3,7–5,4 s), weil die
  Wartezeit heute durch den Weg zur z.ai-API entsteht.
- **NICHT erreichbar mit einer 5,50-EUR/Tag-Consumer-GPU:** schneller als
  Gemini Flash / ChatGPT / Claude zu sein. Die laufen auf Spezial-Hardware in großen
  Rechenzentren. Ein 35B-Modell auf einer RTX 3090 liefert grob 40–80 Tokens/s;
  die großen Anbieter liefern ein Vielfaches bei niedrigerer TTFT.
- **Qualität:** Qwen3.6-35B-A3B ist ein starkes offenes Modell, aber es erreicht
  NICHT das Niveau von GLM-5.2 (753B) bei schwerem Coding. Deshalb die Rollen-
  trennung: kurze Chats → eigenes Modell, Coding/Reasoning → GLM-5.2.
- Wer echte Spitzen-Geschwindigkeit für kleine Modelle will, müsste Anbieter wie
  Groq/Cerebras prüfen (bereits im Router-Katalog vorhanden) — das ist dann aber
  KEIN eigenes Modell mehr, sondern wieder eine fremde API.

Sag dem Betreiber diese Grenzen klar, statt sie zu überversprechen.
