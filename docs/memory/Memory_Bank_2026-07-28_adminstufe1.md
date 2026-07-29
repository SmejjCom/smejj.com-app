# Memory_Bank — 2026-07-28: Adminbereich Stufe 1 (Fundament)

> Ausgelagert aus `Memory_Bank.md` wegen der 800-Zeilen-Regel (2026-07-29).
> Der Hauptindex traegt einen Zeiger hierher.

### [2026-07-28] ADMINBEREICH STUFE 1 LIVE — Fundament, rein lesend (job_adminbereich_stufe1_20260728)

Freigabe: "Mach du komplett fertig, las nicht offen." (Wof Kadavanich, 2026-07-28).
Commits `7642cf0`, `3e6685a`, `b289645` + window-Fix. Live als Control-Server-Version 93,
Artefakt `deployments/control/smejj-control-admin-stage1c-2026-07-28.tar.gz`,
Rueckweg `deployments/control/smejj-control-enumfix-2026-07-28.tar.gz`.

- ZWEI BLOCKER GELOEST, die jeden Adminbereich bisher unmoeglich machten: Konten hatten
  kein `role`-Feld (also gab es nur "eingeloggt oder nicht", keine Autorisierung), und
  Konten lagen als `auth/email-users/{sha256(email)}.json` — aus einem Hash laesst sich
  keine Liste bilden, "zeige alle Nutzer" war technisch unmoeglich.
- ROLLE NIEMALS AUS DEM TOKEN. `adminAuth.js` laedt sie bei JEDER Anfrage frisch aus dem
  Store. `sessionToken.js` filtert Zusatzfelder ohnehin heraus — darauf wird sich aber
  nicht verlassen. Wirkung: Rechteentzug greift sofort, ein manipuliertes Token bringt
  nichts. Live belegt: Sitzung mit `role: "owner"` im Token, Datensatz sagt `user` -> 403.
- EINSTIEG NUR UEBER `SMEJJ_ADMIN_OWNER_EMAILS`. Kein Konto in IDrive e2 traegt eine
  Adminrolle. Ohne diese Variable antwortet der gesamte Bereich 403 — auch dem Betreiber.
  Die Antwort weist den Weg als `roleSource: "bootstrap"` aus, nie als echte Rolle.
- INDEX NICHT AN DEN ANMELDEPFAD HAENGEN. `putUser()` schreibt den Nutzer-Index bewusst
  NICHT mit: ein Indexfehler darf niemals eine Anmeldung verhindern. Der Index ist eine
  Projektion, wird angestossen neu gebaut und traegt sein Alter (`ageSeconds`) sichtbar mit.
- AUDIT-KETTE UEBERLEBT DEN NEUSTART — live belegt: Eintrag 2 verweist korrekt auf den
  Hash von Eintrag 1 aus einer frueheren Container-Instanz. Der Kopfzeiger `head.json`
  wird mit If-Match geschrieben, die Eintraege selbst mit If-None-Match:*.
- FALLE LATENZ DURCH OBJEKTSPEICHER: `/api/admin/users` lag bei p95 2841 ms, weil jede
  Anfrage das ganze Index-Objekt neu aus IDrive e2 las (Basislinie `/api/health`: 570 ms).
  30 Sekunden Prozess-Cache -> 832 ms. Regel daraus: jede Route, die pro Anfrage ein
  IDrive-Objekt liest, braucht einen Cache — der Objektspeicher ist kein Datenbankindex.
- FALLE UNBEGRENZTES LISTING: `readAuditPage` listete das GESAMTE Prefix und holte dann
  N Objekte — O(n) je Anfrage bei einem Log, das nie schrumpft. Jetzt zwei parallele
  LIST-Aufrufe auf Monats-Prefixe; die Antwort nennt ihren Umfang im Feld `window`, damit
  eine kurze Liste nicht faelschlich als "mehr ist nie passiert" gelesen wird.
- FALSCHALARM ZUM NACHLESEN: `/api/admin/me` schien im Browser ohne Authorization-Header
  200 zu liefern. Ursache ist `src/server.js:752` — `readSession` akzeptiert Bearer ODER
  das `smejj_session`-Cookie. curl hat kein Cookie (401), der Browser schon. Alle
  bestehenden Endpunkte verhalten sich identisch; mit UNGUELTIGEM Bearer ist die
  Adminroute sogar strenger als `/api/auth/me` (401 statt 200). Wer hier eine Luecke
  vermutet, muss gegen einen Client ohne Cookie testen, nicht gegen den eigenen Browser.
- ZUM DEPLOY: `set_control_artifact_env.mjs` kann jetzt zusaetzlich
  `SMEJJ_ADMIN_OWNER_EMAILS` setzen — gleiche Regel wie bei den anderen Optionen, der
  Wert wird VOR `loadSecureLocalEnv()` gelesen. Env-Map blieb bei 71 Variablen, nichts
  verloren (70 vorher + die neue).
- STUFE 1 IST REIN LESEND (`writable: false` in `/api/admin/me`). Keine Route sperrt,
  loescht oder vergibt Rollen. Einzige schreibende Aktion: der Index-Neubau, mit
  Pflichtgrund und Audit-Eintrag. Sperren/Loeschen/Rueckerstattung folgen in Stufe 3.
- BENCHMARK: `docs/benchmarks/api_adminbereich_2026-07-28.json`. Web Vitals unveraendert
  (LCP p75 412 ms kalt / 276 ms warm, CLS 0, INP 48 ms, 273 KB) — das Frontend wurde nicht
  angefasst, was Static-First belegt. Time to First Token nach drei Control-Server-
  Neustarts: 346 ms gegen ein Budget von 1000 ms.
- OFFEN und bewusst so: kein Frontend (Stufe 2, Vorlage `mockups/admin-console-mockup.html`
  mit 26 Modulen A-Z), und Lesezugriffe auf Nutzerakten werden noch nicht protokolliert —
  datenschutzrelevant, gehoert mit Pflichtgrund in Stufe 2.
