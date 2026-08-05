## 2026-08-04 — Anmeldepflicht an der Chat-Bruecke LIVE (Bridge v114, sw v217)

Freigabe des Betreibers (Wortlaut in beiden Sperr-Manifesten). `check:all` gruen
(1845). Live gemessen: ohne Token 401, fremde Herkunft 403.

- **DER ORIGIN-KOPF IST KEIN SCHUTZ.** Gemessen: ohne Kopf 403, fremde Herkunft
  403 — aber ein `curl` mit `Origin: https://smejj.com` bekam die VOLLE Antwort.
  Der Kopf wirkt nur im Browser; ausserhalb setzt ihn jeder selbst. Die Bruecke
  war damit frei mitbenutzbar, auf Kosten des geteilten Groq-Kontingents.
  MERKREGEL: **CORS schuetzt Nutzer vor fremden Seiten, nicht den Server vor
  fremden Klienten.**
- **PRUEFUNG UEBER DEN CONTROL SERVER, nicht mit eigenem Geheimnis.** Lokal
  pruefen braeuchte `SMEJJ_SESSION_SECRET` in der Bruecken-Umgebung; ein
  Env-PATCH bei Salad ersetzt die GANZE Umgebung samt Code-Buendel. Die Bruecke
  fragt darum `/api/auth/me` und merkt sich das Ergebnis 10 min (positiv) /
  30 s (negativ). Fail-closed bei Ausfall.
- **EIN GEPRAEGTES TEST-TOKEN GILT NICHT.** Der Schluessel aus der Salad-Gruppe
  `smejj-control` erzeugt ein Token, das die LAUFENDE Instanz ablehnt — sie
  haelt einen aelteren Env-Stand. MERKREGEL: **derselbe Prozess signiert und
  prueft, also sind ECHTE Nutzer-Token immer konsistent** — ein Fehlschlag beim
  Praegen widerlegt die Auslieferung nicht, belegt sie aber auch nicht.
  [[smejj-admin-livetest-weg]] ist an dieser Stelle ueberholt.
- **VOR DEM DEPLOY DEN PRECACHE GEGEN LIVE HALTEN.** Ein frueherer Anlauf wurde
  bewusst abgebrochen: die Arbeitskopie trug ein `sw.js` einer Parallelsitzung,
  das `/assets/autonomous-thread-run.js` im Precache fuehrte — live 404. Ein
  Deploy haette `cache.addAll` scheitern lassen und den Cache ALLER Besucher
  zerlegt. MERKREGEL: **jeden Precache-Eintrag vor dem Deploy aufloesen.**
- OFFEN: der angemeldete Durchlauf. Eine Sitzung kann sich nicht anmelden.
  Rueckweg liegt bereit (Buendel v112 ohne Wache + restart_chat_bridge_salad.mjs,
  Ruecknahme in etwa einer Minute).
