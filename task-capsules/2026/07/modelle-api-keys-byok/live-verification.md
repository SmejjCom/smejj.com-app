# Live-Verifikation smejj.com (Browser-Prüfung)

## Bestehende Live-Seite — gesund, nichts kaputt
- Startseite lädt, Design-Lock intakt (Eingabefeld, Modell "smejj 1.0", Werkzeuge). OK
- /settings lädt; Panel "Modelle" rendert. OK
- Keine Konsolenfehler. OK
- /impressum.html lädt (AUS2001 LLC, s@smejj.com). OK
- Unbekannter Pfad -> sichere Fail-closed-Fehlerseite. OK

## Backend (Salad Control Server) — läuft
- GET https://redbean-caesar-...salad.cloud/api/health -> ok:true, aiBackend "zhipu:glm-5.2",
  activeModelId "glm-5-2", modelRegistry GLM-5.2 ready, storage idrive-e2. OK
- Verschlüsselter Credential-Vault ist konfiguriert (Cline läuft produktiv über denselben Vault).
- Salad-Portal: viele alte Staging-Container-Gruppen STOPPED; Produktiv-Control-Server antwortet.

## Neues Feature — NOCH NICHT deployed (erwartet)
- Panel "Modelle" zeigt live nur den alten Cline-Block; neue API-Keys-Surface fehlt (Frontend nicht auf gh-pages).
- GET /api/keys liefert die SPA statt JSON-401 -> neue Route nicht im laufenden Backend-Image (Backend-Image nicht neu gebaut).

## Fazit
Code fertig + lokal verifiziert. Zwei Deploy-Schritte offen und Mac-gebunden:
1) Backend: docker build control-server -> ghcr.io -> Salad-Gruppe auf neues Image (Vault-Key bereits gesetzt).
2) Frontend: public/ -> gh-pages (smejj.com Deploy.command).
Kein Browser-/Portal-Klick kann den Docker-Bau ersetzen (GitHub Actions per Policy verboten).
