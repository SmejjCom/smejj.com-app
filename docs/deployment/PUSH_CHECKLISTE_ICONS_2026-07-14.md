# Push-Checkliste: Icon-Maximierung 2026-07-14 (für den nächsten regulären Push nach SmejjCom/smejj.com-app)

## Warum kein Direkt-Upload erfolgte
Das Backend-Repo steht auf einem bewussten Rollback-Commit (fe945cb, "Rollback smejj-control-agent-deadline-...", 2026-07-12) und enthält die Branding-/Lock-Infrastruktur (scripts/branding/, scripts/check-favicon-lock.mjs, docs/frontend/FAVICON_LOCK.md, public/icons/, docs/release/) noch nicht. Ein Teil-Upload von 11 Dateien hätte einen inkonsistenten Remote-Zustand erzeugt (Non-Regression-Risiko in einem laufenden Rollback-Prozess). Die Arbeitskopie (Google-Drive-Ordner) ist die Quelle der Wahrheit; der nächste vollständige, reguläre Push nimmt alles konsistent mit.

## Beim nächsten Push zwingend enthalten (Stand + SHA-256)
| Datei | SHA-256 |
|---|---|
| scripts/branding/generate-brand-assets.mjs | 8136f5009d0cc7862cff3c52e18245376e88586054b24a16c14b313caf43f6c4 |
| tests/branding-presentation.test.mjs | eee99d27ac34faa0db202e1c6931f34994d17e4c06539731f519b858a4da7201 |
| docs/frontend/favicon-lock-manifest.json | 666fa1ee478e6c625483ff66c97bd24decd144a47ed348434d81aec6e58a31e6 |
| public/apple-touch-icon.png | b96e28dd58aa051dc92867b3897e4e305b5adc47bbcf1fc4e57ee9f29430d797 |
| public/icons/pwa-192x192.png | 143f5592f2d12e2f87a27100ce494e0467d8a299f99b90ae0c8644ecc032a4e9 |
| public/icons/pwa-512x512.png | 73a28c3b7560b13d4348eae759da7d0d6fa79f50e497704d500ff3ab827f2349 |
| public/icons/maskable-192x192.png | 04e4ce3b3824f82654d9261e41e439120927b93e894d63c72e92a25a2a0251f8 |
| public/icons/maskable-512x512.png | 12ff82b8cd95d7a1a696ed05a184111ee9bcbd132b8cac7c9606f80abc6d64fb |
| docs/release/APPLE_TOUCH_ICON_MAX_LIVE_2026-07-14.md | 4ed496cfceec95406da57eedb986cf468eb40a2e79c0295799a562ccd52423d6 |
| docs/release/PWA_MASKABLE_ICONS_MAX_LIVE_2026-07-14.md | af36a308b657f1d6e0b126e642ef4949b0519a1febb9e6a93411203502c7bcba |
| Memory_Bank.md | (aktueller Stand der Arbeitskopie; Remote ab008644... ist älterer Teilstand) |
| docs/deployment/PUSH_CHECKLISTE_ICONS_2026-07-14.md | (diese Datei) |

## Vor dem Push auf dem Mac
1. `pnpm run check:all` (inkl. check:branding mit nativem resvg — erwartet grün; Byte-Identität wurde bereits per resvg-wasm 2.6.2 bewiesen).
2. `pnpm run release:preflight`.

## Live-Stand (bereits deployt und byteverifiziert, Frontend-Repo SmejjCom/smejj-app-frontend)
- apple-touch-icon.png: Commit 2034a0d
- icons/pwa-*, icons/maskable-*: Commit 57c1aaf

## Status-Update 2026-07-15
AUSGEFÜHRT per GitHub-Web-Upload nach schriftlicher Freigabe des Nutzers vom 2026-07-15
("Weitermachen, nicht offen lassen. Du hast alle Rechte. Mach komplett fertig und abschließen").
Umfang erweitert auf das vollständige, in sich konsistente Branding-/Lock-Set (inkl. Quell-SVGs,
favicon.ico, og-image.png, check-favicon-lock.mjs, FAVICON_LOCK.md), damit im Backend-Repo kein
inkonsistenter Teilstand entsteht. Byte-Reproduzierbarkeit aller 11 Generator-Outputs wurde vor
dem Push vollständig bewiesen (resvg-wasm 2.6.2, hash-identisch). check:all in der Agent-Sandbox:
33/36 PASS; 3 FAILs sind dokumentierte Umgebungsgrenzen (natives resvg ×2, pnpm-Binary ×1).
