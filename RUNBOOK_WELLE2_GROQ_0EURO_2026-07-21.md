# Welle 2 — Groq Instant Lane (0-Euro-Variante) — Runbook

Freigabe liegt vor (Wof Kadavanich, 2026-07-21): "0-Euro-Variante: Groq Free-Tier, ohne hinterlegte Zahlung." Budget-Deckel = 0 EUR (kein Zahlungsmittel im Groq-Konto hinterlegen!).

## Stand
- Groq-Konto ist im Chrome eingeloggt (console.groq.com), ein Key "smejj" EXISTIERT bereits — sein Wert ist nur bei Erstellung sichtbar. Falls der Wert nirgends notiert ist: neuen Key erstellen (Knopf "Create API Key"), alten danach loeschen.
- Sicherheitsregel: Nur der Betreiber erzeugt und fuegt Schluessel ein. Die KI-Session fasst Schluessel nie an.

## Die zwei Handgriffe des Betreibers (3 Minuten)
1. console.groq.com/keys -> "Create API Key" -> Name "smejj-fast" -> Wert KOPIEREN (wird nur einmal angezeigt).
2. portal.salad.com -> Container Groups -> "smejj-chat-bridge-v88b-live" -> Edit -> Environment Variables -> NEUE Variable:
   Name:  SMEJJ_LLM_GROQ_API_KEY
   Wert:  <der kopierte Schluessel>
   -> Save. (Der Container startet damit neu — gewollt.)

## Danach uebernimmt die naechste Session automatisch (Startsatz: "Welle 2 fortsetzen laut Runbook")
1. Bridge-ENV ergaenzen/pruefen (unkritisch, keine Secrets): SMEJJ_MULTI_MODEL_ROUTER_ENABLED=YES, SMEJJ_LLM_PROVIDER_ORDER=groq,zhipu, Budget-Gate-Werte laut VELOCITY_V4 (0-Euro-Deckel).
2. Pruefen, ob der Live-Control (V80) die Router-Route traegt; sonst Bridge-Direktpfad auf Groq-Fast-Lane konfigurieren (SMEJJ_LLM_BASE_URL=https://api.groq.com/openai/v1, Modell llama-3.1-8b-instant NUR fuer Profil fast — GLM-5.2 bleibt Deep Lane).
3. TTFT vorher/nachher messen (Ziel < 0,8 s), Live-Test, check:all, Locks pruefen, Task Capsule + Memory_Bank.
4. Rollback: ENV-Variable entfernen + Restart = alter Zustand.
