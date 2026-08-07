# Freigabe: Step-up per Passkey (2026-08-07)

## Wortlaut des Betreibers

> **„mach Passkey"**

auf die Empfehlung:

> **Passkey statt Mail-Code** für die Sicherheitsbestätigung — jetzt technisch
> möglich, weil die Konsole auf smejj.com liegt und damit dieselbe Domain wie
> deine Passkeys hat. Kein Postfach mehr nötig, ein Fingerabdruck genügt.

Deckt die Änderungen an `stepUp.js`, `adminWriteRoutes.js` und `admin-ui/api.js`
(alle unter `admin lock v1`). Lock danach mit demselben Wortlaut neu eingefroren
— jetzt **14** Dateien, `stepUpPasskey.js` kam dazu.

## Warum das erst jetzt geht

Passkeys sind an die Domain gebunden (rpId `smejj.com`). Solange die Konsole
vom Control-Server unter `*.salad.cloud` ausgeliefert wurde, war der Passkey
des Betreibers dort schlicht nicht ansprechbar. Seit dem Umzug auf
`smejj.com/admin` (Freigabe „mach das", 2026-08-07) ist es dieselbe Domain.

**Was er besser kann als der Mail-Code:** Er beweist Besitz des Geräts *plus*
Biometrie. Er ist nicht abtippbar, nicht weiterleitbar, nicht abfischbar — wer
Zugriff auf das Postfach hat, kommt damit nicht weiter. Der Mail-Code bleibt
als Rückfall: Wer gerade kein Gerät mit Passkey zur Hand hat, darf nicht
ausgesperrt sein.

## Drei Festlegungen, die den Schutz tragen

1. **Eigener Challenge-Typ** (`admin-step-up`). Eine Anmelde-Challenge darf
   niemals als Step-up durchgehen — sonst öffnet ein normaler Login nebenbei
   das Schreibfenster. Als Test festgehalten.
2. **Bindung an das handelnde Konto.** Die Kennung kommt aus der Sitzung, nie
   aus der Antwort des Browsers. `userHandle` ist Fremddaten; wer ihn glaubt,
   lässt jeden fremden Passkey zu.
3. **Ehrliche Abweisung ohne Passkey** (409 `step_up_kein_passkey`), kein
   stiller Rückfall auf „erlaubt". Die Oberfläche bietet dann den Mail-Code an.

Zusätzlich: `userVerification: "required"` — beim Step-up ist Biometrie/PIN der
Sinn der Sache, nicht nur ein Wunsch. Fehlversuche melden sich bei der
Sicherheitswache wie falsche Codes.

## Der Fehler, der vor dem Ausrollen gefunden wurde

Die erste Fassung suchte die Passkeys unter `userIdFor(email)`. Beim Einrichten
nimmt `registrationPrincipal` in `passkeyRoutes.js` aber die **userId aus der
Sitzung**, sofern eine da ist — und E-Mail-Konten haben eine (beim Betreiber
`u_hQyEWTjvzWUyjFyU`).

Ergebnis wäre gewesen: Der Betreiber richtet einen Passkey ein, und der Step-up
findet ihn **nie**. Kein Fehler, keine Meldung — er bekäme still für immer den
Mail-Code und hätte keinen Anhaltspunkt, warum.

Behoben: Beide Kennungen desselben Kontos werden durchsucht und beim Prüfen
akzeptiert; fremde weiterhin nicht. Zwei Testfälle halten das fest.

## Umfang

Basis: laufendes Live-Artefakt (Salad 158 → gebaut, dann 160 → korrigiert 161).

| Datei | Änderung |
| --- | --- |
| `control-server/src/admin/stepUpPasskey.js` | **neu** — die Zeremonie |
| `control-server/src/admin/stepUpPasskey.test.js` | **neu** — 12 Tests |
| `control-server/src/admin/stepUp.js` | `oeffneFenster()` für Nachweise ohne Mail-Code |
| `control-server/src/routes/adminWriteRoutes.js` | zwei schlanke Routen |
| `control-server/src/routes/passkeyRoutes.js` | `userIdFor` exportiert (eine Quelle für beide Wege) |
| `control-server/admin-ui/api.js` | Passkey zuerst, Mail-Code als Rückfall |

- Release: `smejj-control-passkey-kontoid-2026-08-07`,
  sha256 `d163d8546b916e8dac2a990f6a10f4fddd01c4f3e3dfcbdf8a5d9028119d7574`,
  1068 Dateien, `secretsIncluded: false`, **Salad-Version 161**, 92 Variablen.
- Frontend: `smejj-app-frontend` Commit `ee8ce05`.

## Nachweise

- 438/439 Tests grün im entpackten Release-Baum (der eine Fehlschlag ist der
  vorbestehende zeitabhängige `opsExperimente`-Test).
- `diff -rq` gegen Live: genau die geänderten Dateien + Manifest.
- **Live gegen die Produktion:**
  `POST /api/admin/step-up/passkey/options` → **409 `step_up_kein_passkey`**
  (korrekt: für das Konto ist noch kein Passkey hinterlegt);
  `verify` mit gefälschtem Token → **400 `step_up_challenge_ungueltig`**;
  Schreibaktion ohne Fenster → **403 `admin_step_up_required`**.
- Alle vier Sperren grün, 13/13 Sperren-Tests.

## Was der Betreiber noch tun muss

Einen Passkey einrichten: **smejj.com → Profil → „Anmeldung & Sicherheit" →
„Passkey einrichten"**. Danach greift der Passkey-Weg automatisch; bis dahin
läuft die Bestätigung weiter über den Mail-Code.

## Ein Betriebsbefund nebenbei

Die Salad-API antwortete zweimal mit **504**, obwohl der `PATCH` angekommen
war. Wer daraufhin blind wiederholt, hält einen erfolgreichen Deploy für
gescheitert. **Merkregel:** nach einem 504 den Zeiger LESEN, nicht raten.

## Rücknahme

Zeiger zurück auf `smejj-control-support-liste-2026-08-07.tar.gz` (Stand vor
diesem Vorhaben). Der Passkey-Weg ist rein additiv — der Mail-Code
funktioniert unabhängig davon weiter.
