# 2026-08-05 — Die Suchmaschine luegt, nicht der Filter (job_websuche_komposita_20260805)
Volltext: [task-capsules/2026/08/job_websuche_komposita_20260805/capsule.md](../../task-capsules/2026/08/job_websuche_komposita_20260805/capsule.md).
- **Bing liefert dem Rechenzentrum Attrappen: vom Server 9 von 9 frischen
  Suchen** (3 von 12 Fragen hatten Treffer, alle drei aus dem Zwischenspeicher).
  Die SERP ist echt (Titel, Suchfeld, 10x `b_algo`), nur der Inhalt ist
  Fremdmuell — auf "Einwohnerzahl Wien 2024" kamen Justin-Bieber-Songtexte auf
  Chinesisch. Englische Fragen scheitern genauso. `&format=rss` hilft nicht.
- **MESSUNGEN AUS DIESEM NETZ SIND ANGREIFBAR:** Fortinet-Firewall faengt TLS ab
  (blockt sogar smejj.com mit 403). Nur `/api/search/web` auf dem Server zaehlt.
- **MEINE DIAGNOSE WAR FALSCH und ich habe sie ausgeliefert, bevor ich sie an
  echten Daten geprueft habe.** Ich schloss von `kept 0` auf einen zu strengen
  Filter, statt die 10 verworfenen Treffer auszudrucken. A/B an identischen
  Rohtreffern: 0 Unterschiede von 8. **MERKREGEL: erst Rohdaten ausdrucken,
  dann erklaeren.** Die Antwort stand zudem schon im Kopf von
  `searchKeyProvider.js` (seit 2026-08-04). Vor dem Raten die Nachbardatei lesen.
- **RUECKBAU (a6f7d62)** im Code raus; **LIVE laeuft weiter die wirkungslose
  Fassung** — Betreiber: "lass die Parallelsitzung das machen". Zwei gepruefte
  Artefakte bereit, Uebergabe in der Kapsel. **MERKREGEL: ein Artefakt aus HEAD
  liefert den GANZEN Tagesstand aus** (hier 38 fremde Commits inkl. neuer
  Endpunkte auf dem Anmelde-Server). Schmal: `git worktree` auf den Live-Commit,
  dort `git revert`.
- **ZWEI EIGENE GIT-FEHLER, bereinigt.** (1) `git add <pfade> && git commit`
  reicht NICHT — war Fremdes schon vorgemerkt, schreibt `commit` den GANZEN
  Index mit. **Richtig: `git commit -- <pfade>`.** (2) `git stash -u` raeumte
  sieben fremde Dateien weg. **Kein stash in geteilter Arbeitskopie.**
- **EIGENE RAG-REGRESSION behoben (fdafbeb):** 2345e68 verschob den
  sw.js-Changelog nach .md — damit wurde er Projektwissen, und "Loesche alle
  alten Dateien im Objektspeicher" kam mit 21,1 ueber die Schwelle 20.
  Changelogs jetzt am DATEINAMEN ausgeschlossen. **MERKREGEL: .js nach .md zu
  verschieben aendert, wer die Datei liest.**
- **BLOCKER beim Betreiber:** von 85 Container-Variablen ist **keine**
  suchbezogen; `SMEJJ_SEARCH_TAVILY_API_KEY` fehlt. Anbieter seit 2026-08-04
  freigegeben (0,00 USD, keine Karte), alles gebaut inkl.
  `smejj.com Suchschluessel-eingeben.command`. Schluessel gibt nur er ein.
