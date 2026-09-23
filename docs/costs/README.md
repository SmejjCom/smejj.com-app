# Kosten smejj.com — Einstieg

Verbindliche Grundregel: **FREE_ONLY_MASTER_POLICY** — GitHub nur im
dauerhaft kostenlosen Free-Tarif, kein Cloudflare (Exit 2026-07-02), Salad
abgeschaltet (Exit 2026-08-11, Container gestoppt 2026-08-13, Kosten null),
Hauptbetrieb auf Zeabur (ein Server, 6 €/Monat Flat).

| Dokument | Inhalt |
| --- | --- |
| `../architecture/FREE_ONLY_MASTER_POLICY.md` | Verbindliche Master-Policy (wird per `npm run check:architecture` getestet) |
| `../architecture/COST_GUARDRAILS.md` | Kosten-Leitplanken inkl. Budget-Gate |
| `../architecture/FREE_TIER_IDRIVE_GUARDRAILS.md` | IDrive-e2-Free-Tier-Grenzen (Speicher/Transaktionen) |
| `../deployment/FREE_TIER_DEPLOYMENT_GUARDRAILS.md` | Deploy-seitige Gratis-Grenzen |

Aktive Kosten (Stand 08/2026): Zeabur Flat ~6 €/Mo (einziger Posten),
Spaceship Domain (jährlich), IDrive e2 Free-Tier, GitHub Free, Codeberg
kostenlos, Docker ohne Registry-Kosten, GitHub Pages Free.

Automatische Prüfung: `npm run check:cost` (Guardrails) und
`npm run check:security` (enthält check-no-paid-services) — beides Teil
von `npm run check:all`.

Salad-Reststand: API-Key weiter hinterlegt (Not-/Spitzenbedarf nur mit
Budget-Gate und manueller Freigabe), alle Container gestoppt —
siehe `../salad-abschaltung-checkliste.md` und `../salad-reste-inventar.md`.
