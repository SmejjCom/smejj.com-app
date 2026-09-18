# Mit Apple anmelden — Einrichtung (Stand 19.09.2026)

Der Code ist fertig und getestet (`tests/apple-auth.test.mjs`). Er bleibt **unsichtbar und
wirkungslos**, bis die vier Umgebungsvariablen auf dem Control-Server gesetzt sind:
`/api/auth/config` meldet `methods.apple: false`, der Knopf bleibt versteckt, die Routen
antworten 503. Es kann also nichts kaputtgehen, wenn vorher ausgeliefert wird.

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

1. **App-ID**: Identifiers → die App-ID der iOS-App öffnen → Capability **Sign in with Apple**
   aktivieren → Save. (Für den App-Store-Eintrag wird das ohnehin verlangt, Regel 4.8.)
2. **Services-ID** (das ist der „Client-ID" fürs Web): Identifiers → **+** → *Services IDs* →
   Beschreibung „smejj web", Kennung z. B. `com.smejj.web` → Register. Danach öffnen →
   **Sign in with Apple** aktivieren → *Configure*:
   - Primary App ID: die App-ID aus Schritt 1
   - Domains: `api.smejj.com`
   - Return URLs: `https://api.smejj.com/api/auth/apple/callback`
   - Save → Continue → Save.
3. **Schlüssel**: Keys → **+** → Name „smejj web login", **Sign in with Apple** anhaken →
   Configure → Primary App ID aus Schritt 1 → Save → Continue → Register →
   **`.p8` herunterladen (nur EINMAL möglich!)** und die **Key-ID** notieren.

## Auf Zeabur (Control-Server), vier Variablen

| Variable | Wert |
|---|---|
| `SMEJJ_APPLE_LOGIN_SERVICES_ID` | die Services-ID, z. B. `com.smejj.web` |
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
