# Mit Apple anmelden — Einrichtung (Stand 21.09.2026)

Der Code ist fertig und getestet (`tests/apple-auth.test.mjs`, 19 Proben). Er bleibt
**unsichtbar und wirkungslos**, bis die vier Umgebungsvariablen auf dem Control-Server
gesetzt sind: `/api/auth/config` meldet `methods.apple: false`, der Knopf bleibt versteckt,
die Routen antworten 503. Es kann also nichts kaputtgehen, wenn vorher ausgeliefert wird.

## Stand 21.09.2026 — was erledigt ist

* **Der Server ist ausgeliefert.** Bis zum 21.09. lag der Code nur im Arbeitszweig;
  `https://api.smejj.com/api/auth/apple` antwortete **404**. Jetzt antwortet die Route
  **503 „Apple Login ist noch nicht konfiguriert."** — also: da, wartet auf die Schlüssel.
  Anker `schutz-100-2026-09-21-apple-login-server`.
* **App-ID `com.smejj.app`**: Capability *Sign in with Apple* aktiviert (Schritt 1 unten).
  Nebenwirkung, die Apple beim Speichern nennt: bestehende Provisioning-Profile werden
  ungültig und müssen für **künftige** Builds neu erzeugt werden. Build 2 ist bereits
  signiert und hochgeladen, der ist nicht betroffen.
* **Services-ID `com.smejj.web`** angelegt (Beschreibung „smejj web"), *Sign in with Apple*
  aktiviert, Primary App ID = `443R27FNHX.com.smejj.app`, Domain `api.smejj.com`,
  Return URL `https://api.smejj.com/api/auth/apple/callback` — gespeichert und
  gegengeprüft.

**Es fehlen genau zwei Handgriffe, und beide gehören dir**, weil sie einen geheimen
Schlüssel anfassen: den `.p8`-Schlüssel erzeugen (Schritt 3) und die vier Variablen auf
Zeabur setzen. Einen privaten Schlüssel gebe ich weder in ein Formular ein noch lade ich
ihn herunter.

## Ablauf für Nutzer

1. „Mit Apple fortfahren" auf `/auth/login` oder `/auth/register` (Web, PWA, iOS-App-Webview).
2. Weiterleitung zu appleid.apple.com, Anmeldung dort.
3. Apple sendet ein POST-Formular an `https://api.smejj.com/api/auth/apple/callback`.
4. Server prüft state + id_token (RS256, Aussteller, Zielgruppe, Ablauf, nonce, `email_verified`),
   legt das Konto an bzw. bestätigt die Adresse (`sichereAnbieterKonto`, Rolle bleibt `user`),
   und schickt den Nutzer per Einmal-Ticket zurück in die App.
5. Abbruch oder Fehler → zurück auf `/auth/login?fehler=apple_abgebrochen|apple_fehlgeschlagen|anmeldung_abgelaufen`
   mit lesbarer Meldung (keine nackte JSON-Seite).

## Im Apple-Developer-Portal (Team iMild LLC, Team-ID 443R27FNHX)

Portal: developer.apple.com → Account → Certificates, IDs & Profiles.

1. ~~**App-ID**: Identifiers → die App-ID der iOS-App öffnen → Capability **Sign in with Apple**
   aktivieren → Save.~~ **Am 21.09.2026 erledigt.**
2. ~~**Services-ID**: Identifiers → **+** → *Services IDs* → „smejj web" / `com.smejj.web`
   → Sign in with Apple → Configure mit Domain und Return URL.~~
   **Am 21.09.2026 erledigt** — `com.smejj.web`, Domain `api.smejj.com`, Return URL
   `https://api.smejj.com/api/auth/apple/callback`.
3. **Schlüssel — DEIN Handgriff, offen.** developer.apple.com → Certificates, IDs &
   Profiles → **Keys** → **+** → Name „smejj web login", **Sign in with Apple** anhaken →
   Configure → Primary App ID `smejj (443R27FNHX.com.smejj.app)` → Save → Continue →
   Register → **`.p8` herunterladen (nur EINMAL möglich!)** und die **Key-ID** notieren
   (zehn Zeichen, steht auch im Dateinamen `AuthKey_XXXXXXXXXX.p8`).

## Auf Zeabur (Control-Server), vier Variablen

| Variable | Wert |
|---|---|
| `SMEJJ_APPLE_LOGIN_SERVICES_ID` | `com.smejj.web` (steht fest, am 21.09. angelegt) |
| `SMEJJ_APPLE_LOGIN_TEAM_ID` | `443R27FNHX` |
| `SMEJJ_APPLE_LOGIN_KEY_ID` | Key-ID aus Schritt 3 |
| `SMEJJ_APPLE_LOGIN_PRIVATE_KEY` | Inhalt der `.p8` (PEM mit echten Zeilenumbrüchen, mit `\n` in einer Zeile, oder Base64 der Datei) |

Variablen **nicht über den Roh-Editor löschen/ersetzen** (14.08.: zweimal die Control-Umgebung
verloren) — über den üblichen Deploy-Weg setzen, dann Dienst neu starten.

## Prüfen

```bash
curl -s https://api.smejj.com/api/auth/config | grep -o '"apple":[a-z]*'   # erwartet: "apple":true
```
Dann auf smejj.com/auth/login den Apple-Knopf antippen und einmal komplett durchlaufen.
Ein Konto, das Apple mit „E-Mail verbergen" anlegt, bekommt eine `@privaterelay.appleid.com`-Adresse —
das ist normal und gültig.

## Bewusst so gebaut

- Nonce steckt im signierten State; das id_token muss sie zurückgeben.
- `response_mode=form_post` ist bei Bereichen `name email` Pflicht; deshalb ist **nur** die
  Rückkehr-Route für den Origin `https://appleid.apple.com` zugelassen (`controlAccessPolicy.js`).
- Apple liefert den Namen nur bei der allerersten Anmeldung; ohne Namen wird der Teil vor dem @ genutzt.
- Ein Apple-Konto vergibt sich **nie** selbst Rechte (Rolle `user`, Adminrechte nur über
  `SMEJJ_ADMIN_OWNER_EMAILS` oder den Adminbereich).
