# Das Werkstatt-Tor steht auf 8 von 9 — es fehlen ZWEI Dateien

Stand: 2026-08-13 nachts, gemessen auf `origin/feature/auth-redesign-github-magiclink`.

## Warum das jetzt wichtig ist

Der Nachtbau (23:01 Ortszeit) hat **noch nie gebaut**. Der strukturelle Grund
ist heute gefunden und behoben: `pruefe-tor.mjs` verglich gegen `origin/main`,
das 95 Commits zurücklag — dadurch galt **jedes** Lock-Manifest automatisch als
„seit der Bau-Basis verändert" (Commit auf dem Bau-Branch, siehe
`scripts/werkstatt/pruefe-tor.mjs`, Konstante `BAU_BASIS`).

Danach wurde alles Weitere abgeräumt:

| Station | Stand |
| --- | --- |
| Lock-Manifeste unangetastet | ✔ |
| start / security / favicon / admin / deploy / einwilligung | ✔ alle sechs |
| Prüfsuite | ✔ **2173 / 2173** |
| **check:guidelines** | ✖ **letzter Blocker** |

## Der letzte Blocker: zwei Dateien über 800 Zeilen

```
public/chat-bridge.js : 834 Zeilen
src/server.js         : 806 Zeilen
```

**Beide müssen unter 800 — eine allein löst nichts.** Solange eine drüber
liegt, bleibt `check:guidelines` rot und das Tor zu, egal wie grün der Rest ist.

### An die Bridge-Sitzung (`public/chat-bridge.js`, 834)

Die Datei wird gerade aktiv weiterentwickelt (v138 16:05, v140 18:50) **und
steht unter dem Security-Lock**. Deshalb fasst die Werkstatt-Sitzung sie
bewusst nicht an: ein fremder Umbau würde eure Arbeit zerreißen und den
Lock-Stempel sofort entwerten.

Bitte den nächsten Auslagerungsschnitt selbst setzen — ihr wisst am besten,
welcher Block gerade nicht in Bewegung ist. Danach:
`node scripts/check-security-lock.mjs --freeze --confirm "<Freigabe-Wortlaut>"`
(Betreiber-Freigabe einholen, nicht die alte weiterreichen).

### An die Video-/Control-Sitzung (`src/server.js`, 806)

Nur **6 Zeilen** drüber. Ein sauberer Schnitt liegt bereit: der Block ab
Zeile 715 bis Dateiende sind ~92 Zeilen reine Sitzungs-/Token-Helfer ohne
Routing-Logik:

```
boundedInteger, readAuthBody, serializeSessionCookie, ensureRegistrySid,
sessionStillValid, serializeSessionToken, serializeAccessToken, readSession
```

Vorschlag: nach `src/server-session-helpers.js` auslagern und importieren.
Das bringt `server.js` auf ~714 Zeilen — mit Luft für die nächsten Wochen.
Achtung: es ist Auth-naher Code, also Tests mitlaufen lassen.

## Zwei Fallen, die heute Zeit gekostet haben

1. **Worktrees haben keine `node_modules`.** Ohne Symlink meldet `npm test`
   dort vier Rote, die keine sind (u. a. `@resvg/resvg-js` fehlt). Vor jedem
   Worktree-Testlauf:
   `ln -s "$HAUPTREPO/node_modules" "$WORKTREE/node_modules"`
2. **Sperren-Stempel sind Sekundenware.** Während dieser Arbeit pushte eine
   Parallelsitzung dazwischen (v140) und entwertete einen frischen
   Security-Stempel binnen zehn Minuten. Ablauf, der funktioniert:
   `fetch` → `rebase` → Sperren **erneut** prüfen → stempeln → `--amend` → push.
   Also: Stempel immer als **letzte** Handlung vor dem Push.

## Wenn beide Dateien unter 800 sind

`node scripts/werkstatt/pruefe-tor.mjs` muss dann **TOR OFFEN** melden — und
der Nachtbau kann zum ersten Mal wirklich arbeiten. Die App muss um 23:01
Ortszeit geöffnet sein, und „Run now" wurde bis heute nie geklickt (der erste
Lauf kann also an Werkzeug-Freigaben hängen).
