# smejj.com — Multi-KI-System: Env-Vorlage (Keys traegt NUR der Eigentuemer ein)

Der Multi-Modell-Router ist deployt und INAKTIV, bis Keys gesetzt sind (fail-closed).
Ohne Keys verhaelt sich smejj.com exakt wie vorher (Salad/Qwen3, falls konfiguriert).
Eintragen im Salad-Portal: Container Group **smejj-control** -> Edit ->
Environment Variables -> Bulk Edit. Nur benoetigte Zeilen setzen, nichts loeschen.
Keys niemals in Code/GitHub/Frontend/Logs — nur hier als Env.

## Schnellstart (empfohlen): OpenRouter als Qualitaets-Standard
```
SMEJJ_LLM_OPENROUTER_API_KEY=<KEY>
SMEJJ_SERVER_AI_ENABLED=true
SMEJJ_SERVER_AI_REMAINING=1000
```
Optional Modelle je Profil (Defaults sind gut):
```
SMEJJ_LLM_OPENROUTER_MODEL_DEFAULT=openai/gpt-4o-mini
SMEJJ_LLM_OPENROUTER_MODEL_CODING=deepseek/deepseek-chat
SMEJJ_LLM_OPENROUTER_MODEL_REASONING=deepseek/deepseek-reasoner
SMEJJ_LLM_OPENROUTER_MODEL_FAST=google/gemini-2.5-flash
SMEJJ_LLM_OPENROUTER_MODEL_WEB=google/gemini-2.5-flash
```
Damit OpenRouter greift, solange Qwen3 aktiv ist, Reihenfolge setzen:
```
SMEJJ_LLM_PROVIDER_ORDER=openrouter,groq,gemini,salad
```
(Alternativ die drei SMEJJ_LLM_SALAD_*-Zeilen leeren.)

## Direkte Anbieter (je 1 Key = aktiv; alle OpenAI-kompatibel)
Free-Tier-freundlich zuerst:
```
SMEJJ_LLM_GROQ_API_KEY=<KEY>        # sehr schnell, Free-Tier (llama-3.3-70b)
SMEJJ_LLM_CEREBRAS_API_KEY=<KEY>    # sehr schnell, Free-Tier
SMEJJ_LLM_GEMINI_API_KEY=<KEY>      # Google, Free-Tier (gemini-2.5-flash)
SMEJJ_LLM_MISTRAL_API_KEY=<KEY>     # Free-Tier
SMEJJ_LLM_DEEPSEEK_API_KEY=<KEY>    # sehr guenstig, stark
SMEJJ_LLM_ZHIPU_API_KEY=<KEY>       # GLM-5.2 (Projekt-Qualitaetsmodell!)
SMEJJ_LLM_QWEN_API_KEY=<KEY>
SMEJJ_LLM_MOONSHOT_API_KEY=<KEY>    # Kimi
SMEJJ_LLM_TOGETHER_API_KEY=<KEY>
SMEJJ_LLM_FIREWORKS_API_KEY=<KEY>
SMEJJ_LLM_SAMBANOVA_API_KEY=<KEY>
SMEJJ_LLM_NVIDIA_API_KEY=<KEY>      # NVIDIA NIM
SMEJJ_LLM_OPENAI_API_KEY=<KEY>
```
Anthropic Claude: ueber OpenRouter nutzen (nicht OpenAI-kompatibel).

## Feinsteuerung (optional)
```
SMEJJ_LLM_PROVIDER_ORDER=salad,openrouter,groq,...   # Fallback-Reihenfolge
SMEJJ_LLM_<NAME>_MODEL=<modell>                      # Modell-Default je Anbieter
SMEJJ_LLM_<NAME>_MODEL_<PROFIL>=<modell>             # je Profil: CODING|REASONING|FAST|WEB|DEFAULT
SMEJJ_LLM_<NAME>_BASE_URL=<url>                      # nur bei Sonder-Endpoints
SMEJJ_LLM_TIMEOUT_MS=45000                           # Timeout je Versuch
```

## Profile (automatisch gewaehlt)
- coding    -> Programmier-/Bugfragen
- reasoning -> Analyse/Architektur
- fast      -> kurze Fragen (schnellstes Modell)
- web       -> aktuelle Internetfragen (Websuche-Zusammenfassung)
- default   -> alles andere

## Sicherheit / Kosten
- Fail-closed: ohne Key kein Anbieter aktiv, keine versteckten Kosten.
- Kein Anbieter wird ohne expliziten Key angesprochen; keine Trials, kein Auto-Upgrade.
- Fallback: faellt ein Anbieter aus (Fehler/Limit/Timeout), uebernimmt der naechste.
- Rollback: vorherige Images unter Commit-SHA-Tags auf ghcr.io.
