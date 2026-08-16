# Sicherheitsprüfung A bis Z — Runde 3, 15.08.2026

Fortsetzung von Runde 1 (`SICHERHEITSPRUEFUNG_A_BIS_Z_2026-08-14.md`) und
Runde 2 (`SICHERHEITSPRUEFUNG_RUNDE2_2026-08-14.md`).

Diesmal: Speicher und Presign, DSGVO-Wege, Impersonation, Vier-Augen-Kette und
die klassischste aller Lücken — Zugriff auf **fremde** Objekte.

**Ergebnis: zwei ernste Funde, beide behoben und ausgeliefert.** Beide sind
derselbe Fehlertyp — eine Prüfung war da, aber sie prüfte die falsche Frage.

---

## Fund 1 — Verschiedene Konten teilten sich einen Speicherplatz

`control-server/src/chats/chatSyncStore.js` bildete die Kontokennung so:

```js
`user_${email.replace(/[^a-z0-9]+/g, "_")}`
```

Jedes Sonderzeichen wurde zu `_`. Damit landeten **verschiedene, unabhängig
registrierbare Konten im gleichen Ordner**:

```
max.mustermann@example.com  ─┐
max-mustermann@example.com   ├─>  chats/user_max_mustermann_example_com/
max_mustermann@example.com   │
max+mustermann@example.com  ─┘
```

Wer sich mit der Bindestrich-Schreibweise anmeldete, **las und überschrieb die
Gespräche** desjenigen mit der Punkt-Schreibweise. Betroffen waren drei Ablagen:
Chats, Projekte, Medien.

Das ist keine theoretische Kollision. Bei jedem Anbieter mit freier Adresswahl
sind das verschiedene Postfächer, und ein Angreifer sucht sich die passende
Variante zum Opfer selbst aus.

### Warum es glimpflich ausging

Der Sync steht fail-closed hinter `SMEJJ_CHAT_SYNC_ENABLED` und war **nie
eingeschaltet** (live belegt: die Route antwortete `chat_sync_deaktiviert`).
Kein Datenbestand, keine Migration.

### Der Fix

SHA-256 der normalisierten Adresse, 128 Bit hex. **Bewusst ohne Rückfall** auf
die alte Regel — ein Rückfall würde genau das Leck offenhalten.

Nebengewinn: die E-Mail-Adresse steht nicht mehr im Ablagepfad. Wer die
Dateiliste des Eimers sieht, sieht keine Postfächer mehr. Datenminimierung,
ohne dass es etwas kostet. Zuordnen bleibt möglich — aus der Adresse lässt sich
der Ordner nachrechnen, und für Support und DSGVO-Auskunft reicht genau das.

---

## Fund 2 — Signierte Speicheradressen für jeden Angemeldeten

`/api/storage/presign` nahm `key` und `operation` **ungeprüft** vom Client
entgegen. Der Gatekeeper prüft den **Pfad** (Erlaubnisliste von Präfixen), aber
nie, **wer** fragt. Und die Route verlangte nur „angemeldet", keine Rolle.

Registrieren kann sich jeder. Damit konnte **jedes frisch angelegte Konto** sich
eine signierte PUT-Adresse ausstellen lassen für:

| Präfix | was dort liegt |
|---|---|
| `deployments/control/*.tar.gz` | **die Release-Artefakte des Control-Servers** |
| `model-files/**` | Modelldateien |
| `rag/**` | das Projektwissen, das in Antworten fließt |
| `backups/**` | Sicherungen |
| `objects/`, `manifests/`, `checksums/`, `indexes/`, `static-assets/` | Rest |

**`deployments/` wiegt am schwersten.** Wer dort ein Artefakt austauscht, legt
Code ab, den der Betreiber später ausrollt — `opsDeploy.js`, `opsSpeicher.js`
und `bootstrap-control-release.mjs` lesen genau dieses Präfix. Das ist keine
Dateiablage mehr, das ist die **Lieferkette**.

### Der Fix

Gebraucht wird von normalen Nutzern genau **ein** Fall: `public/maus-replay.js`
liest Replay-Aufnahmen unter `capsules/maus-engine/` (`download`). Das ist der
einzige Aufrufer im Frontend, und er lädt nichts hoch.

Also: dieser eine Lesefall bleibt für Angemeldete offen, **alles andere verlangt
eine Adminrolle**. Die Rollenauflösung hängt bewusst *hinter* der
Nutzerfall-Prüfung — sonst hinge der Replay-Weg an einer Store-Abfrage, die
auch 503 werden kann.

---

## Was sauber ist — mit Beleg

### Kein Ausbruch aus dem eigenen Kontopfad

`chatKennungGueltig` erlaubt nur `[A-Za-z0-9_-]{1,64}` — kein Punkt, kein
Schrägstrich. **12 Ausbruchsversuche** durchprobiert (`../../anderesKonto/chat1`,
`chat1/../../x`, `%2e%2e%2f`, `a/b`, …): **alle abgewiesen**, gültige Kennungen
weiter akzeptiert. Die Konto-ID kommt immer aus der Sitzung, nie aus der Anfrage.

### DSGVO-Wege wirken nur auf das eigene Konto

Export und Löschung nehmen die Adresse aus **`user.email` der Sitzung**, nicht
aus dem Anfragekörper. Ein Fremdzugriff über eine mitgeschickte Adresse ist
konstruktiv ausgeschlossen. Löschen verlangt zusätzlich Passwort und
Bestätigungstext.

### Impersonation ist an die Einwilligung gebunden

Einwilligung mit Ablaufzeit; zustimmen darf **nur die betroffene Person selbst**
(`impersonation_consent_wrong_person`, wenn jemand anders antwortet); ein
Break-Glass ohne Einwilligung erzeugt einen ausdrücklichen Alarm.

### Vier Augen heißt wirklich zwei Personen

```js
if (person === record.requestedBy) return { ok: false, error: "approval_self_approval_forbidden" };
```

Der Antragsteller kann nicht selbst freigeben — auch der Owner nicht.

---

## Neue Wächter

| Datei | Tests | hält fest |
|---|---|---|
| `tests/presign-nur-admin.test.mjs` | 6, neu | Replay-Lesefall bleibt, alles Schreibende fällt heraus; und die Nutzerfall-Liste läuft nicht vom Gatekeeper-Präfix weg |
| `tests/chat-sync.test.mjs` | +2 | verschiedene Konten bekommen nie denselben Ordner; die Adresse steht nicht im Pfad |

Beide mit kaputter **und** gesunder Probe. Gegenprobe gefahren: mit der alten
Kennungsregel fallen 3 Tests um.

## Gemessen

| Prüfung | Ergebnis |
|---|---|
| `npm run check` | grün |
| `check:frontend` (Bau-Branch) | 459/459 |
| `check:gatekeeper` | 13/13 |
| `check:sync` | 7/7 |
| `check:users` | 32/32 |
| alle vier Sperren | grün |

**Grenze der Messung, ehrlich gesagt:** den Unterschied zwischen „angemeldet
ohne Adminrolle" (403) und „Admin" (200) konnte ich live nicht messen — dafür
bräuchte ich eine Anmeldung, und Zugangsdaten fasse ich nicht an. Live belegt
ist der Zustand ohne Anmeldung (401). Die Rollengrenze selbst ist durch die
sechs Wächter-Tests abgedeckt.
