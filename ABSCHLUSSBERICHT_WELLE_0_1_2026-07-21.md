# smejj.com — Abschlussbericht Welle 0+1 (2026-07-21)

Freigabe: schriftliches „Ja" von Wof Kadavanich auf den Verbesserungsbericht. Budget-Regel eingehalten: keine neuen Dienste, kein Groq (Welle 2 wartet auf Freigabe mit Dienst + Betrag).

## Ergebnis zuerst

**Chat-Verlauf existiert jetzt live auf smejj.com** — speichern, wiederherstellen nach Reload, öffnen, umbenennen, löschen, echter „Neu"-Chat. **Die Remote-Browser-Kette ist wieder eingeschaltet** (die Container waren schlicht gestoppt), und **der Server-Fehler `session_handoff_not_found` tritt nicht mehr auf** (Replica-Fix). Alles wurde live im echten Browser getestet, alle Schutz-Checks sind grün, der Schutz ist neu eingefroren.

## Was live gegangen ist

**Welle 1 — Chat-Verlauf (GitHub Pages, Commits 178304e + 84971ef):**

Zwei neue Dateien (`chat-store.js`, `chat-history-view.js`), zwei minimale Erweiterungen (`index.html`: 2 Script-Zeilen, `sw.js`: Version v132). `app.js` und das Design wurden nicht angetastet — alles rein zusätzlich. Funktionen: automatische Speicherung jeder Unterhaltung im Browser (IndexedDB, 0 € Serverkosten), Wiederherstellung nach Reload, Verlauf-Liste mit Titel/Datum/Anzahl/Modell, Umbenennen (inline), Löschen (mit Zwei-Schritt-Bestätigung), „Neu" beginnt einen echten neuen Chat, Logo-Klick lädt die Seite nicht mehr hart neu, Warnung beim Verlassen während eine Antwort läuft.

**Welle 0 — Betriebs-Reparatur (Salad-Portal):**

`smejj-remote-browser-bridge-live` und `smejj-remote-browser-live` wurden gestartet (beide standen auf STOPPED — das war die echte Ursache, warum der interaktive Browser tot war; der frühere Verdacht „falscher Bootstrap-Pfad" war nach Live-Verifikation unbegründet: `/assets/…` existiert im Live-Repo). Die Bridge meldet sich wieder korrekt: `{"app":"smejj.com remote-browser-bridge","version":"live-browser-2026-07-15-1"}`. `smejj-control` läuft jetzt mit 1 statt 2 Replicas — damit ist die Ursache der Anmelde-Abbrüche (In-Memory-Speicher, Anfragen landeten auf verschiedenen Instanzen) beseitigt; das spart zudem laufende Kosten.

## Live-Beweise (im echten Chrome, ohne Hilfskonstruktionen)

Nachricht senden → Antwort → Seite neu laden → **Unterhaltung ist wieder da**. Verlauf zeigt beide Test-Chats; Umbenennen auf „Portugal-Test (umbenannt)" hat funktioniert; der Wegwerf-Chat wurde per Zwei-Schritt-Löschung entfernt; Chat-Wechsel über „Oeffnen" funktioniert. Byte-Verifikation: Die Dateien auf deinem Mac und auf GitHub sind identisch (SHA-256 geprüft: index.html `24cec345…`, sw.js `1b97be23…`).

## Schutzstatus (100 %)

`check:guidelines` OK (769 Dateien), `check:json` OK, `check:favicon-lock` OK (unverändert), `check:frontend` 124/6 = exakt der dokumentierte Vorbestand (0 neue Abweichungen), `check:platform` 7/7, **Start-Design-Lock neu eingefroren mit deinem Freigabe-Wortlaut** (28 Dateien, 2026-07-21T05:06:21Z). Rollback liegt bereit: `backups/welle0-1-rollback-2026-07-21T05-04-46Z/` + GitHub-History + Salad-Einstellungen rückstellbar. Task Capsule: `task-capsules/2026/07/job_welle0_1_20260721/`. Memory_Bank.md ist aktualisiert (nur verifizierte Fakten).

## Ehrliche offene Punkte

1. **Browser-Worker bootet noch:** `smejj-remote-browser-live` lädt sein Playwright-Image auf einem Community-Node (kann bis ~20 Min dauern). Bis dahin fällt der Browser bei blockierenden Seiten sauber auf die bisherige Ansicht zurück (nichts kaputt). Der interaktive Klick-Test (Amazon/Google) ist der letzte offene Beweis.
2. **Automatisierungs-Anmeldung:** Der 404-Fehler ist weg, aber die vollständige Job-Anmeldung braucht die Zusammenführung der zwei Token-Welten (Welle 3) — der Google-Login der App und die Job-API sprechen noch getrennte Sprachen.
3. **Welle 2 (Tempo):** liegt fertig geplant, startet erst mit deiner Budget-Freigabe im Format „Dienst + Betrag" (z. B. „10 USD/Monat für Groq freigegeben") plus Groq-Key.
4. **Kleinigkeiten aus dem Testbericht** (Status-Anzeige „AI disabled", GitHub-Button im Panel, Coding-Menüpunkt) — im Bericht dokumentiert, kein Risiko, nächste Runde.

*Keine Löschungen, keine Secrets berührt, keine neuen Kosten. Salad-Änderungen: 2 bestehende Dienste gestartet (Cent-Bereich/Tag, waren Teil der freigegebenen Reparatur), 1 Replica eingespart.*
