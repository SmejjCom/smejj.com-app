# Codex-Übergabe: smejj.com — GLM 5.2 live schalten (Env-Umstellung chat-bridge)

Stand: 2026-07-09, ca. 21:30 Uhr. Vorarbeit durch Claude (Cowork) erledigt, Abschluss offen.

## Kontext (verifiziert, nicht neu prüfen)

- Live-Chat/Coding von smejj.com läuft über die SaladCloud Container Group
  **smejj-chat-bridge-v88b-live** (Org `smejjcom`, Projekt `default`,
  Access Domain: https://starfruit-thyme-cblgn6u06ca2z9d5.salad.cloud).
- Aktuell antwortet Qwen3 8B (Salad TGI). Ziel: GLM 5.2 über die Z.ai-API.
- Z.ai-Endpoint: `https://api.z.ai/api/paas/v4` | Modell-ID: `glm-5.2` | Bearer-Auth.
- Mit `SMEJJ_LLM_HEADER=Authorization` sendet die Bridge korrekt `Authorization: Bearer <key>`.
- Vollständige Doku inkl. Rollback: `docs/deployment/GLM_5_2_AKTIVIERUNG_2026-07-09.md`.

## Bereits erledigt

- Z.ai-API-Key erstellt: Konsole https://z.ai/manage-apikey/apikey-list,
  Name `smejj-chat-bridge`, Key-ID beginnt mit `7f52`. (Guthaben noch nicht geprüft —
  Z.ai ist pay-per-use, ohne Guthaben liefert die API 401/402.)
- Im SaladCloud-Portal ist das Edit-Formular der Container Group geöffnet.

## ACHTUNG: Es sind ZWEI Edit-Tabs im Browser offen (Verwechslungsgefahr!)

1. Tab mit Titel **"➡️ HIER KEY EINFÜGEN ⬅️"**: BASE_URL, MODEL und die neue
   Variable SMEJJ_LLM_HEADER sind bereits korrekt gesetzt, aber im Feld
   SMEJJ_LLM_SALAD_API_KEY steht noch der ALTE `salad_cloud_user_…`-Key.
2. Zweiter Salad-Edit-Tab (vom Nutzer): dort steht der NEUE Z.ai-Key (beginnt `7f52`)
   im API_KEY-Feld, aber BASE_URL/MODEL sind noch alt und SMEJJ_LLM_HEADER fehlt.
   **Dieses Formular auf keinen Fall speichern.**

Empfehlung: EIN Formular verwenden und dort alle vier Werte konsistent setzen,
das andere ohne Speichern schließen.

## Zu tun

1. In einem Edit-Formular der Container Group **smejj-chat-bridge-v88b-live** setzen:
   - `SMEJJ_LLM_SALAD_BASE_URL` = `https://api.z.ai/api/paas/v4`
   - `SMEJJ_LLM_SALAD_API_KEY` = <Z.ai-Key, beginnt mit 7f52; aus der Z.ai-Konsole kopieren>
   - `SMEJJ_LLM_SALAD_MODEL` = `glm-5.2`
   - `SMEJJ_LLM_HEADER` = `Authorization` (neu hinzufügen, falls nicht vorhanden)
   - Alle anderen Variablen (PORT, SMEJJ_HOST, SMEJJ_CONTROL_ORIGIN,
     SMEJJ_CHAT_BRIDGE_TIMEOUT_MS) NICHT anfassen. Nichts löschen.
2. Configure → Save/Deploy bestätigen. Warten bis **1/1 Replica Running** (neue Version).
3. Live-Tests (Pflicht, erst danach gilt die Aufgabe als erledigt):
   1. https://smejj.com/home öffnen, Nachricht senden → Antwort muss streamen (kein Offline-Text).
   2. Coding-Test: "Schreibe eine JavaScript-Funktion add(a,b). Nur Code." → Codeblock muss kommen.
   3. Direkt-Test: `POST https://starfruit-thyme-cblgn6u06ca2z9d5.salad.cloud/api/chat`
      (Origin `https://smejj.com`, JSON `{"messages":[{"role":"user","content":"Antworte nur mit OK"}]}`)
      → HTTP 200 + SSE-Stream.
4. Bei 401/402: Z.ai-Key/Guthaben prüfen (https://z.ai → Billing). Bei anderen Fehlern:
   Container Logs der Bridge lesen, beheben, erneut testen — bis alles 100 % läuft.
5. Ergebnis + Testprotokoll in `Memory_Bank.md` dokumentieren (Schreibweise immer "smejj.com").

## Rollback (falls nötig)

- `SMEJJ_LLM_SALAD_BASE_URL` = `https://tangerine-dill-g0pw1k0sdg3rhtb0.salad.cloud/v1`
- `SMEJJ_LLM_SALAD_MODEL` = `tgi`
- `SMEJJ_LLM_SALAD_API_KEY` = Salad-Gateway-Key (beginnt `salad_cloud_user_`)
- `SMEJJ_LLM_HEADER` entfernen.
Details: `docs/deployment/GLM_5_2_AKTIVIERUNG_2026-07-09.md`.

## Schutzregeln (verbindlich)

- Nichts löschen, keine anderen Container Groups anfassen, keine anderen Env-Variablen ändern.
- Startseiten-Design und Frontend nicht verändern (Start-Lock).
- Keine kostenpflichtigen Dienste starten, keine Trials, kein Auto-Billing.
- Keine Secrets loggen oder in Dateien/Repos schreiben.
