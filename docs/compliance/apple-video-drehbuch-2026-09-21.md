# Drehbuch für das Apple-Video (21.09.2026)

Apple hat die App nach Richtlinie 2.1 abgelehnt und **ein Bildschirmvideo von
einem ECHTEN iPhone** verlangt (kein Simulator). Alles andere ist von unserer
Seite erledigt und in App Store Connect gespeichert — es fehlt nur dieses Video.

**Dauer: rund 2 Minuten. Querformat nicht nötig, Hochformat ist richtig.**

## Vorbereitung (einmal)

1. iPhone: **Einstellungen → Kontrollzentrum → Bildschirmaufnahme** hinzufügen,
   falls noch nicht da.
2. Die App installieren, die Apple prüft — also die **TestFlight-Fassung**
   (Build 1.0 (1)), nicht das Webclip-Symbol vom Home-Bildschirm. Wenn
   TestFlight die App nicht zeigt, sag mir Bescheid, dann richte ich die interne
   Testgruppe ein.
3. **Mikrofon aus** ist in Ordnung — Apple braucht keinen Ton. Wenn du sprechen
   willst, sprich Englisch.

## Ablauf — in genau dieser Reihenfolge filmen

1. **Start vom Home-Bildschirm.** Erst den Home-Bildschirm zeigen, dann das
   App-Symbol antippen. Apple verlangt ausdrücklich, dass die Aufnahme mit dem
   Starten der App beginnt.
2. **Erste Frage ohne Konto.** Auf der Startseite ins Feld „Ask me anything"
   tippen, etwas Englisches eingeben, zum Beispiel
   `What is the capital of Portugal?` → Pfeil antippen → warten, bis die
   Antwort dasteht. (Das ist neu seit heute: die erste Frage geht ohne Konto.)
3. **Weiter in die App.** Auf „Sign up free" tippen und die Anmeldewege zeigen
   (Google, GitHub, Passkey, E-Mail-Link) — dann mit **Google** anmelden.
4. **Normaler Ablauf.** Eine zweite Frage stellen, die Antwort abwarten.
5. **Bild erzeugen.** `draw me a red bicycle` eingeben, warten, bis das Bild da
   ist. (Dauert bis zu einer Minute — bitte trotzdem dranbleiben, Apple will
   sehen, dass es wirklich funktioniert.)
6. **Inhalt melden — das ist Apple besonders wichtig.** Beim Bild oder bei einer
   Antwort auf die drei Punkte „…" tippen → **„Report content"** → den Dialog
   zeigen → eine Auswahl treffen und abschicken → die Bestätigung zeigen.
7. **Konto-Bereich.** Menü → Konto öffnen. Dort einmal langsam durchscrollen,
   bis **„Delete account"** im Bild war. **Nicht antippen** — dein Konto soll
   bleiben. Es reicht, dass Apple die Schaltfläche sieht.
8. **Abmelden.** Auf „Abmelden"/„Sign out" tippen, damit Apple sieht, dass der
   Weg zurück auch funktioniert. Danach Aufnahme stoppen.

## Danach

Schick mir die Videodatei (oder leg sie auf den Schreibtisch und sag mir den
Namen). Ich hänge sie in App Store Connect an die Antwort an die App-Prüfung,
schicke die Antwort mit allen sechs geforderten Punkten ab und reiche die
Version neu ein.

## Was ich schon erledigt habe

* **Zugang ohne Konto gebaut und live** (SW v933): Die erste Frage wird direkt
  auf der Startseite beantwortet. Damit braucht der Prüfer keine Zugangsdaten —
  das war der eigentliche Stolperstein, denn unsere Anmeldung ist passwortlos,
  ein Demo-Passwort kann es gar nicht geben.
* **„Anmeldung erforderlich" in App Store Connect abgeschaltet** und die nicht
  funktionierenden Demo-Zugangsdaten entfernt.
* **Anmerkungen für die App-Prüfung neu geschrieben** (3.045 Zeichen): Zweck und
  Zielgruppe, Weg zu jeder Hauptfunktion, alle externen Dienste (Z.ai, Moonshot,
  Groq, eigenes Modell, Google/GitHub/Passkey/SMTP, IDrive e2, GitHub Pages,
  Zeabur), keine regionalen Unterschiede, keine regulierte Branche, keine
  In-App-Käufe.
* **Konto geprüft**: Datenschutz-Angaben veröffentlicht, Datenschutz-URL
  erreichbar, Altersfreigabe gesetzt, Screenshots vorhanden (iPhone 4, iPad 2),
  Build 1.0 (1) hängt an der Version, Support- und Marketing-URL erreichbar.

## Ein offener Punkt, den du kennen solltest

Konten, die über **Google, GitHub oder Passkey** entstanden sind, lassen sich
in der App **nicht selbst löschen** — die Löschung verlangt heute ein Passwort,
und diese Anmeldewege haben keins. Apple verlangt in Richtlinie 5.1.1(v), dass
eine Kontolöschung in der App startbar ist. In den Anmerkungen steht darum
ehrlich, dass diese Löschung per E-Mail an den Support läuft. Das kann beim
nächsten Mal ein Ablehnungsgrund werden. Der Umbau ist klein (der Server
verlangt dann statt des Passworts nur noch die getippte Bestätigung), betrifft
aber das Löschen echter Nutzerdaten — dafür will ich deine ausdrückliche
Freigabe, bevor ich ihn mache.
