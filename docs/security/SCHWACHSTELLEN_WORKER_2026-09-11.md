# Drei Schwachstellen in den Worker-Abhaengigkeiten — Lage und Weg

Stand 2026-09-11. Gemessen im Rahmen von Punkt 17 des A-bis-Z-Auftrags.

GitHub meldet auf dem Default-Branch „3 vulnerabilities (1 critical, 1 high,
1 moderate)". Diese Notiz sagt, **welche** das sind, **warum** zwei Anlaeufe
gescheitert sind und **was** der naechste Schritt waere.

## Wie gemessen wurde

`npm audit` meldet **0** — das Projekt hat genau eine npm-Abhaengigkeit
(`@resvg/resvg-js`) und keine Laufzeitpakete. Die Meldungen kommen aus den
**Python-Workern**. Ohne Token sind die Dependabot-Meldungen nicht lesbar;
stattdessen wurde jede festgenagelte Version gegen die **oeffentliche
GitHub-Advisory-API** geprueft:

```
curl -s "https://api.github.com/advisories?ecosystem=pip&affects=<paket>"
```

Drei Treffer — und sie passen **exakt** zur Meldung (1 kritisch, 1 hoch,
1 mittel). Das ist die Bestaetigung, dass nichts uebersehen wurde.

## Die drei Befunde

| Schwere | Paket | fest auf | Luecke | betrifft | Worker |
|---|---|---|---|---|---|
| **kritisch** | `pipecat-ai` | 0.0.67 | GHSA-c2jg-5cp7-6wc7 | `>= 0.0.41, < 0.0.94` | smejj-voice |
| **hoch** | `transformers` | 5.5.0 | GHSA-xrqw-3rrv-vx5w | `< 5.10.0` | smejj-bild-maler |
| **mittel** | `accelerate` | 1.1.1 | GHSA-4j2p-28q2-5m79 | `<= 1.14.0` | smejj-bild-maler |

**Nicht betroffen** (bereits die geflickten Fassungen, kein Handlungsbedarf):
`pillow 12.3.0`, `aiohttp 3.14.3`, `requests 2.33.0`, `protobuf 5.29.6`,
`diffusers 0.38.0`, `fastapi 0.115.5`, `uvicorn 0.32.1`, `numpy 2.2.1`.

## transformers: zweimal versucht, zweimal zurueckgerollt

Der Deploy-Zweig `deploy/smejj-bild-maler` erzaehlt die Geschichte:

```
597c7cf0  sec(bilder): transformers 5.5.0 -> 5.10.4 (GHSA-xrqw-3rrv-vx5w)
0eaafe5f  revert: 5.10.4 bricht diffusers 0.38 (loaders.peft: PreTrainedModel)
922d964d  sec(bilder): zweiter Anlauf, transformers 5.10.4 + torch 2.7.1
06260151  revert: live wieder 'PreTrainedModel' — zurueck auf 5.5.0
```

**WAS BEIDEN ANLAEUFEN FEHLTE:** Sie hoben `transformers` und `torch` — aber
**nie `diffusers`**. Der Fehler `loaders.peft: PreTrainedModel` ist genau eine
Unvertraeglichkeit zwischen `diffusers 0.38` und `transformers >= 5.10`.
Inzwischen gibt es **diffusers 0.39.0 und 0.40.0**.

**Vorschlag fuer einen dritten Anlauf** (nicht ausgefuehrt, siehe unten):

```
diffusers==0.40.0        # statt 0.38.0 — hier liegt die Unvertraeglichkeit
transformers==5.10.0     # schliesst GHSA-xrqw-3rrv-vx5w
accelerate==1.15.0       # schliesst GHSA-4j2p-28q2-5m79 (<= 1.14.0)
torch>=2.6               # Anforderung von diffusers 0.40
```

## Warum hier NICHT einfach angehoben wurde

1. **Zwei Anlaeufe sind live gescheitert.** Ein dritter ohne Testlauf waere
   schlechter als keiner: der Bild-Maler ist eine verifizierte Funktion, und
   die Rote Liste schuetzt sie ausdruecklich.
2. **Der Test braucht Rechenzeit mit GPU** — und der Betreiber-Mac ist tabu
   (kein Rechnen, kein Modell). Die Pruefung gehoert in die Bau-Umgebung.
3. **`pipecat-ai` steckt tief** im Sprachworker: 20 Stellen mit eigenen
   Importpfaden (`pipecat.services.piper.tts`, `pipecat.audio.vad.silero`,
   `pipecat.processors.aggregators.openai_llm_context`). Der Code warnt selbst:
   „VERIFY the VADParams field names against the pinned pipecat-ai version."
   Der Sprung 0.0.67 → mindestens 1.4.0 ist ein Hauptversionswechsel und
   braucht eine Anpassung des Worker-Codes, keine Zeilenaenderung.

## Einordnung des Risikos

Die Premium-Stimme meldet `stimme: false` (`/api/voice/status`) — der
Sprachworker mit der **kritischen** Luecke laeuft derzeit offenbar nicht. Das
konnte nicht abschliessend bewiesen werden: eine erfundene Zeabur-Adresse
antwortet **genauso** mit 404 wie die Worker-Adressen, der Statuscode sagt also
nichts ueber die Existenz eines Dienstes.

## Naechste Schritte

1. **Bild-Maler:** dritter Anlauf MIT `diffusers 0.40.0` — in der Bau-Umgebung,
   nicht blind live.
2. **Sprachworker:** `pipecat-ai` auf `>= 1.4.0` heben und die vier Importpfade
   anpassen; ohne Testlauf nicht ausrollen.
3. Solange beides offen ist: pruefen, ob die Worker ueberhaupt erreichbar sind —
   ein nicht laufender Dienst ist nicht angreifbar.
