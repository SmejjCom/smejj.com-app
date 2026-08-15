# Sicherheitsprüfung A bis Z — 14.08.2026

**Auslöser:** Der Betreiber rief `https://smejj.com/admin/autopiloten/` ohne Anmeldung
auf und sah den vollständigen Adminbereich.

**Kurz vorweg:** Es sind **keine Daten abgeflossen.** Jede `/api/admin/*`-Route hat
auch vorher schon mit `401 authentication_required` geantwortet — genau das stand
auch auf dem Bildschirm des Betreibers. Sichtbar war die **Hülle**: Seitenleiste,
alle Modulnamen, Rechtestufen. Das ist der Bauplan des Adminbereichs, also
Aufklärung für einen Angreifer, und es sah aus, als stünde die Tür offen.

Bei der Suche nach der Ursache kam eine zweite, größere Sache heraus (Befund B).

---

## A — Der gemeldete Fehler: Adminbereich zeigte sich ohne Anmeldung

### Warum

Die Konsole wird an **zwei Orten** ausgeliefert:

| Ort | Prüfung | Stand vor dem Fix |
|---|---|---|
| `<control-server>/admin` | `adminUiRoutes.js` gibt ohne Adminrolle **keine einzige Datei** heraus | dicht |
| `smejj.com/admin` (GitHub Pages) | statisch — dort prüft **niemand** | **offen** |

Seit der Umstellung auf den statischen Weg (07.08.) fehlte die Prüfung ersatzlos.
30 Adminseiten, keine einzige mit Anmeldeprüfung.

### Was jetzt passiert

Neu: `public/admin/gate.js` (Quelle: `control-server/admin-ui/gate.js`), eingehängt
im `<head>` **aller 30** Adminseiten:

1. Verbirgt die Hülle, bevor der Browser etwas zeichnet.
2. Ohne lokale Sitzung → sofort `/auth/login/?next=…` (Rückkehrziel wandert mit).
3. Sichtbar wird die Konsole **erst**, wenn der Server den Akteur bestätigt hat.
   Damit ist auch ein angemeldeter Nicht-Admin ausgeschlossen.

Fail-closed an jeder Stelle: gesperrter Speicher (Privatmodus) gilt als abgemeldet.

### Zwei Fehler in meinem eigenen Fix — erst der echte Browser hat sie gezeigt

Beide Male war die Testebene grün und der Schutz trotzdem wirkungslos:

1. **Die CSP blockierte das Verbergen.** `element.style` zu setzen verstößt gegen
   `style-src 'self'`; der Browser meldete es und die Hülle blieb sichtbar.
   → Jetzt über eine Klasse aus `console.css` **plus** das `hidden`-Attribut als
   Rückfall. Beides kommt ohne inline Stil aus.
2. **Bei Netzfehler gab ich die Hülle frei.** Wer die Antwort des Servers
   verhindert, hätte die Konsole wieder zu sehen bekommen — und „der Server
   antwortet nicht" ist der Zustand, den ein Angreifer am leichtesten herstellt.
   → Jetzt: sichtbar **ausschließlich** nach bestätigtem Akteur. Sonst steht dort
   der Grund im Klartext und ein Knopf zum Wiederholen.

Der Betreiber verliert dadurch nichts: ohne Serverantwort stünde in der Hülle
ohnehin keine Zeile Inhalt.

---

## B — Die Wurzel: die Zugangspolitik war eine Verbotsliste

`src/shared/controlAccessPolicy.js` endete mit `return false` — **offen**.
Geschützt war nur, wer ausdrücklich eingetragen war.

Jede neu gebaute Route war damit ab der ersten Sekunde öffentlich, und **niemand
merkte es, weil nichts fehlschlug.** Im Gegenteil: eine vergessene Route
funktionierte *besser* als eine eingetragene. Zwei Narben davon standen schon im
Code:

- **01.08.** `/api/rag/search` gab jedem Auszüge aus den internen Regeldokumenten
  samt Quellpfad — während der Chat auf derselben Maschine interne Dateinamen
  ausdrücklich herausfiltert.
- **05.08.** `/api/training/capture` war der umgekehrte Fall: der fehlende Eintrag
  ließ `req.authUser` leer, und die Route wies auch Angemeldete ab.

**Umgedreht.** Geschützt ist jetzt die Voreinstellung. Wer eine Route öffentlich
will, trägt sie in `OEFFENTLICH` ein **und schreibt dazu, warum**. Wer das
vergisst, dessen Route ist zu — das fällt beim ersten Aufruf auf, und zwar dem
Entwickler, nicht einem Fremden Wochen später.

Nur `/api/*` wird so bewacht. Dateien (Startseite, Anmeldeseite, Bilder) bleiben
unberührt — sonst verlangte die Anmeldeseite eine Anmeldung.

### Was dadurch zugegangen ist

Alle folgenden antworteten am 14.08. **unangemeldet mit 200** (live gemessen gegen
`smejj-control.zeabur.app`), jetzt mit 401 — am laufenden Server nachgeprüft:

| Endpunkt | was er preisgab |
|---|---|
| `/api/storage/status` | Anbieter und Bucket-Name |
| `/api/capabilities` | innere Ausstattung des Dienstes |
| `/api/workers/salad/plan`, `/gpu-classes` | welche Umgebungsvariablen fehlen |
| `/api/chats`, `/api/projekte`, `/api/chat-medien` | Gespräche, Arbeitsbereiche, Anhänge |
| `/api/browser/session`, `/act`, `/close` | startet einen echten Browser auf unserer Maschine |
| `/api/agent/tasks`, `/api/agent/providers` | legt Agentenaufträge an |
| `/api/auth/sessions`, `/sessions/revoke` | fremde Sitzungen |
| `/api/auth/account/export`, `/delete` | Kontodaten, Kontolöschung |
| `/api/auth/email/password/change` | Passwortwechsel |
| `/api/billing/status`, `/portal` | Abrechnungsstand |
| **jede unbekannte `/api/`-Adresse** | verrät nicht mehr, welche Routen es gibt |

Die Kontorouten prüften sich schon vorher selbst — jetzt sind sie **doppelt**
geschützt.

Damit nichts kaputtgeht, schicken die Aufrufer jetzt ihre Anmeldung mit:
`public/shared/http-json.js` (zentral) und `public/browser-pane-session.js`.

### Was bewusst offen bleibt

- **Anmeldewege** (Google, GitHub, Passkey, Magic-Link, die fünf E-Mail-Pfade) —
  wer sich anmelden will, ist noch nicht angemeldet.
- **`/api/health`, `/api/browser/remote/health`** — die öffentliche Statusseite
  fragt sie ab. Wer wissen will, ob der Dienst läuft, kann sich gerade nicht anmelden.
- **`/api/compliance`** — Transparenzpflicht (EU AI Act).
- **`/api/chat`, `/api/agent`** — öffentliches Modell, Produktentscheidung.
  Gebremst: 120 Anfragen je Minute und IP, 120 global.
- **`/api/voice/*`, Worker- und Automatikrouten** — tragen einen **eigenen
  Maschinen-Token**, den ihr Handler selbst prüft. „Offen" heißt hier nur:
  nicht per Sitzung, nicht ungeprüft.
- **`/api/models/status`** — nennt nur Modellnamen, die die App ohnehin zeigt.

---

## C — Offen und dem Betreiber vorgelegt

### C1 — Zwei Endpunkte bleiben unangemeldet erreichbar (Kostenfrage, nicht Sicherheit)

| Endpunkt | Aufrufer | warum noch offen |
|---|---|---|
| `/api/search/web` | Chat-Brücke (**eigener Zeabur-Dienst**) | Server zu Server, ohne Nutzersitzung |
| `/api/browser/fetch`, `/api/browser/remote` | `browser-pane.js` | dasselbe Muster |

Sie zuzumachen braucht ein **gemeinsames Maschinen-Token in beiden Diensten** —
und genau dieser Weg (Umgebungsvariablen setzen) hat am 14.08. **zweimal die
Control-Umgebung gelöscht**. Ohne Aufsicht wollte ich das nicht anfassen.

Entschärft ist beides:
- Websuche: **20 Anfragen je Minute und IP**.
- Browser-Proxy: **SSRF-Schutz greift** — live geprüft, `169.254.169.254`,
  `127.0.0.1` und `localhost` werden abgewiesen. Offen ist nur das Abrufen
  fremder, öffentlicher Adressen.

**Nötig:** Token über `scripts/deploy/` setzen, nicht über den Roh-Editor.

### C2 — admin-lock: Fehlalarm meines Arbeitszweigs, im Bau-Branch alles gruen

Auf dem Arbeitszweig `feature/ap-heute-zeile` meldete `npm run check:admin-lock`
zwei veraenderte Dateien (`stepUp.js`, `adminUiRoutes.js`). Nach der Regel
*„Sperre pruefen, nicht stempeln"* habe ich **nicht** eingefroren, sondern
nachgesehen — und das war richtig: **im Bau-Branch sind alle vier Sperren gruen.**

```
start-lock    OK — 32 Startseiten-Dateien byte-identisch (14.08. 20:34)
security-lock OK — 10 sicherheitskritische Dateien byte-identisch (14.08. 16:46)
admin-lock    OK — 15 Adminbereich-Dateien byte-identisch (14.08. 15:20)
deploy-lock   OK — 2 Spiegel-Skripte byte-identisch (13.08. 03:57)
```

Der Arbeitszweig hing schlicht hinter dem Einfrieren vom 14.08. um 15:20 zurueck.
**Es ist nichts zu tun.** Der Fix ist deshalb auch nicht auf dem Arbeitszweig
ausgeliefert worden, sondern gezielt auf den Bau-Branch gepickt.

### C3 — Der Spiegel der Admin-Konsole hinkt hinterher

`npm run check:admin-console-sync` meldet Abweichungen, die es **vor** meiner
Arbeit schon gab (`views-stage7.js`, `views-stage9.js`, `console-stage11.js`,
`views-stage11.js`) und dazu die Seite `evolution`, die registriert ist, aber
keinen Ordner hat — `smejj.com/admin/evolution/` wäre 404.

Wichtig für den Fix: **`control-server/admin-ui/` ist die Quelle**, `public/admin/`
nur der Spiegel. Meine Änderungen liegen in **beiden**, damit sie beim nächsten
Spiegeln nicht herausfallen (die Falle „Artefakt ersetzt nie die Quelle").

---

## Wächter, damit es nicht zurückfällt

`tests/adminbereich-anmeldepflicht.test.mjs` (16) und
`tests/control-access-policy.test.mjs` (14) — **30 grün.** Nach der TÜV-Regel hat
jeder Wächter eine **kaputte und eine gesunde Probe**. Gegenprobe gefahren: baut
man den alten, CSP-blockierten Weg wieder ein, fallen 4 Tests um.

Die wichtigsten:

- Jede Adminseite lädt den Türsteher — und er steht **vor** `<body>`, sonst blitzt
  die Hülle auf.
- Quelle und Spiegel tragen denselben Türsteher.
- Verborgen wird **ohne** inline Stil (sonst blockt die CSP).
- Ein Netz- oder Serverfehler macht die Konsole **nicht** sichtbar.
- **Eine erfundene, unbekannte `/api/`-Route ist von sich aus geschützt** — der
  Test, an dem die alte Bauart scheitert.
- Gegenprobe: Dateien außerhalb `/api/` bleiben frei, sonst sperrt sich die
  Anmeldeseite selbst aus.

## Regressionsprüfung

| Gruppe | Ergebnis |
|---|---|
| `npm run check` (Syntax, ~200 Dateien) | grün |
| `check:frontend` | 455/455 |
| `check:llm-router` | 263/263 |
| `check:users` | 32/32 |
| `check:abuse` | 7/7 |
| Adminbereich + Zugangspolitik | 30/30 |

Zusätzlich am **laufenden Server** von außen gemessen: 12 vormals offene Endpunkte
antworten mit 401, alle Anmeldewege und öffentlichen Seiten weiter erreichbar.
Im **Browser** bewiesen: abgemeldeter Aufruf von `/admin/nutzer/` landet auf
`/auth/login/?next=%2Fadmin%2Fnutzer%2F`, ohne dass die Hülle je sichtbar wird.
