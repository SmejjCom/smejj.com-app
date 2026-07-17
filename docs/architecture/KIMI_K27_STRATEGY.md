# Kimi K2.7 Strategy

Kimi K2.7 wird fuer smejj.com als Premium-Referenz und Modell-Vault vorbereitet.
Es wird nicht als kostenloser Browser-, GitHub- oder Cloudflare-Motor eingebaut.

## Status

- Gemeinsamer produktionsnaher Registry-Eintrag neben GLM-5.2 vorhanden.
- Default-Inferenz: `disabled`.
- Provider `kimi-k2-7-vault`: `enabledByDefault=false`.
- Speicherziel IDrive e2: 86/86 Dateien und 64/64 Shards verifiziert.
- Checksums und Inventory: vorhanden und am 2026-07-10 erneut geprueft.
- Kontext: 262.144 Tokens.
- Erlaubte Modi: explizit konfigurierter OpenAI-kompatibler Endpoint, BYOK,
  Partner-Compute spaeter, Self-host spaeter.
- Aktivierung: `SMEJJ_KIMI_K2_7_ENABLED=YES`; GLM-5.2 bleibt Standard und
  kontrollierter Fallback.
- Nicht erlaubt: Cloudflare-Inferenz, GitHub-Speicherung von Modellgewichten,
  Trial-API und automatische Paid-Nutzung.

## Klarstellung

IDrive e2 speichert Dateien. IDrive e2 fuehrt keine KI aus. Kimi K2.7 braucht
spaeter eigene, Partner- oder Nutzer-Compute. Es gibt keine versteckten Kosten
und keine falsche Marketingaussage.
