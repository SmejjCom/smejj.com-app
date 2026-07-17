# smejj.com — Volltest Browser + KI-Coding (2026-07-09, live)

Getestet live auf https://smejj.com (Chat-Bridge Version 2, GLM 5.2 via Z.ai).
Alle Tests real im Browser ausgeführt (keine Annahmen). Keine Änderungen an
Live-Systemen vorgenommen — Fixes unten sind Vorschläge mit exakten Diffs und
warten auf schriftliche Freigabe (Schutzregel).

## 1. smejj Browser (Remote-Browser-Worker) — Testprotokoll

| Test | Ergebnis | Details |
|---|---|---|
| Seite laden (smyst.com) | OK* | *Erster Panel-Start zeigte weiße Fläche, erst nach manuellem Reload gerendert (Befund B1) |
| Scrollen | OK | flüssig, Header bleibt korrekt sticky |
| Klick-Navigation in Seite | OK | Einstein-Profil öffnet inkl. "Ähnliche Profile" |
| Zurück | OK | zurück zur Startseite |
| Vorwärts | FEHLER | stellt interne Navigation (Profil) nicht wieder her — interne Klicks landen nicht in der History (Befund B2) |
| URL-Leiste bei interner Navigation | FEHLER | bleibt auf https://smyst.com/ stehen, aktualisiert sich nicht (Befund B3) |
| URL-Eingabe mit https:// | OK | example.com lädt, Titel korrekt |
| URL-Eingabe ohne Schema | OK | "smyst.com" wird korrekt aufgelöst |
| Neuer Tab / Tab-Limit | OK | "+" öffnet Tab, Zähler korrekt, Limit 7 Tabs wird angezeigt |
| Tab schließen | OK | x-Button funktioniert |
| Externe-Öffnen-Schaltfläche | OK | vorhanden |
| Render-Performance | OK mit Hinweis | Remote-Render ~1.1–2.1 s pro Seite (Befund P2) |

## 2. Performance / Konsole / Netzwerk (smejj.com Frontend)

- Seitenladezeit: 1718 ms gesamt, DOM interaktiv nach 195 ms — gut.
- Console: keine Fehler, keine Exceptions beim Laden.
- Viewport-Meta vorhanden, kein Horizontal-Scroll bis 839 px Breite herunter
  (schmalere echte Fenster auf macOS nicht erzwingbar; echter Geräte-Test für
  390 px steht aus).
- **Befund P1: 404** auf `https://smejj.com/assets/auth/passkey-ui.js` — tote
  Referenz, wird bei jedem Seitenaufruf angefragt.
- **Befund P2:** Control-Server-Calls (redbean-caesar) brauchen 1.3–2.1 s
  (auth/config, models/status, browser/fetch). Remote-Browser fühlt sich
  dadurch träge an. Empfehlung: Cache-Header/Parallelisierung prüfen.

## 3. Autonomes KI-Coding (Vergleich Codex-Fähigkeiten)

| Fähigkeit (Codex-Referenz) | smejj.com live | Bewertung |
|---|---|---|
| Code verstehen | JA | GLM 5.2 erklärt Code korrekt |
| Fehler erkennen | JA | Off-by-one-Bug (arr[arr.length]) korrekt erkannt, in 2 Sätzen erklärt |
| Verbesserungen vorschlagen | JA | Fix + moderne Alternative (arr.at(-1)) geliefert |
| Coding-Antworten mit Codeblock | JA, mit Formatfehler | Befund K1: Zeilenumbruch nach ```-Sprach-Tag fehlt |
| Dateien lesen/bearbeiten | **NEIN (live deaktiviert)** | Status-Seite: "AI Mode: disabled" — Control-Server-Agent ist fail-closed ohne Zhipu-Key (Befund K2) |
| Tests ausführen | NEIN | kein Live-Terminal-/Test-Runner-Pfad aktiv |
| Änderungen speichern + erneut prüfen | NEIN | Bridge-Agent ist absichtlich stateless ("Behaupte nicht, dass Dateien geändert wurden") |

Fazit: Chat- und Analyse-Qualität ist auf gutem Niveau (GLM 5.2). Der
**autonome** Teil (Dateien ändern, Tests, Verifikations-Loop) ist live nicht
aktiv — nicht defekt, sondern nicht freigeschaltet: `AI Mode: disabled`,
`IDrive e2: presigned-sync-not-configured`, K2.7-Vault-Inferenz disabled.
Codex-Parität erfordert Aktivierung des Control-Server-Agenten (Schritt 2 der
GLM-Doku: SMEJJ_LLM_ZHIPU_API_KEY + SMEJJ_LLM_PROVIDER_ORDER auf smejj-control).

## 4. Gefundene Bugs mit Fix-Vorschlägen (warten auf Freigabe)

### K1 (Prio hoch, klein): Whitespace-Deltas werden im SSE-Stream verworfen
`assets/chat-bridge.js`, `filterSsePayload()`: Deltas, die nur aus Whitespace
bestehen (z. B. der Zeilenumbruch nach ```javascript), werden verworfen →
Codeblöcke rendern als "```javascriptfunction ...".

```diff
-  const visible = stripInternalReferences(stripThinking(raw, state));
-  return visible.trim() ? visible : "";
+  const visible = stripInternalReferences(stripThinking(raw, state));
+  return visible; // Whitespace-Deltas (Zeilenumbrüche!) nicht verwerfen
```

### K3 (Prio hoch, klein): Bridge crasht bei unbehandelter Rejection
`assets/chat-bridge.js`: `return handleChat(req, res)` im try/catch fängt
Promise-Rejections NICHT (z. B. ungültiges JSON im Body → Prozess-Exit,
lokal reproduziert, Node 22). Fix:

```diff
-      if (url.pathname === "/api/chat") return handleChat(req, res);
-      if (url.pathname === "/api/agent") return handleAgent(req, res);
+      if (url.pathname === "/api/chat") return await handleChat(req, res);
+      if (url.pathname === "/api/agent") return await handleAgent(req, res);
```

### P1 (Prio mittel): 404 passkey-ui.js
Referenz auf `/assets/auth/passkey-ui.js` im Frontend entfernen oder Datei
bereitstellen.

### B1–B3 (Prio mittel): Remote-Browser-UX
- B1: Nach Panel-Start initialen Render automatisch anstoßen (kein manueller Reload).
- B2: Interne Navigationen in die History aufnehmen (Vorwärts funktioniert dann).
- B3: URL-Leiste bei interner Navigation aktualisieren (Location vom Worker zurückmelden).

### Hinweis Diagnose (aus GLM-Aktivierung gelernt)
Cloudflare ersetzt 5xx-Antworten der Bridge durch eigene Fehlerseiten ohne
CORS-Header — im Frontend erscheint dann nur "Failed to fetch"/Offline-Text.
Für Fehlerdiagnose immer Instanz-Terminal nutzen (curl http://127.0.0.1:8080).

## 5. Empfohlene Reihenfolge

1. K1 + K3 in einem Commit (2 Zeilen), Container-Neustart, Live-Retest.
2. P1 (tote Referenz entfernen).
3. AI Mode aktivieren: Zhipu-Key auf smejj-control (Schritt 2 der GLM-Doku) → Dateien-/Agent-Pfad live testen.
4. B1–B3 Remote-Browser-UX.
5. P2 Latenz Control-Server (Caching).
