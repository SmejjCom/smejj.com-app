# Drehbuch für das Apple-Video (21.09.2026)

Apple hat die App nach Richtlinie 2.1 abgelehnt und **ein Bildschirmvideo von
einem ECHTEN iPhone** verlangt (kein Simulator). Alles andere ist von unserer
Seite erledigt und in App Store Connect gespeichert — es fehlt nur dieses Video.

**Dauer: rund 2 Minuten. Querformat nicht nötig, Hochformat ist richtig.**

## Vorbereitung (einmal)

1. iPhone: **Einstellungen → Kontrollzentrum → Bildschirmaufnahme** hinzufügen,
   falls noch nicht da.
2. Die App installieren, die Apple prüft — also die **TestFlight-Fassung
   Build 1.0 (2)**, nicht das Webclip-Symbol vom Home-Bildschirm und **nicht
   Build 1**. Build 1 fehlt die Mikrofon-Beschreibung; tippst du dort auf den
   Sprachmodus, bricht iOS ab.
   **Alles eingerichtet (21.09.):** interne TestFlight-Gruppe „Intern",
   smejjcom@gmail.com als Tester eingeladen, Build 2 hochgeladen und der
   Version 1.0 in App Store Connect zugeordnet. TestFlight-App öffnen,
   Einladung annehmen, „smejj" installieren — und oben prüfen, dass dort
   **(2)** steht.
3. **Mikrofon aus** ist in Ordnung — Apple braucht keinen Ton. Wenn du sprechen
   willst, sprich Englisch.

## Ablauf — in genau dieser Reihenfolge filmen

1. **Start vom Home-Bildschirm.** Erst den Home-Bildschirm zeigen, dann das
   App-Symbol antippen. Apple verlangt ausdrücklich, dass die Aufnahme mit dem
   Starten der App beginnt. **Danach 2–3 Sekunden warten, bevor du etwas
   antippst** — direkt nach dem Start lädt die App ihre neue Fassung, und der
   allererste Tipp kann ins Leere gehen (am Gerät gemessen). Im Video sähe das
   aus wie ein Fehler.
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
7. **Konto-Bereich — hier hat sich heute etwas geändert.** Menü → „My account"
   → **„My data"**. Achtung, am Handy ist das fummelig: „My data" ist der
   **letzte von neun Reitern**, die Reiterleiste muss man erst dorthin
   schieben. Mach das im Video langsam und sichtbar — Apple soll sehen, dass
   der Weg existiert, nicht raten müssen.
   Dort bis **„Delete account"** scrollen und den Knopf
   **antippen**: das Formular geht auf und zeigt „Type to confirm: DELETE
   ACCOUNT". Bei einem Google-Konto steht dort **kein Passwortfeld mehr** —
   genau das verlangt Apple in Richtlinie 5.1.1(v). Kurz stehen lassen, damit
   es im Bild ist, dann **„Cancel"** antippen. **Nichts eintippen, nicht
   abschicken** — dein Konto soll bleiben.
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
* **TestFlight eingerichtet** (21.09.): interne Gruppe „Intern", du bist als
  Tester eingeladen. **Build 2 ist hochgeladen und der Version 1.0 zugeordnet**
  — er bringt die Mikrofon-, Kamera- und Fotomediathek-Texte mit, die Build 1
  fehlten (ohne sie bricht der Sprachmodus am Gerät ab: Richtlinie 2.1).
* **Keine Preise mehr in der App** (21.09., SW v937): Der Konto-Reiter „My plan"
  zeigte drei Abos mit Preis und einen Knopf zu Stripe — in einer iOS-App nach
  Richtlinie 3.1.1 verboten. In der App steht dort jetzt nur noch, dass das
  Konto kostenlos ist. Im Video ruhig kurz zeigen.
* **Konto-Löschung für JEDEN Anmeldeweg gebaut und live** (21.09., SW v936):
  Google-, GitHub- und Passkey-Konten löschen sich jetzt in der App selbst.
  Am echten Google-Konto im Browser nachgemessen: Formular ohne Passwortfeld,
  Bestätigungswort „DELETE ACCOUNT" auf Englisch. Der Satz in den ASC-Anmerkungen
  ist entsprechend umgeschrieben.

## Der frühere offene Punkt ist erledigt

Bis zum 21.09. ließen sich Konten aus **Google, GitHub oder Passkey** in der App
nicht selbst löschen — die Löschung verlangte ein Passwort, das es bei diesen
Anmeldewegen gar nicht gibt. Das war der wahrscheinlichste nächste
Ablehnungsgrund (Richtlinie 5.1.1(v)). Nach deiner Freigabe ist es gebaut und
live: der Server nimmt bei diesen Wegen die gültige Sitzung plus das getippte
Wort als Nachweis, und das Passwortfeld erscheint nur noch bei E-Mail-Konten.
