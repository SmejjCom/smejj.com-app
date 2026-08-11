# Plan: Bild-Verstehen + Bild-Generierung im Chat (2026-08-11)

Ausgangslage (A-Z-Check 2026-08-11, live nachgemessen): smejj.com kann weder
Bilder erzeugen noch hochgeladene Bilder verstehen. Der "Foto oder Bild"-Knopf
im Composer fuegt nur die Textzeile `[Bild: name.jpg (X KB)]` ein — das Modell
sieht den Bildinhalt nie (`hardenMessages` in public/chat-bridge.js verwirft
alles, was kein String-content ist). Der Markdown-Sanitizer kennt kein `<img>`,
Bild-Antworten koennten also gar nicht angezeigt werden. Auf "Erstelle mir ein
Bild" antwortet die App live: "Das ist leider nicht moeglich."

Ziel: Gleichstand mit ChatGPT/Gemini bei den Multimodal-Basics, in drei Stufen
nach Aufwand/Kosten sortiert.

---

## Stufe 1 — Bild-VERSTEHEN (schnellster Gewinn, keine neuen Fixkosten)

Anbieter: **Groq** — Schluessel ist bereits in der Bruecke vorhanden, kein
neuer Dienst noetig. Vision-Modelle: Llama 4 Scout / Maverick (Preview),
Bild-Eingabe bis 20 MB, ca. 0,11 / 0,34 USD je 1M Token (Scout).

Arbeitsschritte:
1. `public/composer-plus-menu.js` (`bindAttachInput`): Foto-Anhang als
   base64-JPEG lesen, clientseitig auf max. ~1568 px Kante herunterskalieren,
   statt der Textzeile eine echte Bild-Nachricht in den Verlauf legen.
2. `public/chat-bridge.js`: `hardenMessages` um content-Arrays erweitern
   (`[{type:"text"...},{type:"image_url"...}]`), und wenn ein Bild anliegt auf
   ein Vision-Modell routen. **ACHTUNG: chat-bridge.js ist SECURITY-LOCKED**
   -> Betreiber-Freigabe + Lock-Neufreeze; Deploy = Buendel ins Frontend-Repo
   + Bruecken-NEUSTART (Container laedt Code beim Start von raw.github).
3. Kostendeckel: 1 Bild ≈ 1-2k Eingabe-Token; costGuard/usage-meter mitzaehlen.
4. Verlauf/IndexedDB: Bild-Anhang klein (Thumbnail) persistieren, nicht das
   Original — S3/Speicherpfade haben 2,5-s-Deckel.

Aufwand: 1-2 Sitzungen inkl. Livetest. Risiko: gering (Fallback = heutiges
Verhalten). Groesster Nutzwert pro Aufwand, weil der Knopf schon da ist und
Nutzer heute eine kaputt wirkende Antwort bekommen.

## Stufe 2 — Bild-GENERIERUNG

Anbieter-Empfehlung: **FLUX.1 [schnell]**, guenstigste brauchbare Klasse
(~0,003 USD pro 1024x1024-Bild):
- Together AI: ~0,003 USD/Bild, OpenAI-kompatible API, kein Mindestumsatz
- Fal.ai: 0,003 USD/Megapixel
- Cloudflare Workers AI: flux-1-schnell mit taeglichem Gratis-Kontingent
  (guenstigster Einstieg, aber NEUER Dienst)
- Spaeter optional Premium-Qualitaet (z. B. gpt-image-1) fuer Pro/Max

**POLICY:** Jeder neue kostenpflichtige Dienst braucht die schriftliche
Betreiber-Freigabe mit Dienst + Betrag (Regel aus der Zeabur-Erweiterung gilt
analog). Ohne Freigabe wird nichts aktiviert.

Arbeitsschritte:
1. Neue Route `/api/image` in der Salad-Bruecke (Schluessel bleibt
   serverseitig; gleiches Muster wie der Tavily-Suchschluessel).
2. Ausloesung im Frontend: Absichtserkennung ("erstelle/male/zeichne ein
   Bild ...") plus expliziter Eintrag im Plus-Menue.
3. Anzeige: Bild-Renderer ergaenzen (chat-markdown.js kennt kein `<img>`);
   nur data:-URIs bzw. Antworten der eigenen Bruecke zulassen, keine
   Fremd-URLs (CSP beachten).
4. Abo-Kopplung: z. B. Free 3 Bilder/Tag, Plus 50/Monat, Pro/Max mehr —
   usage-meter + costGuard erweitern. Beispielrechnung: 1000 Nutzer x
   5 Bilder/Monat x 0,003 USD = **15 USD/Monat**.
5. Speicherung: erzeugte Bilder in den e2-Eimer (timeoutMs setzen!) oder nur
   fluechtig als data:-URI im Verlauf.

Aufwand: 2-3 Sitzungen (Bruecke + Frontend + Limits + Livetest).

## Stufe 3 — VIDEO (empfohlen: verschieben)

Text-zu-Video ist 2 Groessenordnungen teurer (ca. 0,05-0,5 USD pro Sekunde
bei Runway/Luma/Kling) und fuer den Werbestart nicht noetig. Wenn spaeter:
nur hinter Pro/Max mit hartem Kontingent. Kein Schritt vor Stufe 1+2.

---

Empfohlene Reihenfolge: Stufe 1 -> Stufe 2 -> (Werbestart) -> Stufe 3.
Vor dem Werbestart unabhaengig davon offen: Stripe-Livemodus, EU-Vertreter,
MwSt, Anwalt, Control-Abstuerze vom 2026-08-11.
