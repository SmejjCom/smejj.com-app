# Android-Bundle neu bauen — Vorbereitung vom 21.09.2026

## Warum überhaupt ein neuer Build

Zwei Punkte im Play-Konto hängen an einem **neuen App-Bundle**, und nur daran:

1. **Pre-Launch-Bericht.** Er entsteht beim *Hochladen* eines Artefakts, nicht dadurch,
   in welchem Track es liegt. Am 21.09. wurde Release 1 in den geschlossenen Test „Alpha"
   hochgestuft (Einreichung Nr. 11, veröffentlicht) — die Berichtsseite blieb trotzdem
   leer. Der Bundle-Explorer zeigt warum: es gibt genau **ein** Bundle, hochgeladen am
   **04.09.2026 22:53**. Ein bereits verarbeitetes Bundle in einen anderen Track zu
   schieben löst keinen neuen Lauf aus.
2. **Play Integrity (0 von 7).** Hier reicht ein neuer Build *nicht*. Die sieben Dienste
   sind Antworten der Play-Integrity-API, die die App selbst abrufen und auswerten muss.
   Eine TWA tut das nicht; dafür bräuchte es echten Android-Code statt des generierten
   Gerüsts. Der Build ist nur die Voraussetzung, nicht die Lösung.

Die „0 von 4" bei **Play Billing-Schutz** bleiben gegenstandslos: alle vier Dienste
schützen Käufe, und die App hat weder In-App-Käufe noch Play Billing.

## Die harten Zahlen

| Was | Wert |
|---|---|
| Paketname | `com.smejj.app` |
| Vorhandenes Bundle | Versionscode **1**, Name `1.0.0.0`, hochgeladen 04.09.2026 22:53 |
| Nächster Versionscode | **2** (1 ist vergeben und lässt sich nie wiederverwenden) |
| Ziel-SDK / Mindest-API | 36 / 23 |
| Web-Manifest | `https://smejj.com/manifest.webmanifest` |
| Upload-Schlüssel (Fingerabdruck) | `E5:E9:14:A5:A0:74:C8:F7:AB:73:38:C8:1C:41:EB:B0:C5:C6:79:9B:D2:39:69:8C:4D:9E:33:2A:55:0A:75:D6` |
| Play-Signaturschlüssel | `03:AC:EB:C6:B6:8F:9E:83:8C:DD:3B:97:F4:47:C4:66:10:36:B8:86:FF:C6:43:B8:AD:D5:75:DA:68:C7:6E:2B` |
| Gerüst | Bubblewrap/PWABuilder-TWA mit `com.google.androidbrowserhelper` |

Beide Fingerabdrücke stehen bereits in `https://smejj.com/.well-known/assetlinks.json`,
die Deeplinks sind in der Konsole grün („Alle Links funktionieren").

**Der Upload-Schlüssel ist der Engpass:** Google nimmt nur Bundles an, die mit genau
diesem Schlüssel signiert sind. Er liegt im PWABuilder-Paket
`~/Downloads/smejj.com - Google Play package.zip` (`signing.keystore` plus
`signing-key-info.txt` mit Alias und Passwörtern). Geht er verloren, ist ein Upload nur
noch über den Google-Support möglich — deshalb gehört er gesichert, nicht ins Repo.

## Warum der Bau in der Cloud läuft und nicht auf dem Mac

Auf dem Betreiber-Mac ist **keine Java-Laufzeit** installiert (`java -version` findet
nichts), und Bubblewrap braucht JDK plus Android-SDK. Beides dort nachzuinstallieren wäre
ein dauerhafter Fußabdruck auf einem Gerät, das ausdrücklich tabu ist. Der GitHub-Läufer
bringt beides mit und ist beim öffentlichen Repo kostenfrei.

## Der Weg in drei Schritten

### 1. Schlüssel vorbereiten (einmalig, auf dem Mac)

Doppelklick auf **„smejj.com Android-Schluessel vorbereiten.command"**. Das Skript

- holt `signing.keystore` und `signing-key-info.txt` aus dem Downloads-Paket,
- legt sie unter `~/smejj-android-schluessel` mit Rechten 700/600 ab,
- schreibt die base64-Fassung des Schlüssels in die Zwischenablage,
- öffnet den Ordner im Finder.

Die **Passwörter fasst das Skript nicht an** — sie stehen in `signing-key-info.txt` und
werden vom Betreiber selbst abgelesen und selbst eingetragen.

### 2. Vier Secrets bei GitHub anlegen (einmalig)

https://github.com/SmejjCom/smejj.com-app/settings/secrets/actions

| Secret | Inhalt |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | aus der Zwischenablage einfügen |
| `ANDROID_KEY_ALIAS` | Alias aus `signing-key-info.txt` |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore-Passwort aus derselben Datei |
| `ANDROID_KEY_PASSWORD` | Schlüssel-Passwort aus derselben Datei |

### 3. Bauen

Actions → **„Android-Bundle bauen"** → *Run workflow*, Versionscode `2` stehen lassen.

Der Lauf installiert JDK 17, Android-SDK und Bubblewrap, setzt Alias und Versionscode in
`android/twa-manifest.json`, baut und signiert, und hängt `app-release-bundle.aab` sowie
`app-release-signed.apk` als Artefakt an den Lauf (14 Tage abrufbar).

**Der Lauf lädt nichts zu Google hoch.** Das ist Absicht: das Bundle soll erst auf einem
Gerät gegen die laufende App gehalten werden.

## Vor dem Hochladen prüfen

Der Workflow vergleicht den Fingerabdruck des Baus selbst mit den Live-Assetlinks und
warnt, wenn er nicht passt. Zusätzlich vor dem Upload:

1. `app-release-signed.apk` auf einem Android-Gerät installieren und starten.
2. Öffnet die App **ohne Browserleiste**? Dann stimmen Signatur und Assetlinks.
3. Startbild, App-Name, die drei Verknüpfungen (Neuer Chat, Sprachmodus, Programmieren)
   und die Benachrichtigungs-Abfrage gegen die installierte Fassung halten.
4. Erst dann in der Play Console hochladen — sinnvollerweise **zuerst in den internen
   Test**, damit der Pre-Launch-Bericht entsteht, bevor Produktion angefasst wird.

## Was an `android/twa-manifest.json` unsicher ist

Die Datei ist aus dem Live-Web-Manifest, dem entpackten APK vom 04.09. und den Zahlen der
Play Console rekonstruiert — das Original von PWABuilder lag nicht bei. Paketname,
Versionscode und Signatur stimmen sicher; bei Kosmetik (Startbild-Dauer, Farben der
Navigationsleiste, Ausrichtung) kann der neue Build minimal abweichen. Genau dafür ist
Schritt 2 der Prüfung da. Wer es exakt will, baut stattdessen erneut über
pwabuilder.com und lädt dort denselben `signing.keystore` hoch.
