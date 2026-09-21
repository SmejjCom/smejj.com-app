# Apple: was zwischen uns und der Freigabe steht (Stand 21.09.2026)

Nach der Ablehnung nach Richtlinie 2.1 habe ich nicht nur den geforderten Punkt
abgearbeitet, sondern die Liste der Ablehnungsrisiken aus dem 19.09. noch einmal
Stück für Stück nachgemessen. Hier steht, was davon erledigt ist und was nicht.

## Erledigt

**5.1.1(v) — Kontolöschung in der App.** Google-, GitHub- und Passkey-Konten
konnten sich nicht selbst löschen; der Server verlangte ein Passwort, das es bei
diesen Anmeldewegen gar nicht gibt. Gebaut, ausgeliefert (SW v936) und am echten
Google-Konto im Browser nachgemessen: Formular ohne Passwortfeld, Bestätigungswort
„DELETE ACCOUNT". Eine Parallelsitzung hat denselben Weg per Fingertipp auf einem
Android-Gerät bestätigt. Der Satz in den Anmerkungen für die App-Prüfung ist
umgeschrieben.

**3.1.1 — In-App-Kauf.** Der Konto-Bereich „Mein Plan" zeigte drei Abos mit Preis
und „Zahlungspflichtig abonnieren" mit Weiterleitung zu Stripe. Das ist in einer
iOS-App verboten, und es widersprach unseren eigenen Anmerkungen („no in-app
purchases, no subscriptions"). Nach Freigabe des Betreibers ist der Kauf-Teil in
der iOS-Hülle ausgeblendet; im Web ändert sich nichts. Wartet auf die Auslieferung
von v937.

**Deutsche Texte in der englischen App.** Der Reste-Zähler der Parallelsitzung
misst 0 in Hülle und 14 Ansichten; der Konto-Bereich (Sitzungen, Passwortwechsel,
Server-Export, Löschweg) ist mit v937 ebenfalls übersetzt.

## Offen — und was fehlt

**Build 2 ist gebaut, aber nicht hochgeladen.** Apple prüft gerade **Build 1**.
Dem fehlen `NSMicrophoneUsageDescription` und `NSCameraUsageDescription`: Tippt
ein Prüfer auf den Sprachmodus, bricht iOS den Zugriff ab — das ist Richtlinie
2.1 „Bugs and crashes". Build 2 (1.0 (2)) liegt fertig signiert und validiert als
`~/smejj-ios/build2/export/App.ipa`, mit beiden Texten, `NSPhotoLibraryAdd…`,
`ITSAppUsesNonExemptEncryption=false` und 15 Sprachen in `CFBundleLocalizations`.
Der Upload läuft über `xcrun altool --upload-app`, den der Auto-Modus als
Produktions-Auslieferung sperrt — **Doppelklick**
`~/smejj-ios/smejj.com iOS Build 2 zu Apple hochladen.command`, danach Build 2 in
App Store Connect der Version 1.0 zuordnen.

**4.8 — „Mit Apple anmelden" fehlt.** Wer Google- und GitHub-Anmeldung anbietet,
muss auch Apple anbieten. Gebaut ist es; der Knopf bleibt aber korrekt versteckt,
weil der Server `apple: false` meldet (nachgemessen an `/api/auth/config`) — es
gibt also keinen toten Knopf, aber eben auch keinen Weg. Was fehlt, kann nur der
Betreiber liefern: im Apple-Entwicklerportal eine Services-ID und einen
`.p8`-Schlüssel anlegen, danach vier Variablen bei Zeabur eintragen. Anleitung:
`docs/auth/APPLE_LOGIN_EINRICHTUNG_2026-09-19.md`.

**Das Video vom echten iPhone.** Apples eigentliche Forderung aus 2.1. Drehbuch:
`docs/compliance/apple-video-drehbuch-2026-09-21.md`. TestFlight ist dafür
eingerichtet (Gruppe „Intern", Build 1.0 (1) bereit) — sobald Build 2 oben ist,
besser den neueren Build filmen.

## Reihenfolge, die ich empfehle

1. v937 ausliefern (Doppelklick, siehe `smejj.com Konto-Bereich uebersetzen ausliefern.command`).
2. Build 2 hochladen (Doppelklick) und der Version 1.0 zuordnen.
3. Video mit Build 2 drehen.
4. Antwort an die App-Prüfung mit Video und den sechs Punkten, dann neu einreichen.

4.8 bleibt danach das letzte bekannte Risiko. Es kann durchgehen — Apple beanstandet
es nicht immer sofort —, aber es ist der wahrscheinlichste Grund für eine zweite
Runde.
