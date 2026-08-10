# Release-Readiness: Rechts-Paket (Zahlungs-Compliance)

Stand: 2026-08-09. Quelle: Marktreife-Audit. Firma bestätigt: **iMild LLC** (Oakland, CA).
Alle Code-Änderungen liegen lokal committet auf `feature/auth-redesign-github-magiclink`
(Commit `65781ea`). **Noch nicht deployed.**

## 1. Umfang des Rechts-Pakets (6 Frontend-Dateien)

| Datei | Art | Lock |
|---|---|---|
| `public/agb.html` | NEU | favicon-lock (Regen nötig) |
| `public/widerruf.html` | NEU | favicon-lock (Regen nötig) |
| `public/datenschutz.html` | Stripe-§10 + Footer | favicon-lock (nur Body geändert → Check ok) |
| `public/impressum.html` | Footer-Links | favicon-lock (nur Body geändert → Check ok) |
| `public/account-privacy.js` | Button §312j, Preise, §312k | frei |
| `public/onboarding-welcome.js` | Button §312j, Fineprint | frei |

> Nicht Teil dieses Deploys: die Security-/H1-Backend-Änderungen
> (`controlAccessPolicy.js`, `server.js`, `sessionToken.js`, `account-sessions.js`).
> Die laufen über den Control-Release, sind flag-gegatet (AUS) und teils
> security-gelockt — separater Vorgang.

## 2. Betreiber-Daten, die VOR dem Deploy in die Dateien müssen

Stand 2026-08-09 nach Betreiber-Entscheidung:

- [x] **USt — ERLEDIGT/bestätigt:** Stripe Tax ist aktiv, die USt wird im Checkout
      ausgewiesen. Die Angabe "inkl. gesetzl. USt." in `account-privacy.js` und
      `onboarding-welcome.js` ist damit korrekt. Keine Textänderung nötig.
- [x] **Vertretungsberechtigter — ERLEDIGT:** "Wof Kadavanich (Managing Member)"
      steht im Impressum (§5 DDG, Commit `27433ee`).
- [ ] **EU-Vertreter (Art. 27 DSGVO) — OFFEN (Betreiber lässt bewusst offen):**
      Name + Anschrift eines EU-Vertreters, einzutragen in `impressum.html` und
      `datenschutz.html` (§1). Pflicht für die US-Gesellschaft mit Zielmarkt DE —
      MUSS vor dem Livegang der Zahlungen benannt werden.
- [ ] **Stripe-Kundenportal-Link — OFFEN (Betreiber lässt bewusst offen):**
      Konstante `STRIPE_BILLING_PORTAL_URL` in `account-privacy.js` bleibt leer;
      solange greift der Mailto-Notweg für §312k. Für die volle §312k-Konformität
      (Selbst-Kündigung per Button-Flow) den Portal-Link nachtragen.
- [ ] **US-Registerangaben** (Registerstaat/-nummer der LLC) → `impressum.html`,
      optional aber empfohlen.

## 3. Lock-Freigaben (Betreiber-Autorität)

- [ ] **Favicon-Lock-Regen** (schriftliche Freigabe nötig — der Check verlangt sie
      ausdrücklich). Der Regen fügt AUSSCHLIESSLICH `public/agb.html` und
      `public/widerruf.html` zu `htmlHeadReferences` hinzu; Favicon-Dateien,
      -Referenzen bestehender Seiten und Manifest-Icons bleiben byte-identisch
      (geprüft). Danach:
      ```bash
      node scripts/check-favicon-lock.mjs --print-manifest > docs/frontend/favicon-lock-manifest.json
      ```
      (Approval-Wortlaut im `approval`-Feld des Manifests ergänzen, wie bei den
      früheren Seiten status.html/hilfe.html.)

## 4. Deploy (GitHub Pages, Site-Repo `~/smejj-app-frontend`)

Nach 2. + 3. — **auslösender Push ist eine Betreiber-Entscheidung.**

1. Dateien ins Site-Repo übernehmen:
   - HTML nach Repo-Wurzel: `agb.html`, `widerruf.html`, `datenschutz.html`, `impressum.html`
   - JS nach `assets/`: `account-privacy.js`, `onboarding-welcome.js`
2. `assets/static-pages.css` muss die neuen Seiten tragen (sie referenzieren
   `/assets/static-pages.css` — dieselbe Datei wie impressum/datenschutz, ok).
3. Commit + Fast-Forward-Push auf `main` (Pages baut aus `main`).
4. sw.js: nicht zwingend — die Rechtsseiten laufen network-first (online). Für
   Offline-Precache optional die neuen Pfade in die Precache-Liste + CACHE_NAME
   bumpen (sw.js ist start-gelockt → separate Freigabe).

## 5. Nach dem Deploy verifizieren

- [ ] `smejj.com/agb.html`, `/widerruf.html` laden mit Styling (200).
- [ ] Footer-Links auf impressum/datenschutz zeigen auf AGB/Widerruf.
- [ ] Konto → "Abo & Zahlungen": Button heißt "Zahlungspflichtig abonnieren",
      Preise mit "inkl. USt.", "Verträge hier kündigen" vorhanden.
- [ ] Onboarding-Overlay zeigt die geänderten Buttons + Fineprint.

## 6. Vor dem Livegang der ECHTEN Zahlungen

- [ ] **Anwaltliche Kurzprüfung** der Rechtstexte (AGB/Widerruf/Datenschutz).
      Die Texte sind solide Standardfassungen, ersetzen aber keine Rechtsberatung.
- [ ] Stripe von Test- auf Live-Modus (Zahlungslinks in `account-privacy.js`
      und `onboarding-welcome.js` austauschen).
