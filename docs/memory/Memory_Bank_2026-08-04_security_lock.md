## 2026-08-04 — Zweite Sperre: sicherheitskritische Dateien (job_security_lock_20260804)

Commit `1e4ebdd`. Freigabe des Betreibers vom 2026-08-04 (Wortlaut im Manifest
`docs/security/security-lock-manifest.json`). `check:all` gruen (1808).
Keine Live-Datei beruehrt — reine Repo-Absicherung.

Neun Dateien byte-genau eingefroren: beide Anmeldeseiten samt `auth-page.js`,
`auth.css`, `passkey.js`; `account-sessions.js`; `chat-history-context.js`;
`chat-bridge.js`; `ai/fetch-retry.js`. Aufruf wie beim Start-Lock:
`node scripts/check-security-lock.mjs --freeze --confirm "<Wortlaut>"`.

- **ZWEI MANIFESTE, NICHT EINE LISTE.** Der Start-Lock wird bei JEDEM
  sw.js-Sprung neu eingefroren (am 2026-08-03/04 mehrfach). Laegen die
  Sicherheitsdateien darin, wuerde jedes dieser Einfrieren eine Aenderung an
  einem Passwortfeld still mit absegnen. MERKREGEL: **eine Sperre, die oft
  aufgesperrt wird, darf nichts Seltenes mitschuetzen.**
- **check-start-lock.mjs IST DIGEST-GEPINNT** — eine von 19 Dateien in
  `idrive-layout/manifests/evaluations/phase1-foundation-benchmark.json`
  (`immutable: true`, `overwriteAllowed: false`). Der Versuch, beide Sperren auf
  eine gemeinsame Mechanik umzustellen, brach den Digest. MERKREGEL: **den Pin
  nachzuziehen, um das eigene Refactoring durchzubekommen, ist genau die
  Manipulation, gegen die er gebaut ist.** Zurueckgenommen, Doppelung
  dokumentiert, Test haelt sie fest.
- **EIN SCHUTZ, DER NIE ANSCHLAEGT, IST SCHLIMMER ALS KEINER.** Zwei eigene
  Fehler beim Bau, beide nur gefunden, weil die Tests den PROZESS aufrufen statt
  Quelltext zu lesen:
  (1) `import.meta.url` gegen ein selbstgebautes `file:`-Schema plus
  `process.argv[1]` zu vergleichen trifft unter einem Pfad
  MIT Leerzeichen nie zu — die Sperre lief gar nicht, Exitcode 0.
  (2) Danach scheiterte sie an macOS-Symlinks (`/var` gegen `/private/var`);
  jetzt `realpathSync`.
  MERKREGEL: **eine Sperre immer gegen eine absichtlich veraenderte Datei
  testen** — sonst prueft man nur, dass sie nicht abstuerzt.
