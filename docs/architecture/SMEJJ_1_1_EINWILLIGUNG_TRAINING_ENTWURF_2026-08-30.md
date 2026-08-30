# smejj 1.1 — Einwilligung Trainingsdatennutzung (ENTWURF)

Status: **Entwurf** — erst nach schriftlicher Freigabe des Betreibers in der
PWA einbauen. Bis dahin gilt: keine Erhebung, kein Training mit Nutzerdaten.  
Stand: 2026-08-30  
Rahmen: `docs/architecture/SMEJJ_1_0_TRAINING_DATA_POLICY.md` (verbindlich),
`docs/architecture/SMEJJ_1_1_DATENSATZ_PLAN_2026-08-30.md`

## Textvorschlag für die PWA (Deutsch, kurze Form)

---

**Hilf mit, smejj besser zu machen**

Du kannst freiwillig erlauben, dass deine Fragen und unsere Antworten genutzt
werden, um unser eigenes KI-Modell (smejj) zu trainieren.

- **Was wir nutzen:** deine gestellten Fragen und die von smejj gegebenen
  Antworten — und nur diese Inhalte.
- **Was wir entfernen:** Namen, E-Mail-Adressen, Telefonnummern und andere
  erkennbare Angaben werden vor der Speicherung automatisch entfernt. Im
  Training steckt danach niemand Identifizierbares.
- **Wofür:** ausschließlich das Training unseres eigenen Modells. Keine
  Weitergabe an andere Firmen, kein Verkauf, keine Werbung.
- **Deine Kontrolle:** Du kannst diese Erlaubnis jederzeit in den
  Einstellungen widerrufen. Bereits für das Training aufbereitete Datenzeilen
  sind technisch nicht mehr einzeln zuordenbar; nach deinem Widerruf werden sie
  nicht in künftige Trainingsläufe übernommen.
- **Ohne Erlaubnis:** smejj funktioniert komplett normal. Deine Daten werden
  dann nie für Training genutzt.

[ ] Ja, meine Fragen dürfen smejj trainieren (jederzeit widerrufbar)

---

## Umsetzungshinweise (für den Einbau, nicht Teil des Textes)

1. **Technische Bindung:** Die Einwilligung läuft über das bestehende
   Einwilligungsmodul (`src/training/consent.js`) mit dem festen
   Geltungsbereich `TRAINING_CONSENT_REPOSITORY = "smejjcom/smejj-app"`
   (constants.js). Die Oberfläche baut nichts eigenes — der Endpunkt
   `/api/training/consent/notice` nennt den Geltungsbereich.
2. **Schlüsselbindung:** Der Text bekommt eine `privacyNoticeSha256`; wird der
   Text später geändert, gelten alte Einwilligungen weiter nur für den alten
   Textstand (so prüft es `consent.js` ohnehin).
3. **Widerruf:** über `createConsentRevocation` (existiert); widerrufene
   Konten fließen in KEINEN künftigen Bau ein — das Bau-Werkzeug liest die
   Einwilligungsreferenz je Paar (`einwilligung`-Feld im Quellenpaket).
4. **Platzierung:** Einstellungen (neuer Abschnitt „Modelltraining") plus
   einmalige, dezent nachgestellte Frage im Chat — nie blockierend, nie als
   dunkles Muster (Einwilligung muss freiwillig sein).
5. **Vor Live-Gang:** Betreiber-Freigabe des Textes + rechtliche Kurzsichtung
   (DSGVO Art. 6(1)(a), Art. 7 Widerruf, Art. 13 Informationspflichten).

## Offen (Betreiber)

- Text-Schlussfassung freigeben (oder Änderungswünsche nennen).
- Platzierung bestätigen (Einstellungen + dezente Chat-Frage).
