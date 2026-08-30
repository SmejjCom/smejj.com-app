# Task Capsule — v713-Übernahme und Live-Gang (2026-08-30, job_v713_uebernahme_20260830)

## Auftrag

Betreiber-Freigabe: „Ich finde deinen Vorschlag gut. Kannst Du umsetzen" +
„Ich gebe dir alle Rechte von A bis Z. Mach hundert Prozent fertig. Lass
nicht offen." — bezogen auf: Parallel-Stand übernehmen und zu Ende bringen.

## Was vorgefunden wurde

Die Parallel-Session hatte sw v713 („Mobil: Icons in EINER Zeile",
Betreiber-Screenshot 30.08. 10:34 „Icons rutschen unten runter") fertig
gebaut und dokumentiert, aber uncommittet im Arbeitsbaum liegen lassen —
plus 15 beidseitig divergierte Dateien zwischen public/ und dem
Frontend-Repo (teils >100 Zeilen Differenz) und ein untracked
ox-alpha-Freischalt-Skript (CONFIRM-Gate).

## Umsetzung (Ship-Loop)

1. Voranalyse: Diffs verstanden (7 Dateien, 106 Zeilen; sw v712→v713;
   SW_VERSIONSVERLAUF-Eintrag fertig geschrieben).
2. Checks vor Übernahme: check:frontend EXIT 0 (inkl. precache 172 Module,
   modul-syntax 236), check:assets 218 OK, check:start-styles Bundle OK.
3. Übernahme-Commit 612859e7 (Arbeitszweig, gepusht zu GitHub + Codeberg).
4. Start-Lock neu gestempelt (34 Dateien; Backup
   backups/start-design-lock/2026-08-30T10-11-11-012Z/ als Rollback-Punkt;
   Wortlaut der Freigabe im Stempel).
5. Deploy: selektiv 6 Dateien (start-styles.css, chat-actions.css, sw.js —
   je Wurzel + assets/) ins Frontend-Repo ~/smejj-app-frontend, Commit
   c7db2a2, Push nach main (46a3c07..c7db2a2) + deploy-frueh-gate.
   Die 15 divergierten Dateien blieben UNANGETASTET (kein Blindkopieren —
   Abgleichs-Lehre vom 23.08.).
6. Live-Beweis: smejj-shell-v713 live, Startseite HTTP 200, TTFB 338 ms,
   49 Klemm-Regeln (ellipsis/nowrap) im Live-Bundle.

## Messpflicht erfüllt (Nachher gegen Vorher)

| Metrik | v712 früh | v713 jetzt | Budget |
|---|---|---|---|
| CLS | 0 | 0 | < 0,1 OK |
| INP kalt | 56 ms | 40 ms | < 200 OK |
| LCP kalt | 1.120 ms | 976 ms | < 1.500 OK |
| Gewicht kalt | 298 KB | 297 KB | < 300 OK |
| TTFB kalt | 492 ms | 250 ms | netzabhängig |

Keine Regression (Performance-Lock erfüllt). Benchmark:
docs/benchmarks/webvitals_v713_nachdeploy_2026-08-30.json.

## Bewusst offen gelassen (mit Begründung)

1. **voice-ohr-solo.js-Änderung TAUCHTE WÄHREND des Laufs neu auf** — die
   Parallel-Session ist AKTIV im selben Arbeitsbaum. Ihre halbfertige
   Änderung ohne Markenerhöhung liess check:all mit „markenkette VERLETZT
   (?v=3)" stoppen. Heilung (Marke v3→v4 in composer-tools.js/sw.js)
   gehört der aktiven Session; ein Eingriff von hier hätte Wettlauf
   bedeutet.
2. **15 divergierte Dateien** (public/ vs Frontend-Repo): eigenes
   Zusammenführ-Projekt Datei für Datei nach dem Abgleichs-Verfahren —
   nicht überstürzt in einem laufenden Betrieb.
3. Review-Reste (Onboarding-i18n, html-lang, AGB-Link, Konversion,
   Anrede/iMild): freigabefähig, aber nicht in einen Baum gebaut, den eine
   zweite Session gerade bearbeitet.

## Rollback

Arbeitszweig: Commit vor Übernahme 80a48d2d. Frontend: main vor Deploy
46a3c07 (git revert c7db2a2 + push genügt; Pages deployt sofort zurück).
Start-Lock-Backup siehe oben.
