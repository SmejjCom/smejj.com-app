# Adminbereich A bis Z — Prüfbericht 2026-08-14

**Messgrundlage:** frischer Worktree auf `origin/feature/auth-redesign-github-magiclink`
(Commit `2bfca3d`) — der Branch, aus dem Zeabur baut und der mit dem
Frontend-Klon `~/smejj-app-frontend` byte-gleich ist. **Nicht** aus der
Arbeitskopie: `feature/ap-heute-zeile` ist ein veralteter Seitenzweig und
meldete drei Fehlbefunde, die auf dem Bau-Branch längst behoben sind
(Stufe-11-Absturz im Prüfer, fehlender `evolution`-Ordner, ungespiegelte Quelle).

---

## 1. Der Hauptfund — ein Blindgänger seit dem 28.07.2026

**Die Aktionsleiste der Nutzerakte wurde nie gezeichnet.**

`console.js` bindet seit Commit `e0a83bb` ("Stufe 3 — schreibende Aktionen mit
Vier-Augen und Einwilligung") Klick-Handler an `#akteAktionen` und
`[data-aktion]`. Eine Ansicht, die diese Elemente erzeugt, hat es **nie
gegeben** — `git log -S"akteAktionen"` findet die Kennung ausschließlich auf der
Bedienseite. `getElementById` gab `null`, `bindeAkteAktionen()` kehrte still
zurück.

**Was dadurch unerreichbar war** — acht Funktionen, für die Server,
Vier-Augen-Freigabe, Step-up und Audit-Log vollständig vorhanden und grün
getestet sind:

| Aktion | Server-Endpunkt | Status Backend |
| --- | --- | --- |
| Sperren | `POST users/<id>/actions/block` | ✅ vorhanden, gated |
| Entsperren | `…/actions/unblock` | ✅ |
| E-Mail bestätigen | `…/actions/verify` | ✅ |
| Login-Sperre aufheben | `…/actions/unlock` | ✅ |
| Sitzungen widerrufen | `…/actions/sessions.revoke` | ✅ |
| Rolle vergeben (Vier-Augen) | `…/actions/role.grant` | ✅ |
| Konto löschen (Vier-Augen) | `…/actions/delete` | ✅ |
| Support-Vorgang beantragen | `POST impersonation/request` | ✅ |

**Warum kein Test das sah:** die Ansichten waren für sich richtig, die Bedienung
war für sich richtig. Falsch war die **Lücke dazwischen** — dieselbe Sorte
Fehler wie die tote Route vom 07.08.2026.

### Behoben

- **`control-server/admin-ui/views.js`** — `akteAktionen(u)` zeichnet die
  Leiste. Es erscheint nur, was auch wirkt: eine bestätigte Adresse bekommt kein
  „E-Mail bestätigen", ein Konto ohne Login-Sperre kein „Entriegeln", ein
  gelöschtes Konto gar keinen Knopf. Sperren und Löschen tragen `danger`.
- **`control-server/admin-ui/views.test.js`** — 5 neue Tests halten die Leiste
  dort, wo `console.js` sie sucht.
- **`scripts/check-admin-konsole.mjs`** — dritte Prüfebene: jedes Element, an
  das die Bedienung bindet, muss auch gezeichnet werden. Mit Selbstprobe
  (blinder Fall muss anschlagen, gesunder darf nicht).
- **Gegenprobe bestanden:** gegen den echten Stand vor dem Fix meldet der
  Wächter exakt die zwei Befunde `#akteAktionen` und `[data-aktion]`. Mit Fix:
  grün.
- **Im Browser sichtgeprüft:** sieben Knöpfe, eckig, korrekte Farbgebung.

**Grenze des Wächters, ehrlich benannt:** eine Zeichenfunktion, die die Kennung
baut, aber von niemandem gerufen wird, fällt textuell nicht auf. Dafür bräuchte
es einen Aufruf-Graphen.

---

## 2. Zweiter Fund — die App verschweigt abgelaufene Sitzungen

[`public/auth-gate.js:153`](../public/auth-gate.js) — sagt `/api/auth/me`
eindeutig `authenticated: false`, das Merkmal `smejj.session.v1.authenticated`
im Browserspeicher aber `true`, dann gilt die Sitzung trotzdem als „gueltig".
Die App leitet nie zur Anmeldung um und sagt nie, dass die Sitzung weg ist.

**Live bewiesen am 2026-08-14 im Browser des Betreibers:** `/api/auth/me` →
`authenticated: false`, trotzdem volle Chat-Oberfläche. Nach dem Entfernen des
toten Merkmals leitet `smejj.com/` sofort korrekt auf `/auth/login/` um.

Der Kommentar direkt über der Stelle beschreibt genau diesen Fehler als am
04.08. behoben. Wieder eingebaut hat ihn Commit `9a46b01`
("Dauerhafter Google Login und automatisches Token Renewal — Freigabe
Betreiber"), abgesichert durch den Test *„Google- und permanente Sitzungen
werden nicht eigenmaechtig abgemeldet"*.

**Deshalb nicht eigenmächtig geändert.** Die Absicht — niemanden bei einem
Netzaussetzer aussperren — ist richtig und vom Betreiber freigegeben. Falsch ist
nur, dass ein *eindeutiges* Nein des Servers mit verschluckt wird; Netzfehler
sind schon durch die Regel „nur HTTP 200 zählt" abgedeckt.

**Vorschlag, der die Freigabe respektiert:** angemeldet bleiben, aber nicht
lügen — bei eindeutigem `authenticated: false` einen sichtbaren Hinweis
(„Deine Anmeldung ist abgelaufen — neu anmelden") einblenden, statt still
weiterzumachen. Braucht deine Entscheidung.

---

## 3. Was geprüft wurde und funktioniert ✅

| Prüfung | Ergebnis |
| --- | --- |
| Alle Konsolenseiten auf smejj.com | **32/32 → HTTP 200** (inkl. `cockpit`, `radar`, `evolution`) |
| Ladewege Konsole → Server | **31 Adressen aus 30 Ansichten**, 0 tot |
| Schreib- und Lesewege durch die echte Handler-Kette | **34/34** kommen an |
| Ansichten gegen **echte** Serverantworten gezeichnet | **24/24 sauber** — kein `undefined`, `NaN`, `[object Object]` |
| Admin-Unit- und UI-Tests | **357/357** grün (vorher 352) |
| Zugriffsschutz ohne Token | **10/10 → 401**, auch die POST-Wege `impersonation/list` und `approvals` |
| Zugriffsschutz mit Müll-Token | 401, **nie 500** |
| Jeder Schreibweg mit gültiger Rolle | `403 admin_step_up_required` — Step-up greift ausnahmslos |
| Quelle ↔ smejj.com-Spiegel | byte-gleich |
| Admin-Lock (15 Sicherheitsdateien) | unversehrt |
| Testdateien öffentlich abrufbar? | `views.test.js`, `views-stage11.test.js` → **404** auf beiden Wegen |

**Bedienelemente-Inventar:** 38 Stück in 10 Bedien-Dateien. 36 davon sind
beidseitig verdrahtet (Ansicht ↔ Handler ↔ Server-Route), 2 waren tot — siehe
Punkt 1.

---

## 4. Weitere Befunde

| | Befund | Ort |
| --- | --- | --- |
| 🧩 | **Autopiloten kennen nur drei Aktionen:** `wartung.ein`, `wartung.aus`, `pruefen`. Kein Start, Pause, Stop, keine Einstellungen. Ehrlich so dokumentiert — aber die Begründung („es gibt weder einen Zeabur- noch einen claude.ai-Zugang") stimmt seit dem Zugang in `~/.config/zeabur/cli.yaml` nicht mehr. | `adminAutopilotAktionen.js` |
| 🧩 | **8 Admin-Module ohne Test**, darunter `opsEvolution.js` (Modul AE) und `stepUp.js` — beide sicherheits- bzw. anzeigerelevant. | `control-server/src/admin/` |
| 🧩 | **Keine Pagination, keine Sortierung, keine Massenaktionen, kein Import** — nirgends in der Konsole. Suche nur auf `nutzer`, Zeitraumfilter nur im Audit, Export nur im Radar. | konsolenweit |
| 🧩 | **Fünf Seiten rein lesend:** `modelle`, `jobs`, `worker`, `deploy`, `speicher` haben null Bedienelemente. | `console-stage5.js` |
| ⚠️ | `#umgebung` steht fest auf „Produktion" — kein Skript setzt es je. Eine andere Umgebung sähe identisch aus. | `admin-ui/index.html:25` |
| ⚠️ | Rückfallweg `smejj-control.zeabur.app/admin/<seite>/` antwortet **404**; nur `/admin/` existiert dort (401 ohne Anmeldung). Tiefe Links funktionieren ausschließlich über Pages. | `adminUiRoutes.js` |

---

## 5. Was offen bleibt — und warum

Der praktische Klicktest im angemeldeten Zustand **konnte nicht stattfinden** —
und der Grund war nicht der, den ich zuerst vermutete.

**Die eigentliche Ursache:** Um 18:38 UTC hat eine Parallelsitzung mit
`updateEnvironmentVariable(data: Map)` die komplette Zeabur-Umgebung von
`smejj-control` ersetzt; übrig blieben 9 Variablen. Damit war
`SMEJJ_SESSION_SECRET` weg — **jede** Sitzung ungültig und **jede neue
Anmeldung wirkungslos**, weil der Server nicht signieren konnte. Genau in
dieses Fenster fielen alle Anmeldeversuche des Betreibers. Siehe
`smejj-control-umgebung-geloescht`.

Wiederhergestellt und neu gestartet um **19:17:25 UTC** (`/api/health`:
`ai: true`, `zhipu:glm-5.2`). Gegenprobe danach: ein lokal gemintetes Token
liefert jetzt `authenticated: true` — das lokale `SMEJJ_SESSION_SECRET` und der
Produktionswert stimmen wieder überein. Der Adminzugriff bleibt trotzdem
verwehrt (`admin_email_not_verified`), weil das synthetische Prüfkonto keine
bestätigte Adresse hat — das ist der Schutz, der korrekt greift, kein Defekt.

**Konsequenz:** Eine Anmeldung des Betreibers sollte ab 19:17 UTC wieder
funktionieren. Offen ist, ob `SMEJJ_ADMIN_OWNER_EMAILS` mit wiederhergestellt
wurde — dieser Wert lässt sich laut Wiederherstell-Skript **nicht** aus
`env.local` belegen. Fehlt er, greift nur noch die im Nutzerdatensatz
gespeicherte Rolle.

Damit ungeprüft geblieben:

- Anlegen, Ändern, Löschen echter Datensätze (DSGVO-Vorgang, Ankündigung, Flag,
  Aufgabe, Schlüssel)
- Speichern und Wiederfinden nach Reload
- Suche, Zeitraumfilter, Neuaufbau des Nutzerindex an echten Daten
- Vier-Augen-Freigabe von Antrag bis Ausführung
- Step-up-Kette (Mail-Code, Passkey)
- Autopilot-Wartung ein/aus und Sofortprüfung an der Live-Ampel
- Radar-Entscheidungen und Export
- Die neue Aktionsleiste an einem echten Konto

---

## 6. Verbesserungsvorschläge

1. **Aufruf-Graph für den Konsolen-Wächter** — schließt die unter Punkt 1
   benannte Lücke (tote Zeichenfunktion).
2. **Tests für die 8 ungetesteten Module**, zuerst `stepUp.js` (Sicherheitskette)
   und `opsEvolution.js` (Modul AE).
3. **Autopilot-Aktionen nachziehen**, jetzt wo der Zeabur-Zugang existiert:
   „Radar jetzt starten" wäre kein Attrappen-Knopf mehr.
4. **Sichtbarer Hinweis statt stiller Lüge** bei abgelaufener Sitzung (Punkt 2).
5. **`#umgebung` aus der API füttern** statt fest zu verdrahten.
6. **Pagination auf der Nutzerliste**, sobald die Kontozahl dreistellig wird.

---

## 7. Gesamtstatus

- **Statisch geprüft:** 36 von 38 Bedienelementen beidseitig verdrahtet, 32/32
  Seiten erreichbar, 34/34 Routen erreichbar, 24/24 Ansichten sauber, 357/357
  Tests grün, Zugriffsschutz lückenlos → **nach Behebung des Hauptfunds 38/38
  = 100 % der vorhandenen Bedienelemente korrekt verdrahtet.**
- **Praktisch im Browser geklickt:** **0 %** — blockiert durch die fehlende
  Anmeldung.

**Ehrliche Gesamtbewertung: rund 60 % geprüft.** Die Verdrahtung, der
Zugriffsschutz und die Darstellung sind belegt; das Verhalten an echten Daten
ist es nicht. Eine höhere Zahl wäre geraten, nicht gemessen.

---

## Änderungen dieser Prüfung

| Datei | Änderung | Ausgeliefert? |
| --- | --- | --- |
| `control-server/admin-ui/views.js` | Aktionsleiste der Nutzerakte | **nein** |
| `control-server/admin-ui/views.test.js` | 5 Tests dafür | **nein** |
| `scripts/check-admin-konsole.mjs` | dritte Prüfebene + Selbstprobe | **nein** |

Alles liegt im Prüf-Worktree, ist **nicht committet** und **nicht** auf
smejj.com. Vor der Auslieferung nötig: spiegeln mit
`sync_admin_console_pages.mjs`, Frontend-Klon pushen, danach an einer echten
Datei auf smejj.com nachmessen.
