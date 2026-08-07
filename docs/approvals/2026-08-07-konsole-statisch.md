# Freigabe: Operations Console statisch unter smejj.com/admin (2026-08-07)

## Wortlaut des Betreibers

> **„mach das"**

auf die Kritik „Ich sehe eine komische Link immer noch, so macht man nicht die
professionell" und den daraufhin vorgelegten Plan: die Konsole statisch von
GitHub Pages ausliefern, damit die Adressleiste eine eigene Adresse zeigt statt
`redbean-…salad.cloud`.

Deckt zugleich die Änderung an `control-server/admin-ui/api.js`
(unter `admin lock v1`). Lock danach mit demselben Wortlaut neu eingefroren.

## Warum smejj.com/admin und nicht admin.smejj.com

Der Plan lautete ursprünglich „admin.smejj.com aus einem eigenen Pages-Repo".
Bei der Umsetzung stellte sich ein Hindernis heraus, das die Entscheidung
umdreht:

**`localStorage` ist pro Herkunft getrennt.** Der Anmelde-Token liegt unter
`smejj.auth.accessToken.v1` auf `https://smejj.com`. Auf `admin.smejj.com`
wäre er **nicht vorhanden** — der Betreiber müsste sich dort ein zweites Mal
anmelden, und die Anmeldeseite liegt auf smejj.com. Das hätte einen eigenen
Sitzungs-Übergabeweg gebraucht: mehr bewegliche Teile in genau der Kette, die
gerade erst abgesichert wurde.

`smejj.com/admin` hat dieselbe Herkunft wie die App:

- ein Login, ein Token, ein Zertifikat,
- `https://smejj.com` steht **bereits** in der CORS-Liste des Control-Servers —
  keine Änderung an der Sicherheitskonfiguration nötig,
- kein zweites Repo, kein zweiter Pages-Auftritt, kein DNS-Umbau.

`admin.smejj.com` bleibt als Kurzadresse und leitet auf `smejj.com/admin/`.
Die salad.cloud-Adresse taucht nirgends mehr auf.

## Was das mit der Architekturregel zu tun hat

Der Master Prompt verlangt: *„Alles, was statisch ausgeliefert werden kann,
wird statisch ausgeliefert (GitHub Pages Free). Der Control Server steht nie im
Pfad des normalen Seitenaufrufs."*

Die Konsole besteht ausschließlich aus statischen Dateien, wurde aber bisher
vom Control-Server ausgeliefert — die Regel war verletzt. Mit diesem Schritt
ist sie erfüllt: Der Control-Server beantwortet nur noch API-Aufrufe.

## Umsetzung

**Eine Datei, zwei Orte.** `admin-ui/api.js` leitet die API-Adresse aus der
eigenen Herkunft ab:

- läuft sie auf dem Control-Server → relative Pfade, Sitzungs-Cookie wie bisher;
- läuft sie auf smejj.com → absolute Adresse des Control-Servers plus
  `Authorization: Bearer <token>` aus `localStorage`, genau wie
  `assets/account-sessions.js`.

Damit bleibt der alte Weg als Rückfall funktionsfähig, ohne zweite Codebasis.

| Datei | Änderung |
| --- | --- |
| `control-server/admin-ui/api.js` | Herkunftserkennung, Bearer-Anmeldung |
| `control-server/admin-ui/index.html` | Meta-CSP (Pages setzt keine Kopfzeilen), `connect-src` auf den Control-Server |
| `scripts/deploy/sync_admin_console_pages.mjs` | **neu**: spiegelt `admin-ui/` ins Frontend-Repo, `--pruefen` meldet Abweichungen |
| `public/admin/index.html` | überholte Weiterleitung → Wegweiser auf die neue Quelle |

Frontend-Repo `SmejjCom/smejj-app-frontend`, Commit `185208f`: 16 Dateien
unter `admin/`.

Control-Release `smejj-control-admin-static-2026-08-07`,
sha256 `35b13e385aa905c4803b856f80f3695dd9f7d6809f770dd299702c57dd7a7f82`,
1025 Dateien — damit sind beide Kopien byte-identisch.

## Nachweise

**Vor dem Deploy, lokal gemessen:** Die Konsole von einer fremden Herkunft
(`127.0.0.1:8793`) geladen — sie ruft korrekt
`https://redbean-…salad.cloud/api/admin/me` auf und bekommt **503**: die
CORS-Prüfung weist die unbekannte Herkunft ab, fail-closed wie vorgesehen.
Genau das beweist, dass die Adressableitung greift und der Schutz hält.

**Nach dem Deploy, live im Browser:**

| Prüfung | Ergebnis |
| --- | --- |
| `https://smejj.com/admin/` | Konsole vollständig, **smejjcom · OWNER · Stufe 8 · schreibend** |
| CORS-Vorabfrage (`OPTIONS /api/admin/approvals`) | **204** |
| Live-Daten | 5 Konten, 22 Audit-Einträge, Kette intakt |
| Browser-Fehlerkonsole | leer |
| `https://admin.smejj.com` | **302 → `https://smejj.com/admin/`** |
| `https://smejj.com/` | 200 — unverändert |
| Spiegel-Prüfung `--pruefen` | 16 Dateien, 0 Abweichungen |
| Salad-Version | 154, 91 Variablen unverändert |

## Zwei Fallen aus dieser Runde

1. **Spaceships Weiterleitungsfeld speichert still nicht.** Zwei Versuche über
   die Oberfläche (Tastatur und `form_input` + Klick auf „Update") hinterließen
   den alten Wert; erst ein Klick direkt auf das Knopf-Element hat gespeichert.
   Wer dort etwas ändert, muss danach **die echte Weiterleitung messen**
   (`curl -o /dev/null -w "%{redirect_url}"`), nicht dem Formular glauben.
2. **Ein getipptes `/` löst Spaceships globale Suche aus**, wenn das Eingabefeld
   keinen Fokus hat — die halbe URL landet dann im Suchfenster statt im Feld.

## Rücknahme

- Frontend: `admin/` im Repo `smejj-app-frontend` entfernen — dann greift wieder
  die 404-Seite; die Konsole bleibt über den Control-Server erreichbar.
- Control-Server: Zeiger zurück auf `smejj-control-admin-dialoge-2026-08-07.tar.gz`
  / `8afdd82b4a910e906ca2260aff267cb80b425a5d8cc2d6108f04a27d9708c82e`.
- Weiterleitung: Ziel der Subdomain wieder auf die Control-Server-Adresse setzen.
