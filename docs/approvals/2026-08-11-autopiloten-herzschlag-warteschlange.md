# Freigabe: Herzschlag-Warteschlange + Control-Waechter (Control-Release + Zeabur-Redeploy)

**Datum:** 2026-08-11
**Betreiber:** per Klick-Antwort in der Claude-Code-Sitzung

## Wortlaut

Auf die Frage „Naechster Schritt?" hat der Betreiber die Option
**„Beide Deploys (Empfehlung)"** gewaehlt, mit dem angekuendigten Umfang:

> Ich pushe den Commit (Zeabur baut den Waechter neu) UND du erteilst hiermit
> die Freigabe fuer den Control-Release — ich lege den Nachweis unter
> docs/approvals/ ab und rolle aus.

## Umfang

Commit `97ba76d` (feature/auth-redesign-github-magiclink):

- `control-server/src/admin/opsAutopiloten.js` — heartbeatAnnehmen nimmt
  nachgelieferte Herzschlaege mit Original-Zeitpunkt `am` an (Fenster 14 Tage,
  +5 min Uhren-Schonung); zaehleTag ordnungs-tolerant; ladeHerzschlaege
  verschmilzt die 90-Tage-Statistik aus der Ablage mit frischen Laeufen
  (Fix fuer die bei jedem Neustart geloeschte Historie).
- `control-server/src/routes/autopilotRoutes.js` — reicht `am` durch.
- `workers/smejj-brueckenwaechter/` — zweites Pruefziel Control-Server
  (/api/health), /control-Endpunkt, Version 1.1.0 (Zeabur-Redeploy des
  BESTEHENDEN Dienstes, kein neuer Dienst).
- Mac-Skripte (spiegel.sh/messlauf.sh, Repo-Vorlagen abgeglichen) —
  Herzschlag-Warteschlange, bereits lokal wirksam.

Gemessen: 55/55 Tests; Warteschlange gegen Mock bewiesen (503 → Queue,
200 → Nachlieferung mit Original-`am`, 400 → verworfen).

Keine Datei aus `docs/security/admin-lock-manifest.json` oder
`docs/security/security-lock-manifest.json` ist betroffen (explizit geprueft).
