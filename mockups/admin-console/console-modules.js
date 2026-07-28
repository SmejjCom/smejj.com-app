// smejj.com — Operations Console (Mockup): die 26 Module A-Z als reine Daten.
// Getrennt von der Darstellung (console-render.js), damit beide Dateien unter
// der 800-Zeilen-Regel aus AI_Guidelines.md bleiben. Alle Zahlen sind Beispieldaten.
window.adminConsoleModules = [
{id:"A",g:"Überblick",n:"Übersicht",h:"Cockpit",d:"Der ganze Betrieb auf einem Bildschirm — Nutzer, Kosten, Jobs, Dienste. Zehn Sekunden Lesezeit, dann weißt du, ob heute etwas brennt.",
 blocks:[
  {t:"kpis",items:[
    {k:"Aktive Nutzer · 24 h",v:"1.284",d:"↑ 6,2 % gegenüber Vortag",tone:"up",spark:[40,52,44,61,58,72,80]},
    {k:"Kosten heute",v:"0,00 €",d:"Budgetdeckel greift · Free-Guard aktiv",tone:"up",spark:[10,8,12,6,9,7,5]},
    {k:"Laufende Jobs",v:"37",d:"4 in Warteschlange · 0 hängend",spark:[30,45,38,52,60,48,55]},
    {k:"Fehlerquote · 1 h",v:"0,4 %",d:"Schwelle 2,0 % — unauffällig",tone:"up",spark:[22,18,25,14,20,12,10]},
    {k:"Offene Vorgänge",v:"3",d:"1 DSGVO-Auskunft, 2 Missbrauchsmeldungen",tone:"wr",spark:[5,10,8,14,12,18,20]}]},
  {t:"cols2",left:[
    {t:"table",title:"Dienste & Provider",sub:"Live-Ampeln",tools:["Aktualisieren"],
     cols:["Dienst","Status","Latenz p95","Letzter Fehler",""],
     rows:[
      ["!Control-Server","ok:Betriebsbereit","210 ms","dim:vor 6 h","@Details"],
      ["!IDrive e2 (smejj-app)","ok:OK","88 ms","dim:—","@Details"],
      ["!Groq · Welle 2","ok:OK","640 ms","dim:vor 2 h","@Details"],
      ["!zhipu:glm-5.2","ok:OK","1,2 s","dim:—","@Details"],
      ["!Salad · Maus-Engine","warn:Kapazität knapp","2,8 s","warn:vor 14 min","@Details"],
      ["!Stripe Webhooks","ok:OK","140 ms","dim:—","@Details"],
      ["!E-Mail (Magic-Link)","warn:Bounce-Rate 3,1 %","—","warn:vor 40 min","@Details"]]}],
   right:[
    {t:"note",tone:"warn",icon:"▲",h:"Salad-Kapazität unter 20 %",s:"Maus-Engine-Jobs warten im Schnitt 2,8 s auf einen Knoten. Kapazität erhöhen oder Warteschlange drosseln."},
    {t:"rows",title:"Braucht deine Entscheidung",tools:["Alle"],
     items:[
      {ic:"§",t:"DSGVO-Auskunft · m.roth@…",s:"Eingegangen 24.07. · Frist läuft in 4 Tagen",r:"warn:Frist 4 T"},
      {ic:"⚑",t:"Missbrauchsmeldung · Konto #a91f",s:"Token-Ausreißer: 41× Tagesmittel",r:"bad:Prüfen"},
      {ic:"⚑",t:"Registrierungswelle",s:"18 Konten aus einem /24-Netz in 9 Minuten",r:"bad:Prüfen"},
      {ic:"↺",t:"Stripe-Webhook fehlgeschlagen",s:"invoice.payment_failed · 2 Wiederholungen",r:"warn:Erneut"}]},
    {t:"bars",title:"Kosten nach Modell · 7 Tage",items:[
      {l:"zhipu:glm-5.2",v:"0,00 € · 62 %",p:62},{l:"Groq (Welle 2)",v:"0,00 € · 24 %",p:24},
      {l:"Salad Maus-Engine",v:"0,00 € · 11 %",p:11,tone:"wr"},{l:"Premium-TTS",v:"0,00 € · 3 %",p:3}]}]},
 ]},

{id:"B",g:"Menschen",n:"Nutzerverwaltung",h:"Nutzer",d:"Suchen, filtern, Akte öffnen. Jede Aktion verlangt einen Grund und landet im Audit-Log. Voraussetzung: der Nutzer-Index, weil einzelne JSON-Objekte in IDrive e2 nicht auflistbar sind.",
 blocks:[
  {t:"bar",items:["*Alle 1.284","Nicht verifiziert 46","Gesperrt 7","Zahlend 118","Gelöscht 12","!Nutzer einladen","Index neu bauen"]},
  {t:"table",title:"Nutzer",sub:"1.284 Einträge · Index 4 Min alt",tools:["Filter","CSV"],
   cols:["Nutzer","Konto-ID","Plan","Status","Registriert","Sitzungen","Verbrauch 30 T",""],
   rows:[
    ["!Maria Roth<br><span style='color:var(--sm-ink-faint);font-size:11px'>m.roth@example.de</span>","#u_8f31a…","acc:Pro","ok:Aktiv","12.03.2026","3","412 k Token","@Akte|Sitzungen|-Sperren"],
    ["!Tobias Lenz<br><span style='color:var(--sm-ink-faint);font-size:11px'>t.lenz@example.com</span>","#u_2ce90…","dim:Free","warn:Nicht verifiziert","27.07.2026","1","0","@Akte|Verifizieren"],
    ["!K. Ademi<br><span style='color:var(--sm-ink-faint);font-size:11px'>k.ademi@example.org</span>","#u_a91f4…","acc:Pro","bad:Gesperrt","02.01.2026","0","18,4 M Token","@Akte|Entsperren"],
    ["!Sophie Braun<br><span style='color:var(--sm-ink-faint);font-size:11px'>s.braun@example.de</span>","#u_5d77b…","acc:Pro","ok:Aktiv","19.05.2026","2","233 k Token","@Akte|Sitzungen|-Sperren"],
    ["!J. Okonkwo<br><span style='color:var(--sm-ink-faint);font-size:11px'>j.oko@example.net</span>","#u_c410e…","dim:Free","warn:Login gesperrt","08.06.2026","0","61 k Token","@Akte|Entsperren"],
    ["!Anna Vogt<br><span style='color:var(--sm-ink-faint);font-size:11px'>a.vogt@example.de</span>","#u_71baf…","dim:Free","ok:Aktiv","21.07.2026","1","9 k Token","@Akte|Sitzungen"]]},
  {t:"cols2",
   left:[{t:"rows",title:"Akte · Maria Roth",sub:"#u_8f31a…",tools:["Als CSV"],items:[
     {ic:"✓",t:"E-Mail bestätigt",s:"12.03.2026, 09:41 · Magic-Link",r:"ok:OK"},
     {ic:"⚿",t:"Passkey hinterlegt",s:"MacBook Pro · zuletzt 27.07.2026",r:"ok:Aktiv"},
     {ic:"€",t:"Abo Pro",s:"Stripe cus_Q8… · nächste Abbuchung 12.08.2026",r:"ok:Bezahlt"},
     {ic:"⌛",t:"Login-Schutz",s:"0 Fehlversuche · nicht gesperrt",r:"ok:Frei"},
     {ic:"☁",t:"Speicher",s:"2,1 GB · 148 Dateien in IDrive e2",r:"dim:2,1 GB"},
     {ic:"§",t:"Einwilligung Training",s:"Widerrufen am 04.06.2026",r:"warn:Nein"}]}],
   right:[
    {t:"table",title:"Aktive Sitzungen",tools:["Alle widerrufen"],cols:["Gerät","Zuletzt","IP-Region",""],
     rows:[["!macOS · Safari","vor 3 Min","DE-Hessen","@-Widerrufen"],
           ["!iOS 26 · PWA","vor 2 h","DE-Hessen","@-Widerrufen"],
           ["!Windows · Chrome","vor 6 T","AT-Wien","@-Widerrufen"]]},
    {t:"form",title:"Aktion ausführen",sub:"Grund ist Pflicht",fields:[
      {l:"Aktion",v:"Konto sperren",sel:1},
      {l:"Grund",v:"Missbrauchsverdacht — Ticket #4471",hint:"Erscheint unverändert im Audit-Log und in der Nutzerakte."},
      {l:"Zweite Freigabe",v:"erforderlich (Vier-Augen-Prinzip)",sel:1}],
     actions:["!Beantragen","Abbrechen"]}]},
 ]},

{id:"C",g:"Menschen",n:"Rollen & Rechte",h:"Rollen",d:"Sechs Rollen, serverseitig durchgesetzt in einem einzigen Modul. Wer etwas nicht darf, bekommt eine 403 — nicht nur eine ausgeblendete Schaltfläche.",
 blocks:[
  {t:"table",title:"Rollenmatrix",sub:"Fail-closed: nicht erteilt = verboten",tools:["Rolle anlegen"],
   cols:["Berechtigung","Owner","Admin","Support","Finance","Auditor","Readonly"],
   rows:[
    ["!Nutzer sehen","ok:ja","ok:ja","ok:ja","ok:ja","ok:ja","ok:ja"],
    ["!Nutzer sperren","ok:ja","ok:ja","bad:nein","bad:nein","bad:nein","bad:nein"],
    ["!Nutzer löschen","ok:ja","warn:4-Augen","bad:nein","bad:nein","bad:nein","bad:nein"],
    ["!Chat-Inhalte einsehen","warn:4-Augen","bad:nein","warn:mit Einwilligung","bad:nein","bad:nein","bad:nein"],
    ["!Impersonation starten","ok:ja","ok:ja","warn:mit Einwilligung","bad:nein","bad:nein","bad:nein"],
    ["!Abrechnung / Rückerstattung","ok:ja","bad:nein","bad:nein","ok:ja","bad:nein","bad:nein"],
    ["!Modelle / Provider schalten","ok:ja","ok:ja","bad:nein","bad:nein","bad:nein","bad:nein"],
    ["!API-Schlüssel widerrufen","ok:ja","ok:ja","bad:nein","bad:nein","bad:nein","bad:nein"],
    ["!Audit-Log lesen","ok:ja","ok:ja","bad:nein","ok:ja","ok:ja","bad:nein"],
    ["!Audit-Log ändern","bad:niemand","bad:niemand","bad:niemand","bad:niemand","bad:niemand","bad:niemand"]]},
  {t:"cols2",
   left:[{t:"table",title:"Rollenzuweisung",cols:["Person","Rolle","Seit","MFA",""],
    rows:[["!Wof Kadavanich","acc:Owner","01.01.2026","ok:Passkey","@Ändern"],
          ["!A. Bergmann","acc:Admin","14.03.2026","ok:Passkey","@Ändern|-Entziehen"],
          ["!L. Petrov","acc:Support","02.06.2026","ok:Passkey","@Ändern|-Entziehen"],
          ["!Steuerbüro Kranz","acc:Finance","11.02.2026","warn:TOTP","@Ändern|-Entziehen"],
          ["!Externe Prüfung 2026","acc:Auditor","20.07.2026","ok:Passkey","@Ändern|-Entziehen"]]}],
   right:[
    {t:"note",icon:"⚿",h:"Serverseitig, nicht im Browser",s:"Jede Admin-Route läuft durch adminAuth.js. Die Oberfläche blendet zusätzlich aus — aber der Schutz liegt im Server."},
    {t:"toggles",title:"Grundregeln",items:[
      {t:"Passkey-Pflicht für alle Admin-Rollen",s:"Passwort allein reicht nie",on:1},
      {t:"Sitzung endet nach 30 Minuten",s:"Verlängerung nur mit erneutem Passkey",on:1},
      {t:"Vier-Augen für Löschung & Rückerstattung",s:"Zweiter Admin bestätigt",on:1},
      {t:"Rechte laufen nach 90 Tagen ab",s:"Erneute Bestätigung nötig",on:1},
      {t:"Zugriff nur aus EU-IP-Bereichen",s:"Break-Glass hebt das auf, mit Alarm",on:0}]}]},
 ]},

{id:"D",g:"Menschen",n:"Support & Impersonation",h:"Support-Konsole",d:"Echte Hilfe ohne Blankoscheck: Der Nutzer willigt ein, die Sitzung ist kurz und sichtbar, jeder Klick wird zusätzlich protokolliert. Ohne Einwilligung nur Break-Glass mit Alarm.",
 blocks:[
  {t:"note",tone:"",icon:"◉",h:"Laufende Impersonation · 04:12 von 15:00",s:"Support L. Petrov sieht das Konto von Maria Roth (#u_8f31a). Einwilligung erteilt 28.07.2026 10:14. Umfang: nur Einstellungen und Abrechnung — keine Chat-Inhalte."},
  {t:"bar",items:["-Impersonation sofort beenden","Umfang anzeigen","Protokoll dieser Sitzung"]},
  {t:"cols2",
   left:[{t:"table",title:"Support-Vorgänge",tools:["Neu"],cols:["Ticket","Nutzer","Thema","Status","Alter",""],
    rows:[["#4471","!Maria Roth","Magic-Link kommt nicht an","warn:In Arbeit","2 h","@Öffnen"],
          ["#4468","!S. Braun","Abo doppelt belastet","bad:Eskaliert","1 T","@Öffnen"],
          ["#4465","!T. Lenz","Verifizierungs-Mail","ok:Gelöst","2 T","@Öffnen"],
          ["#4460","!J. Okonkwo","Konto gesperrt","warn:Wartet auf Nutzer","3 T","@Öffnen"]]}],
   right:[
    {t:"form",title:"Impersonation beantragen",sub:"Mindestumfang wählen",fields:[
      {l:"Nutzer",v:"m.roth@example.de"},
      {l:"Umfang",v:"Einstellungen + Abrechnung (ohne Chat-Inhalte)",sel:1},
      {l:"Dauer",v:"15 Minuten",sel:1},
      {l:"Einwilligung",v:"Nutzer per E-Mail anfragen",sel:1,hint:"Ohne Einwilligung nur Break-Glass: schriftliche Begründung, Sicherheitsalarm, verkürzte Sitzung."},
      {l:"Begründung",v:"Ticket #4471 — Magic-Link-Zustellung prüfen"}],
     actions:["!Einwilligung anfragen","Break-Glass (Alarm)"]},
    {t:"rows",title:"Was der Nutzer sieht",items:[
      {ic:"◉",t:"Banner in der App",s:"„Support schaut gerade mit — bis 10:29. Jetzt beenden.“",r:"acc:Sichtbar"},
      {ic:"✉",t:"E-Mail danach",s:"Wer, wann, wie lange, welcher Umfang",r:"acc:Automatisch"},
      {ic:"§",t:"Eintrag im eigenen Konto",s:"Dauerhaft unter „Sicherheit“ einsehbar",r:"acc:Dauerhaft"}]}]},
 ]},

{id:"E",g:"Geld",n:"Abrechnung & Abos",h:"Abrechnung",d:"Stripe-Sicht mit Vorgangscharakter: Zahlungsausfälle sind eine Liste zum Abarbeiten, kein Eintrag im Server-Log.",
 blocks:[
  {t:"kpis",items:[
    {k:"MRR",v:"3.412 €",d:"↑ 214 € gegenüber Vormonat",tone:"up",spark:[42,48,52,58,62,70,76]},
    {k:"Zahlende Konten",v:"118",d:"9 neu · 3 gekündigt",tone:"up",spark:[50,55,58,62,60,68,72]},
    {k:"Abwanderung 30 T",v:"2,5 %",d:"Zielwert unter 4 %",tone:"up",spark:[30,26,28,22,25,20,18]},
    {k:"Offene Zahlungen",v:"4",d:"davon 2 in Mahnstufe 2",tone:"wr",spark:[8,12,10,16,14,18,22]}]},
  {t:"table",title:"Zahlungsvorgänge",sub:"Aus Stripe-Webhooks abgeleitet",tools:["Alle","Nur Fehler"],
   cols:["Vorgang","Nutzer","Betrag","Ereignis","Stand","Nächster Schritt",""],
   rows:[
    ["#in_9K2…","!S. Braun","19,00 €","payment_failed","bad:Mahnstufe 2","Wiederholung 30.07.","@Öffnen|Rückerstatten"],
    ["#in_7A1…","!M. Roth","19,00 €","payment_succeeded","ok:Bezahlt","—","@Öffnen"],
    ["#in_5F8…","!Firma Kranz","190,00 €","invoice_open","warn:Offen","Fällig 02.08.","@Öffnen|Erinnern"],
    ["#in_3C0…","!J. Okonkwo","19,00 €","dispute_created","bad:Rückbuchung","Beleg bis 05.08.","@Öffnen|Widersprechen"],
    ["#in_2B9…","!A. Vogt","0,00 €","subscription_created","ok:Free→Pro","—","@Öffnen"]]},
  {t:"cols2",
   left:[{t:"table",title:"Webhook-Zustellung",sub:"stripeEventApply.js",cols:["Ereignis","Zeit","Versuche","Stand",""],
    rows:[["!invoice.payment_failed","10:14","3","bad:Fehlgeschlagen","@-Erneut senden"],
          ["!customer.subscription.updated","09:58","1","ok:Verarbeitet",""],
          ["!checkout.session.completed","09:12","1","ok:Verarbeitet",""],
          ["!invoice.paid","08:44","1","ok:Verarbeitet",""]]}],
   right:[{t:"form",title:"Manueller Eingriff",sub:"Immer mit Grund und zweiter Freigabe",fields:[
     {l:"Konto",v:"s.braun@example.de"},{l:"Aktion",v:"Rückerstattung (voll)",sel:1},
     {l:"Betrag",v:"19,00 €"},{l:"Grund",v:"Doppelbelastung durch Webhook-Wiederholung"}],
     actions:["!Zur Freigabe geben","Abbrechen"]}]},
 ]},

{id:"F",g:"Geld",n:"Kosten & Budgets",h:"Kosten",d:"Jeder Token wird Nutzer, Modell und Aufgabe zugeordnet. Deckel und Not-Aus sind Kernfunktion, nicht Nachrüstung — budgetGate.js und runtimeWatchdog.js liefern die Daten schon heute.",
 blocks:[
  {t:"note",icon:"◆",h:"Free-Guard aktiv — Risiko 0,00 €",s:"Jeder Lauf, der kostenpflichtige Inferenz auslösen würde, wird vorher blockiert. Der Deckel ist die Voreinstellung, nicht die Ausnahme."},
  {t:"kpis",items:[
    {k:"Ausgaben heute",v:"0,00 €",d:"Deckel 25,00 € · 0 % genutzt",tone:"up",spark:[4,6,3,8,5,4,2]},
    {k:"Ausgaben Monat",v:"0,00 €",d:"Deckel 400,00 €",tone:"up",spark:[10,12,9,14,11,13,10]},
    {k:"Token gesamt · 30 T",v:"48,2 M",d:"Ø 37 k je aktivem Nutzer",spark:[30,40,38,52,60,58,66]},
    {k:"Teuerster Nutzer",v:"18,4 M",d:"Konto #a91f — 41× Mittelwert",tone:"dn",spark:[10,18,30,44,62,80,96]}]},
  {t:"cols2",
   left:[{t:"table",title:"Verbrauch nach Nutzer",sub:"30 Tage",tools:["Ausreißer"],
    cols:["Nutzer","Token","Kosten","Anteil","Deckel",""],
    rows:[["!K. Ademi","18,4 M","0,00 €","bad:38 %","warn:überschritten","@Deckel setzen|-Drosseln"],
          ["!M. Roth","412 k","0,00 €","dim:0,9 %","ok:im Rahmen","@Deckel setzen"],
          ["!S. Braun","233 k","0,00 €","dim:0,5 %","ok:im Rahmen","@Deckel setzen"],
          ["!Firma Kranz","1,9 M","0,00 €","dim:4 %","ok:im Rahmen","@Deckel setzen"],
          ["!J. Okonkwo","61 k","0,00 €","dim:0,1 %","ok:im Rahmen","@Deckel setzen"]]}],
   right:[
    {t:"bars",title:"Kosten nach Provider · 30 Tage",items:[
      {l:"zhipu:glm-5.2",v:"62 %",p:62},{l:"Groq · Welle 2",v:"24 %",p:24},
      {l:"Salad · Maus-Engine",v:"11 %",p:11,tone:"wr"},{l:"Premium-TTS",v:"3 %",p:3}]},
    {t:"form",title:"Deckel & Not-Aus",fields:[
      {l:"Tagesdeckel gesamt",v:"25,00 €"},{l:"Deckel je Nutzer / Tag",v:"1,50 €"},
      {l:"Alarm ab",v:"70 % des Deckels",sel:1},
      {l:"Bei Überschreitung",v:"Blockieren (kein Downgrade)",sel:1,
       hint:"Alternative: automatisch auf günstigeres Modell umleiten statt zu blockieren."}],
     actions:["!Speichern","-Alles sofort stoppen"]}]},
 ]},

{id:"G",g:"Betrieb",n:"Modelle & Provider",h:"Modelle",d:"Routing, Preise und ein roter Schalter je Provider. Bei einem Preis- oder Sicherheitsvorfall zählt die Minute — nicht der Deploy.",
 blocks:[
  {t:"bar",items:["*Alle","Aktiv 6","Deaktiviert 2","Störung 1","!Modell hinzufügen"]},
  {t:"table",title:"Modelle",sub:"Reihenfolge = Routing-Priorität · modelRouter.js",tools:["Reihenfolge ändern"],
   cols:["#","Modell","Provider","Zweck","Preis / 1 M","Zustand","Latenz p95",""],
   rows:[
    ["1","!glm-5.2","zhipu","Chat + Code","0,00 €","ok:Aktiv","1,2 s","@Bearbeiten|-Aus"],
    ["2","!llama-4-70b","Groq","Schnellantworten","0,00 €","ok:Aktiv","640 ms","@Bearbeiten|-Aus"],
    ["3","!maus-engine-v2","Salad","Browser-Steuerung","0,00 €","warn:Kapazität","2,8 s","@Bearbeiten|-Aus"],
    ["4","!voice-tts-premium","intern","Sprachausgabe","0,00 €","ok:Aktiv","310 ms","@Bearbeiten|-Aus"],
    ["5","!embed-bm25","intern","Suche / RAG","—","ok:Aktiv","40 ms","@Bearbeiten"],
    ["6","!cline-bridge","Cline","Coding-Agent","0,00 €","ok:Aktiv","1,9 s","@Bearbeiten|-Aus"],
    ["—","!gpt-oss-120b","Fallback","Reserve","0,00 €","dim:Deaktiviert","—","@Bearbeiten|Ein"],
    ["—","!whisper-lokal","intern","Diktat","—","bad:Störung","—","@Bearbeiten|Neu starten"]]},
  {t:"cols2",
   left:[{t:"toggles",title:"Routing-Regeln",items:[
     {t:"Automatischer Rückfall bei Fehler",s:"Nächstes Modell in der Liste",on:1},
     {t:"Günstigstes Modell bevorzugen",s:"Wenn Qualitätsschwelle erreicht",on:1},
     {t:"Premium-Modelle nur für Pro-Konten",s:"Free bleibt auf Welle 2",on:1},
     {t:"Kostenpflichtige Inferenz global erlauben",s:"Aktuell durch Free-Guard blockiert",on:0}]}],
   right:[{t:"note",tone:"bad",icon:"⏻",h:"Not-Aus je Provider",s:"Ein Klick deaktiviert alle Modelle eines Providers und leitet laufende Anfragen um. Wirkt in unter 5 Sekunden, ohne Deploy."},
    {t:"bar",items:["-zhipu aus","-Groq aus","-Salad aus","-Cline aus"]}]},
 ]},

{id:"H",g:"Betrieb",n:"Jobs & Läufe",h:"Jobs",d:"Warteschlange, hängende Läufe, Abbruch und Wiederholung. Artefakte je Lauf direkt einsehbar — jobStore.js und jobScheduler.js sind dafür schon da.",
 blocks:[
  {t:"kpis",items:[
    {k:"Laufend",v:"37",d:"Ø Laufzeit 42 s",spark:[30,40,36,50,58,52,60]},
    {k:"In Warteschlange",v:"4",d:"Ø Wartezeit 2,8 s",tone:"wr",spark:[6,10,8,14,12,18,16]},
    {k:"Fehlgeschlagen · 24 h",v:"9",d:"davon 6 automatisch wiederholt",tone:"wr",spark:[14,10,18,12,20,16,22]},
    {k:"Hängend > 10 Min",v:"0",d:"Watchdog greift bei 10 Min",tone:"up",spark:[2,0,4,0,2,0,0]}]},
  {t:"table",title:"Läufe",sub:"Letzte 50",tools:["Nur Fehler","Nur laufend"],
   cols:["Job-ID","Nutzer","Art","Modell","Start","Dauer","Zustand",""],
   rows:[
    ["#job_71c4a","!M. Roth","Autonomer Lauf","glm-5.2","10:22:14","4:12","ok:Läuft","@Ansehen|-Abbrechen"],
    ["#job_71c39","!Firma Kranz","Maus-Engine","maus-v2","10:19:02","2:48","ok:Läuft","@Ansehen|-Abbrechen"],
    ["#job_71c2e","!S. Braun","Code-Agent","cline","10:15:41","—","warn:Wartet","@Ansehen|Vorziehen"],
    ["#job_71c1b","!A. Vogt","Chat","llama-4-70b","10:12:09","0:08","ok:Fertig","@Ansehen"],
    ["#job_71c0f","!K. Ademi","Autonomer Lauf","glm-5.2","10:08:33","0:02","bad:Abgelehnt","@Ansehen|Grund"],
    ["#job_71bfd","!T. Lenz","Datei-Analyse","glm-5.2","10:04:57","1:31","bad:Fehler","@Ansehen|Wiederholen"],
    ["#job_71be8","!M. Roth","Sprachausgabe","voice-tts","10:01:12","0:03","ok:Fertig","@Ansehen"]]},
  {t:"tl",title:"Protokoll · #job_71bfd",sub:"Fehlgeschlagen",tools:["Vollständig"],
   items:[
    {tm:"10:04:57",tx:"<b>Angenommen</b> · Nutzer #u_2ce90 · Budget geprüft (0,00 €)"},
    {tm:"10:04:58",tx:"<b>Modell gewählt</b> · glm-5.2 (Priorität 1)"},
    {tm:"10:05:31",tx:"<b>Werkzeug</b> · Datei gelesen: quartalszahlen.xlsx (2,1 MB)"},
    {tm:"10:06:22",tx:"<b>Warnung</b> · Kontextfenster zu 94 % gefüllt"},
    {tm:"10:06:28",tx:"<b>Fehler</b> · Provider-Zeitüberschreitung nach 30 s"},
    {tm:"10:06:28",tx:"<b>Rückfall</b> · llama-4-70b — ebenfalls fehlgeschlagen"},
    {tm:"10:06:29",tx:"<b>Abgebrochen</b> · Nutzer benachrichtigt, kein Verbrauch berechnet"}]},
 ]},

{id:"I",g:"Betrieb",n:"Worker & Kapazität",h:"Worker",d:"Ephemere Worker, Salad-Knoten und Sprach-Worker: was läuft, was es kostet, und ein Notaus. Datenbasis: workerCapacityStore.js und die Attestierung der Laufzeitumgebung.",
 blocks:[
  {t:"kpis",items:[
    {k:"Aktive Worker",v:"6",d:"4 ephemer · 2 dauerhaft",spark:[40,44,38,52,48,56,60]},
    {k:"Salad-Kapazität",v:"18 %",d:"unter Schwelle 20 %",tone:"dn",spark:[70,62,55,44,36,26,18]},
    {k:"Kosten Worker heute",v:"0,00 €",d:"Deckel greift",tone:"up",spark:[4,6,4,8,6,5,3]},
    {k:"Attestierung",v:"6 / 6",d:"alle Laufzeiten bestätigt",tone:"up",spark:[60,60,60,60,60,60,60]}]},
  {t:"table",title:"Worker",tools:["Neu starten","Alle stoppen"],
   cols:["Worker","Art","Region","Auslastung","Laufzeit","Attestierung",""],
   rows:[
    ["#wk_maus_01","!Maus-Engine","Salad · EU","warn:94 %","4 h 12 m","ok:Bestätigt","@Log|-Stoppen"],
    ["#wk_maus_02","!Maus-Engine","Salad · EU","warn:88 %","4 h 12 m","ok:Bestätigt","@Log|-Stoppen"],
    ["#wk_voice_01","!Sprache","Zeabur · FRA","dim:22 %","6 T","ok:Bestätigt","@Log|-Stoppen"],
    ["#wk_eph_a4f","!Ephemer","Zeabur · FRA","dim:41 %","12 m","ok:Bestätigt","@Log|-Stoppen"],
    ["#wk_eph_b71","!Ephemer","Zeabur · FRA","dim:35 %","4 m","ok:Bestätigt","@Log|-Stoppen"],
    ["#wk_browse_2","!Fernbrowser","Zeabur · FRA","dim:12 %","2 T","ok:Bestätigt","@Log|-Stoppen"]]},
  {t:"cols2",
   left:[{t:"form",title:"Kapazität steuern",fields:[
     {l:"Salad-Knoten Zielzahl",v:"4"},{l:"Maximale ephemere Worker",v:"12"},
     {l:"Bei Kapazitätsmangel",v:"Warteschlange drosseln statt hochskalieren",sel:1,
      hint:"Hochskalieren würde den Kostendeckel gefährden — bewusste Voreinstellung."}],
     actions:["!Übernehmen"]}],
   right:[{t:"note",tone:"warn",icon:"▲",h:"Kapazität knapp seit 14 Minuten",s:"Maus-Engine-Jobs warten 2,8 s. Entweder Zielzahl auf 6 erhöhen (Kosten prüfen) oder Warteschlange begrenzen."}]},
 ]},

{id:"J",g:"Sicherheit",n:"Schlüssel & Geheimnisse",h:"Schlüssel",d:"Wer hat welchen Schlüssel, wann zuletzt benutzt, sofort widerrufbar. Werte werden nie angezeigt — nur Metadaten. Grundlage: providerCredentialVault.js.",
 blocks:[
  {t:"note",tone:"warn",icon:"⚿",h:"2 Schlüssel älter als 180 Tage",s:"Rotation überfällig. Ein Schlüssel wurde seit 94 Tagen nicht mehr benutzt — Kandidat zum Widerruf."},
  {t:"table",title:"API-Schlüssel",tools:["Neu ausstellen","Nur überfällig"],
   cols:["Bezeichnung","Inhaber","Umfang","Erstellt","Zuletzt genutzt","Zustand",""],
   rows:[
    ["!prod-control-server","System","voll","01.01.2026","vor 2 Min","ok:Aktiv","@Rotieren|-Widerrufen"],
    ["!stripe-webhook-secret","System","billing","01.01.2026","vor 41 Min","warn:209 T alt","@Rotieren|-Widerrufen"],
    ["!idrive-e2-smejj-app","System","storage","03.01.2026","vor 8 Min","warn:206 T alt","@Rotieren|-Widerrufen"],
    ["!groq-welle2","System","inference","21.07.2026","vor 12 Min","ok:Aktiv","@Rotieren|-Widerrufen"],
    ["!github-app-smejj-com","System","deploy","27.07.2026","vor 3 h","ok:Aktiv","@Rotieren|-Widerrufen"],
    ["!m.roth-persönlich","!M. Roth","chat, files","14.05.2026","vor 94 T","warn:ungenutzt","@-Widerrufen"],
    ["!test-key-alt","!A. Bergmann","chat","02.02.2026","dim:nie","bad:tot","@-Widerrufen"]]},
  {t:"cols2",
   left:[{t:"toggles",title:"Regeln",items:[
     {t:"Schlüsselwert nur einmal bei Erstellung sichtbar",s:"Danach nie wieder abrufbar",on:1},
     {t:"Automatische Rotation nach 180 Tagen",s:"Alter Schlüssel 24 h parallel gültig",on:1},
     {t:"Ungenutzte Schlüssel nach 90 Tagen sperren",s:"Mit Vorwarnung an den Inhaber",on:1},
     {t:"Nutzer dürfen eigene Schlüssel anlegen",s:"Nur Pro-Konten",on:1}]}],
   right:[{t:"tl",title:"Schlüssel-Ereignisse",items:[
     {tm:"28.07 10:02",tx:"<b>A. Bergmann</b> hat <b>groq-welle2</b> rotiert · Grund: geplanter Turnus"},
     {tm:"27.07 16:44",tx:"<b>Wof K.</b> hat <b>github-app-smejj-com</b> ausgestellt · Umfang: deploy"},
     {tm:"24.07 09:11",tx:"<b>System</b> hat <b>test-key-alt</b> als tot markiert · nie benutzt"},
     {tm:"21.07 12:30",tx:"<b>Wof K.</b> hat <b>groq-welle2</b> ausgestellt · Welle 2 Start"}]}]},
 ]},

{id:"K",g:"Sicherheit",n:"Missbrauch & Moderation",h:"Moderation",d:"Auffälligkeiten kommen als Warteschlange, nicht als Bauchgefühl. Jede Entscheidung braucht eine Begründung und ist später nachvollziehbar.",
 blocks:[
  {t:"bar",items:["*Offen 2","In Prüfung 1","Entschieden 47","Regeln"]},
  {t:"table",title:"Warteschlange",sub:"Nach Schwere sortiert",tools:["Regel anlegen"],
   cols:["Erkannt","Signal","Konto","Beleg","Schwere",""],
   rows:[
    ["vor 14 Min","!Token-Ausreißer","#u_a91f4…","18,4 M Token in 24 h · 41× Mittelwert","bad:Hoch","@Prüfen|-Sperren|Verwerfen"],
    ["vor 2 h","!Registrierungswelle","18 Konten","gleiches /24-Netz · 9 Minuten","bad:Hoch","@Prüfen|-Alle sperren|Verwerfen"],
    ["vor 6 h","!Wegwerf-Adresse","#u_c410e…","Domain auf Sperrliste","warn:Mittel","@Prüfen|-Sperren|Verwerfen"],
    ["gestern","!Automatisierungsmuster","#u_5d77b…","1.400 Anfragen im Sekundentakt","ok:Entschieden — erlaubt","@Begründung"]]},
  {t:"cols2",
   left:[{t:"form",title:"Entscheidung · #u_a91f4",sub:"Token-Ausreißer",fields:[
     {l:"Bewertung",v:"Missbrauch bestätigt",sel:1},
     {l:"Maßnahme",v:"Konto sperren + Deckel auf 0",sel:1},
     {l:"Nutzer informieren",v:"Ja, mit Widerspruchsmöglichkeit",sel:1},
     {l:"Begründung",v:"Automatisierter Dauerlauf ohne erkennbare Nutzung, 41-faches Mittel, keine Reaktion auf Rückfrage."}],
     actions:["!Entscheiden","Verwerfen"]}],
   right:[{t:"toggles",title:"Automatische Erkennung",items:[
     {t:"Token-Ausreißer",s:"ab 10× Nutzermittel in 24 h",on:1},
     {t:"Registrierungswellen",s:"ab 10 Konten aus einem /24 in 15 Min",on:1},
     {t:"Wegwerf-Adressen",s:"Abgleich mit Sperrliste",on:1},
     {t:"Anfragefrequenz",s:"ab 60 Anfragen je Minute",on:1},
     {t:"Automatisch sperren ohne Prüfung",s:"Bewusst aus — Fehlalarme treffen echte Nutzer",on:0}]}]},
 ]},

{id:"L",g:"Sicherheit",n:"Sicherheit",h:"Sicherheit",d:"Anmeldungen, Magic-Link-Auffälligkeiten, Admin-Zugriffe. Die geschlossene Konto-Enumeration wird hier sichtbar statt nur im Commit.",
 blocks:[
  {t:"kpis",items:[
    {k:"Fehl-Logins · 24 h",v:"212",d:"↓ 18 % — kein Muster erkennbar",tone:"up",spark:[40,36,30,34,28,24,20]},
    {k:"Gesperrte Konten",v:"7",d:"5 automatisch, 2 manuell",tone:"wr",spark:[10,12,14,12,16,14,14]},
    {k:"Magic-Links · 24 h",v:"418",d:"3 abgelaufen, 0 mehrfach genutzt",tone:"up",spark:[50,54,48,60,58,64,62]},
    {k:"Admin-Anmeldungen",v:"11",d:"alle mit Passkey · 0 Break-Glass",tone:"up",spark:[20,18,24,22,26,20,22]}]},
  {t:"cols2",
   left:[{t:"table",title:"Sicherheitsereignisse",tools:["Nur kritisch"],
    cols:["Zeit","Ereignis","Herkunft","Konto","Bewertung"],
    rows:[
     ["10:18","!Login-Sperre ausgelöst","DE · 89.14.x.x","#u_c410e…","warn:5 Fehlversuche"],
     ["09:52","!Magic-Link abgelaufen","AT · 213.47.x.x","#u_71baf…","dim:unauffällig"],
     ["09:31","!Admin-Anmeldung","DE · 89.14.x.x","Wof K.","ok:Passkey"],
     ["08:47","!Passwort geändert","DE · 89.14.x.x","#u_8f31a…","ok:nach Reset"],
     ["07:12","!Sitzung widerrufen","—","#u_5d77b…","dim:durch Nutzer"],
     ["06:55","!Unbekannte Herkunft","CN · 121.9.x.x","#u_a91f4…","bad:geblockt"]]}],
   right:[
    {t:"note",icon:"✓",h:"Konto-Enumeration geschlossen",s:"Anmeldung, Registrierung und Passwort-Reset antworten einheitlich — aus der Antwort lässt sich nicht ableiten, ob ein Konto existiert. (Commit 58921ba)"},
    {t:"toggles",title:"Schutzmaßnahmen",items:[
      {t:"Sperre nach 5 Fehlversuchen",s:"15 Minuten, dann automatisch frei",on:1},
      {t:"Magic-Link nur einmal gültig",s:"Ablauf nach 15 Minuten",on:1},
      {t:"Einheitliche Auth-Antworten",s:"verhindert Konto-Enumeration",on:1},
      {t:"Passkey für Nutzer erzwingen",s:"aktuell freiwillig",on:0},
      {t:"Anmeldung aus neuer Region melden",s:"E-Mail an den Nutzer",on:1}]}]},
 ]},

{id:"M",g:"Recht",n:"DSGVO & Betroffenenrechte",h:"DSGVO",d:"Auskunft und Löschung sind bei euch bereits Endpunkte. Hier werden daraus Vorgänge mit Fristenuhr und Erledigungsnachweis — genau das, wonach eine Aufsichtsbehörde fragt.",
 blocks:[
  {t:"note",tone:"warn",icon:"§",h:"Eine Frist läuft in 4 Tagen ab",s:"Auskunftsersuchen von m.roth@example.de, eingegangen 24.07.2026. Gesetzliche Frist: ein Monat ab Eingang."},
  {t:"table",title:"Betroffenenanfragen",tools:["Neu erfassen"],
   cols:["Art","Betroffene Person","Eingang","Frist","Stand","Nachweis",""],
   rows:[
    ["!Auskunft (Art. 15)","m.roth@example.de","24.07.2026","warn:4 Tage","warn:In Arbeit","dim:offen","@Bearbeiten"],
    ["!Löschung (Art. 17)","alt-konto@example.de","19.07.2026","dim:erledigt","ok:Abgeschlossen","ok:PDF","@Ansehen"],
    ["!Datenübertrag (Art. 20)","t.lenz@example.com","11.07.2026","dim:erledigt","ok:Abgeschlossen","ok:JSON","@Ansehen"],
    ["!Widerspruch (Art. 21)","s.braun@example.de","04.06.2026","dim:erledigt","ok:Abgeschlossen","ok:PDF","@Ansehen"]]},
  {t:"cols2",
   left:[{t:"rows",title:"Löschvorgang · was passiert",sub:"Vollständigkeitsprüfung",items:[
     {ic:"1",t:"Konto-Objekt in IDrive e2",s:"users/{email}.json",r:"ok:gelöscht"},
     {ic:"2",t:"Alle Sitzungen",s:"serverseitige Registry",r:"ok:gelöscht"},
     {ic:"3",t:"Dateien & Uploads",s:"148 Objekte im Nutzerordner",r:"ok:gelöscht"},
     {ic:"4",t:"Chat-Verlauf",s:"lokal + serverseitige Kopien",r:"ok:gelöscht"},
     {ic:"5",t:"Job-Artefakte",s:"12 Läufe",r:"ok:gelöscht"},
     {ic:"6",t:"Einwilligungs-Ledger",s:"bleibt als Nachweis, pseudonymisiert",r:"acc:aufbewahrt"},
     {ic:"7",t:"Abrechnungsdaten",s:"Aufbewahrungspflicht 10 Jahre",r:"acc:aufbewahrt"},
     {ic:"8",t:"Audit-Log",s:"unveränderlich, pseudonymisiert",r:"acc:aufbewahrt"}]}],
   right:[
    {t:"form",title:"Aufbewahrung",fields:[
      {l:"Chat-Verlauf",v:"24 Monate nach letzter Nutzung",sel:1},
      {l:"Job-Artefakte",v:"90 Tage",sel:1},
      {l:"Audit-Log",v:"10 Jahre (unveränderlich)",sel:1},
      {l:"Abrechnungsbelege",v:"10 Jahre (§ 147 AO)",sel:1}],
     actions:["!Speichern"]},
    {t:"note",icon:"◆",h:"Vorhandene Endpunkte",s:"/api/auth/account/export und /api/auth/account/delete existieren bereits — der Admin ergänzt Fristenuhr, Zuständigkeit und Nachweis."}]},
 ]},

{id:"N",g:"Recht",n:"EU AI Act",h:"KI-Nachweise",d:"Ab 2. August 2026 beginnt die aktive Durchsetzung: Transparenzpflichten werden verbindlich, Dokumentation ist aufzubewahren. Dieses Modul hält die Nachweise an einer Stelle.",
 blocks:[
  {t:"note",tone:"warn",icon:"⚖",h:"Noch 5 Tage bis zum 2. August 2026",s:"Ab dann gelten Transparenzpflichten verbindlich und die Durchsetzungsphase beginnt. Zwei Punkte unten sind noch offen."},
  {t:"table",title:"Eingesetzte KI-Systeme",sub:"Bestandsverzeichnis",tools:["System erfassen","Export PDF"],
   cols:["System","Zweck","Risikoklasse","Anbieter","Transparenzhinweis","Protokollierung",""],
   rows:[
    ["!glm-5.2","Chat & Codeerzeugung","dim:begrenzt","zhipu","ok:vorhanden","ok:aktiv","@Datenblatt"],
    ["!llama-4-70b","Schnellantworten","dim:begrenzt","Groq","ok:vorhanden","ok:aktiv","@Datenblatt"],
    ["!maus-engine-v2","Browser-Automatisierung","warn:zu bewerten","intern","warn:fehlt","ok:aktiv","@Datenblatt"],
    ["!voice-tts-premium","Sprachausgabe","dim:begrenzt","intern","warn:fehlt","ok:aktiv","@Datenblatt"],
    ["!cline-bridge","Coding-Agent","dim:begrenzt","Cline","ok:vorhanden","ok:aktiv","@Datenblatt"]]},
  {t:"cols2",
   left:[{t:"rows",title:"Pflichtenübersicht",items:[
     {ic:"1",t:"Kennzeichnung KI-erzeugter Inhalte",s:"Sichtbar in der App und in Exporten",r:"ok:erfüllt"},
     {ic:"2",t:"Technische Dokumentation",s:"Modelle, Zweck, Grenzen, Änderungshistorie",r:"ok:erfüllt"},
     {ic:"3",t:"Protokollierung der Läufe",s:"jobStore + Audit-Log",r:"ok:erfüllt"},
     {ic:"4",t:"Aufbewahrung 10 Jahre",s:"unveränderlicher Speicher",r:"ok:erfüllt"},
     {ic:"5",t:"Transparenzhinweis Maus-Engine",s:"Automatisierte Browser-Steuerung offenlegen",r:"warn:offen"},
     {ic:"6",t:"Risikoeinstufung Maus-Engine",s:"Bewertung noch nicht abgeschlossen",r:"warn:offen"},
     {ic:"7",t:"Menschliche Aufsicht",s:"Abbruch jederzeit möglich",r:"ok:erfüllt"}]}],
   right:[{t:"tl",title:"Änderungshistorie der Modelle",sub:"nachweispflichtig",items:[
     {tm:"28.07.2026",tx:"<b>glm-5.2</b> auf Priorität 1 gesetzt · Wof K. · Grund: Qualität"},
     {tm:"21.07.2026",tx:"<b>Groq Welle 2</b> aufgenommen · Wof K. · 0-Euro-Runbook"},
     {tm:"14.07.2026",tx:"<b>maus-engine-v2</b> in Betrieb · Wof K. · Abnahme dokumentiert"},
     {tm:"18.06.2026",tx:"<b>gpt-oss-120b</b> deaktiviert · Wof K. · Kosten"}]}]},
 ]},

{id:"O",g:"Recht",n:"Audit-Log",h:"Audit",d:"Jede schreibende Admin-Aktion, unveränderlich und exportierbar. Keine Rolle darf hier ändern oder löschen — auch der Owner nicht. Das ist die Säule, an der eine Prüfung hängt.",
 blocks:[
  {t:"bar",items:["*Alle","Nutzeraktionen","Abrechnung","Schlüssel","Impersonation","Konfiguration","Export"]},
  {t:"table",title:"Audit-Log",sub:"Anfügend, unveränderlich · 41.208 Einträge",tools:["Zeitraum","Export JSON"],
   cols:["Zeit","Akteur","Aktion","Ziel","Vorher → Nachher","Grund","Herkunft"],
   rows:[
    ["28.07 10:22:41","!Wof K.","user.role.grant","#u_2ce90…","user → support","Neues Teammitglied","89.14.x.x"],
    ["28.07 10:14:02","!L. Petrov","impersonation.start","#u_8f31a…","— → aktiv (15 Min)","Ticket #4471 · Einwilligung erteilt","89.14.x.x"],
    ["28.07 10:02:18","!A. Bergmann","apikey.rotate","groq-welle2","alt → neu","Geplanter Turnus","89.14.x.x"],
    ["28.07 09:41:55","!Wof K.","model.priority.set","glm-5.2","3 → 1","Qualität besser","89.14.x.x"],
    ["28.07 09:12:33","!Wof K.","user.block","#u_a91f4…","aktiv → gesperrt","Missbrauch bestätigt · 41× Mittel","89.14.x.x"],
    ["27.07 16:44:09","!Wof K.","apikey.create","github-app-smejj-com","— → deploy","Frontend-Deploy","89.14.x.x"],
    ["27.07 14:20:51","!Steuerbüro Kranz","billing.export","2026-Q2","— → CSV","Quartalsabschluss","81.7.x.x"],
    ["27.07 11:05:12","!A. Bergmann","flag.enable","chat-actions-v2","aus → 5 %","Schrittweise Freigabe","89.14.x.x"]]},
  {t:"cols2",
   left:[{t:"note",icon:"⛓",h:"Unveränderlich abgelegt",s:"Eigener Bucket mit Objektsperre. Jeder Eintrag trägt eine Prüfsumme des Vorgängers — Lücken oder Änderungen fallen sofort auf."}],
   right:[{t:"note",icon:"↧",h:"Export für Prüfungen",s:"JSON oder CSV, mit Signatur und Zeitraumangabe. Auditoren bekommen eine eigene Rolle mit Leserecht — ohne Zugang zu Inhalten."}]},
 ]},

{id:"P",g:"Betrieb",n:"Betrieb & Deploy",h:"Deploy",d:"Live-Stand gegen Repo-Stand. Genau hier ist bei euch zweimal etwas auseinandergelaufen — sichtbar statt Rätselraten.",
 blocks:[
  {t:"note",tone:"warn",icon:"⇅",h:"Service-Worker läuft dem Repo voraus",s:"Live: sw.js v165 · Lokales Repo: v165 · Frontend-Repo smejj-app-frontend: v163. Ein Deploy auf veralteter Basis würde zwei Versionen zurückwerfen."},
  {t:"cols3",items:[
   {t:"rows",title:"Frontend",items:[
     {ic:"◐",t:"smejj.com (Pages)",s:"Repo smejj-app-frontend · assets/",r:"ok:Live"},
     {ic:"#",t:"sw.js Version",s:"Cache-Bump bei jedem Deploy",r:"acc:v165"},
     {ic:"⏱",t:"Letzter Deploy",s:"28.07.2026, 01:03 · Chat-Aktionen",r:"dim:vor 9 h"}]},
   {t:"rows",title:"Control-Server",items:[
     {ic:"◐",t:"Zeabur · FRA",s:"Node · 4 Instanzen",r:"ok:Live"},
     {ic:"#",t:"Version",s:"Commit 4c4fa18",r:"acc:4c4fa18"},
     {ic:"⏱",t:"Letzter Neustart",s:"27.07.2026, 19:52",r:"dim:vor 14 h"}]},
   {t:"rows",title:"Speicher & Modelle",items:[
     {ic:"☁",t:"IDrive e2",s:"Bucket smejj-app",r:"ok:OK"},
     {ic:"☁",t:"smejj-model-files",s:"Modell-Dateien",r:"ok:OK"},
     {ic:"◆",t:"K2.7 Vault",s:"87 Objekte · Inferenz deaktiviert",r:"warn:Inferenz aus"}]}]},
  {t:"table",title:"Deploy-Historie",tools:["Zurückrollen"],
   cols:["Zeit","Ziel","Version","Auslöser","Ergebnis",""],
   rows:[
    ["28.07 01:03","!Frontend","v165","Wof K.","ok:Erfolgreich","@Details|Zurückrollen"],
    ["27.07 19:52","!Control-Server","4c4fa18","Wof K.","ok:Erfolgreich","@Details|Zurückrollen"],
    ["27.07 17:04","!Frontend","v164","Wof K.","ok:Erfolgreich","@Details|Zurückrollen"],
    ["26.07 20:02","!Control-Server","f1ed8a4","Wof K.","warn:Neustart nötig","@Details|Zurückrollen"],
    ["25.07 17:07","!Frontend","v140","Wof K.","ok:Erfolgreich","@Details|Zurückrollen"]]},
 ]},

{id:"Q",g:"Produkt",n:"Ankündigungen & Wartung",h:"Ankündigungen",d:"Banner in der App schalten, Wartungsfenster ankündigen, Störung melden — ohne Deploy und in allen Sprachen.",
 blocks:[
  {t:"cols2",
   left:[{t:"form",title:"Neue Ankündigung",fields:[
     {l:"Art",v:"Wartungsfenster",sel:1},
     {l:"Titel",v:"Kurze Wartung am 3. August, 02:00–02:30"},
     {l:"Text",v:"Der Dienst ist für etwa 30 Minuten nicht erreichbar. Laufende Jobs werden vorher beendet."},
     {l:"Zielgruppe",v:"Alle angemeldeten Nutzer",sel:1},
     {l:"Anzeige ab / bis",v:"01.08.2026 09:00 — 03.08.2026 03:00"},
     {l:"Sprachen",v:"21 Sprachen · automatisch übersetzt, 3 geprüft",sel:1}],
     actions:["!Vorschau","Planen","Abbrechen"]}],
   right:[
    {t:"table",title:"Geplant & aktiv",cols:["Titel","Art","Zeitraum","Stand",""],
     rows:[["!Wartung 3. August","Wartung","01.–03.08.","warn:Geplant","@Bearbeiten|-Löschen"],
           ["!Neue Chat-Aktionen","Hinweis","seit 28.07.","ok:Aktiv","@Bearbeiten|Beenden"],
           ["!Sprachausgabe verbessert","Hinweis","20.–27.07.","dim:Beendet","@Ansehen"],
           ["!Störung E-Mail-Versand","Störung","14.07.","dim:Beendet","@Ansehen"]]},
    {t:"note",icon:"◆",h:"Vorschau im echten Layout",s:"Der Banner wird im tatsächlichen App-Rahmen dargestellt — hell und dunkel, Handy und Rechner —, bevor er ausgespielt wird."}]},
 ]},

{id:"R",g:"Produkt",n:"Feature-Flags",h:"Flags",d:"Funktionen für einzelne Konten, einen Prozentsatz oder alle freischalten. Ein An/Aus braucht keinen Deploy und keinen Cache-Bump.",
 blocks:[
  {t:"table",title:"Schalter",tools:["Neu anlegen"],
   cols:["Schalter","Bereich","Zustand","Reichweite","Geändert",""],
   rows:[
    ["!chat-actions-v2","Chat","ok:Teilweise","5 % der Nutzer","27.07. · A. Bergmann","@Bearbeiten|100 %|-Aus"],
    ["!maus-engine-interaktiv","Automatisierung","ok:An","Pro-Konten","14.07. · Wof K.","@Bearbeiten|-Aus"],
    ["!voice-premium-tts","Sprache","ok:An","Alle","18.07. · Wof K.","@Bearbeiten|-Aus"],
    ["!admin-console","Verwaltung","warn:Nur Owner","3 Konten","28.07. · Wof K.","@Bearbeiten"],
    ["!browser-pane-neu","Browser","dim:Aus","—","11.07. · Wof K.","@Bearbeiten|An"],
    ["!onboarding-variante-b","Onboarding","ok:Test","50 / 50","20.07. · Wof K.","@Ergebnis|-Aus"]]},
  {t:"cols2",
   left:[{t:"form",title:"chat-actions-v2",fields:[
     {l:"Zustand",v:"Teilweise freigegeben",sel:1},
     {l:"Anteil",v:"5 %"},
     {l:"Immer an für",v:"3 Testkonten",sel:1},
     {l:"Notabschaltung bei",v:"Fehlerquote über 2 %",sel:1,hint:"Der Schalter geht automatisch aus und meldet sich."}],
     actions:["!Übernehmen","Auf 100 % setzen","-Sofort aus"]}],
   right:[{t:"bars",title:"Wirkung · chat-actions-v2",sub:"5 % gegen 95 %",items:[
     {l:"Fehlerquote Testgruppe",v:"0,3 %",p:15},{l:"Fehlerquote Rest",v:"0,4 %",p:20},
     {l:"Nutzung der Aktionen",v:"38 % der Nachrichten",p:38},{l:"Abbrüche",v:"unverändert",p:8}]}]},
 ]},

{id:"S",g:"Produkt",n:"Inhalte & Wissen",h:"Wissen",d:"Was ist indexiert, was ist veraltet, was gehört gelöscht. Grundlage: knowledgeLoader.js, bm25Index.js und der K2.7 Vault mit 87 Objekten.",
 blocks:[
  {t:"kpis",items:[
    {k:"Objekte im Vault",v:"87",d:"Inferenz derzeit deaktiviert",tone:"wr",spark:[60,64,70,74,80,84,87]},
    {k:"Index-Einträge",v:"12.408",d:"BM25 · letzter Bau vor 6 h",spark:[40,50,55,62,70,74,80]},
    {k:"Ungenutzt > 90 T",v:"14",d:"Kandidaten zum Aufräumen",tone:"wr",spark:[4,6,8,10,12,13,14]},
    {k:"Indexgröße",v:"412 MB",d:"IDrive e2",spark:[50,54,58,62,66,70,74]}]},
  {t:"table",title:"Wissensquellen",tools:["Neu indexieren","Quelle hinzufügen"],
   cols:["Quelle","Art","Objekte","Letzter Bau","Treffer 30 T","Zustand",""],
   rows:[
    ["!Produktdokumentation","Markdown","41","vor 6 h","2.104","ok:Aktuell","@Neu bauen|-Entfernen"],
    ["!AGB & Datenschutz","HTML","6","vor 6 h","318","ok:Aktuell","@Neu bauen|-Entfernen"],
    ["!Hilfe-Artikel","Markdown","28","vor 6 h","1.877","ok:Aktuell","@Neu bauen|-Entfernen"],
    ["!Alte Release-Notes","Markdown","12","vor 41 T","dim:0","warn:Veraltet","@Neu bauen|-Entfernen"],
    ["!K2.7 Vault","Binär","87","vor 2 T","dim:—","warn:Inferenz aus","@Prüfen"]]},
 ]},

{id:"T",g:"Produkt",n:"Sprachen & Übersetzungen",h:"Sprachen",d:"21 Sprachordner liegen bereits in public/. Fehlende Schlüssel werden hier sichtbar, statt zufällig von einem Nutzer gefunden zu werden.",
 blocks:[
  {t:"note",tone:"warn",icon:"⌘",h:"31 Schlüssel fehlen in 4 Sprachen",s:"Betroffen sind vor allem die neuen Chat-Aktionen aus v165. Bis zur Übersetzung greift der deutsche Text als Rückfall."},
  {t:"table",title:"Sprachstand",tools:["Fehlende exportieren","Automatisch übersetzen"],
   cols:["Sprache","Code","Vollständig","Fehlend","Geprüft","Nutzer",""],
   rows:[
    ["!Deutsch","de","ok:100 %","0","ok:ja","62 %","@Öffnen"],
    ["!Englisch","en","ok:100 %","0","ok:ja","21 %","@Öffnen"],
    ["!Türkisch","tr","warn:96 %","7","warn:teilweise","4 %","@Öffnen"],
    ["!Spanisch","es","warn:96 %","7","warn:teilweise","3 %","@Öffnen"],
    ["!Französisch","fr","ok:100 %","0","ok:ja","3 %","@Öffnen"],
    ["!Arabisch","ar","warn:94 %","9","bad:nein","2 %","@Öffnen"],
    ["!Japanisch","ja","warn:96 %","8","bad:nein","1 %","@Öffnen"],
    ["!Weitere 14 Sprachen","—","ok:100 %","0","warn:teilweise","4 %","@Alle zeigen"]]},
 ]},

{id:"U",g:"Betrieb",n:"Speicher",h:"Speicher",d:"Belegung, Uploads je Nutzer, verwaiste Objekte und Aufräumregeln — für beide IDrive-e2-Buckets.",
 blocks:[
  {t:"kpis",items:[
    {k:"Belegt gesamt",v:"148 GB",d:"smejj-app + smejj-model-files",spark:[40,48,56,62,70,76,84]},
    {k:"Objekte",v:"412.907",d:"↑ 8.100 in 7 Tagen",spark:[50,54,60,64,70,74,80]},
    {k:"Verwaist",v:"2,4 GB",d:"ohne zugehöriges Konto",tone:"wr",spark:[10,14,16,20,22,26,30]},
    {k:"Kosten Speicher",v:"0,00 €",d:"im Tarif enthalten",tone:"up",spark:[20,20,20,20,20,20,20]}]},
  {t:"cols2",
   left:[{t:"table",title:"Nach Bereich",cols:["Bereich","Objekte","Größe","Aufbewahrung",""],
    rows:[["!Nutzer-Uploads","318.400","94 GB","24 Monate","@Regel"],
          ["!Job-Artefakte","61.200","28 GB","90 Tage","@Regel"],
          ["!Modell-Dateien","87","19 GB","dauerhaft","@Regel"],
          ["!Konto-Objekte","1.284","41 MB","dauerhaft","@Regel"],
          ["!Audit-Log","41.208","2,1 GB","10 Jahre · gesperrt","@Regel"],
          ["!Verwaist","8.412","2,4 GB","—","@-Aufräumen"]]}],
   right:[{t:"table",title:"Größte Konten",cols:["Nutzer","Dateien","Größe",""],
     rows:[["!Firma Kranz","2.104","18,4 GB","@Ansehen"],["!K. Ademi","1.877","11,2 GB","@Ansehen"],
           ["!M. Roth","148","2,1 GB","@Ansehen"],["!S. Braun","96","1,4 GB","@Ansehen"]]},
    {t:"note",tone:"warn",icon:"⌫",h:"2,4 GB ohne Besitzer",s:"Objekte gelöschter Konten, deren Aufräumlauf abgebrochen ist. Bereinigung ist umkehrbar für 30 Tage."}]},
 ]},

{id:"V",g:"Betrieb",n:"E-Mail-Zustellung",h:"E-Mail",d:"Der häufigste Supportfall überhaupt: „Der Link kommt nicht an.“ Hier ist sichtbar, ob es an euch, am Anbieter oder am Postfach liegt.",
 blocks:[
  {t:"kpis",items:[
    {k:"Versand · 24 h",v:"418",d:"Magic-Link, Verifizierung, Reset",spark:[50,54,48,60,58,64,62]},
    {k:"Zustellrate",v:"96,9 %",d:"Zielwert über 98 %",tone:"dn",spark:[80,78,74,70,68,66,64]},
    {k:"Bounces",v:"13",d:"↑ 3,1 % — auffällig",tone:"dn",spark:[10,12,14,18,22,26,30]},
    {k:"Ø Zustellzeit",v:"4,2 s",d:"unauffällig",tone:"up",spark:[20,22,18,24,20,22,18]}]},
  {t:"table",title:"Zustellprotokoll",tools:["Nur Fehler","Erneut senden"],
   cols:["Zeit","Empfänger","Art","Anbieter","Ergebnis","Detail",""],
   rows:[
    ["10:22","m.roth@example.de","Magic-Link","SMTP-1","bad:Bounce","550 Mailbox voll","@-Erneut"],
    ["10:19","t.lenz@example.com","Verifizierung","SMTP-1","ok:Zugestellt","—",""],
    ["10:14","a.vogt@example.de","Magic-Link","SMTP-1","ok:Zugestellt","—",""],
    ["10:02","k.ademi@example.org","Reset","SMTP-1","warn:Verzögert","Graylisting 4 Min","@Ansehen"],
    ["09:58","info@firma-kranz.de","Rechnung","SMTP-2","ok:Zugestellt","—",""],
    ["09:41","j.oko@example.net","Magic-Link","SMTP-1","bad:Bounce","550 unbekannt","@-Erneut"]]},
  {t:"cols2",
   left:[{t:"bars",title:"Bounce-Gründe · 7 Tage",items:[
     {l:"Postfach unbekannt",v:"41 %",p:41,tone:"dg"},{l:"Postfach voll",v:"28 %",p:28,tone:"wr"},
     {l:"Als Spam eingestuft",v:"19 %",p:19,tone:"wr"},{l:"Zeitüberschreitung",v:"12 %",p:12}]}],
   right:[{t:"note",tone:"warn",icon:"✉",h:"Spam-Einstufung steigt",s:"19 % der Bounces sind Spam-Filter. Prüfen: SPF, DKIM und DMARC für smejj.com — und ob der Absendername konstant bleibt."}]},
 ]},

{id:"W",g:"Produkt",n:"Analytik",h:"Analytik",d:"Wo brechen Leute ab. Vom ersten Aufruf bis zur Zahlung, ohne Fremd-Tracker — die Daten liegen ohnehin bei euch.",
 blocks:[
  {t:"kpis",items:[
    {k:"Aufrufe · 30 T",v:"41.208",d:"↑ 12 %",tone:"up",spark:[40,44,50,54,62,70,76]},
    {k:"Registrierungen",v:"1.284",d:"3,1 % der Aufrufe",tone:"up",spark:[30,36,40,48,52,60,66]},
    {k:"Erster Chat",v:"71 %",d:"der Registrierten",tone:"up",spark:[50,54,58,62,66,70,71]},
    {k:"Zahlend",v:"9,2 %",d:"der aktiven Nutzer",tone:"up",spark:[20,24,28,32,36,40,44]}]},
  {t:"cols2",
   left:[{t:"bars",title:"Trichter · 30 Tage",sub:"Absolute Zahlen",items:[
     {l:"Startseite aufgerufen",v:"41.208",p:100},
     {l:"Registrierung begonnen",v:"3.104 · 7,5 %",p:75},
     {l:"E-Mail bestätigt",v:"1.284 · 41 %",p:41,tone:"wr"},
     {l:"Erster Chat gesendet",v:"912 · 71 %",p:52},
     {l:"Zweiter Tag aktiv",v:"481 · 53 %",p:34,tone:"wr"},
     {l:"Abo abgeschlossen",v:"118 · 9,2 %",p:12,tone:"dg"}]}],
   right:[
    {t:"note",tone:"warn",icon:"▼",h:"Größter Verlust: E-Mail-Bestätigung",s:"59 % der begonnenen Registrierungen bestätigen die Adresse nie. Bei 3,1 % Bounce-Rate lohnt der Blick auf die Zustellung (Modul V), bevor am Text gefeilt wird."},
    {t:"table",title:"Nach Sprache",cols:["Sprache","Nutzer","Abschluss"],
     rows:[["!Deutsch","62 %","ok:11,4 %"],["!Englisch","21 %","ok:8,1 %"],
           ["!Türkisch","4 %","warn:3,2 %"],["!Spanisch","3 %","warn:2,9 %"],["!Übrige","10 %","warn:2,1 %"]]}]},
 ]},

{id:"X",g:"Produkt",n:"Experimente",h:"Experimente",d:"A/B-Tests mit Ergebnis statt Bauchgefühl. Läuft über dieselben Schalter wie die Feature-Flags.",
 blocks:[
  {t:"table",title:"Laufende & abgeschlossene Tests",tools:["Test anlegen"],
   cols:["Test","Bereich","Aufteilung","Läuft seit","Ergebnis","Stand",""],
   rows:[
    ["!onboarding-variante-b","Onboarding","50 / 50","20.07.2026","ok:+18 % Bestätigung","ok:Läuft","@Ansehen|Übernehmen"],
    ["!preisseite-jahresabo","Preise","50 / 50","14.07.2026","warn:kein Unterschied","warn:Läuft","@Ansehen|-Beenden"],
    ["!chat-aktionen-position","Chat","50 / 50","27.07.2026","dim:zu früh","ok:Läuft","@Ansehen"],
    ["!magic-link-text","Anmeldung","50 / 50","02.07.2026","ok:+9 % Klicks","dim:Übernommen","@Bericht"]]},
  {t:"cols2",
   left:[{t:"bars",title:"onboarding-variante-b",sub:"Bestätigungsrate",items:[
     {l:"Variante A (bisher)",v:"38 %",p:38},{l:"Variante B (neu)",v:"56 %",p:56},
     {l:"Aussagekraft",v:"97 % · ausreichend",p:97}]}],
   right:[{t:"note",icon:"✓",h:"Empfehlung: Variante B übernehmen",s:"18 Prozentpunkte mehr Bestätigungen bei 97 % Aussagekraft und 2.104 Teilnehmenden. Übernahme setzt den Schalter auf 100 % und beendet den Test."}]},
 ]},

{id:"Y",g:"Überblick",n:"Aufgaben & Notizen",h:"Aufgaben",d:"Die Betreiber-Aufgabenliste im System statt in einer Markdown-Datei — mit Zuständigkeit, Frist und Verknüpfung zum passenden Modul.",
 blocks:[
  {t:"bar",items:["*Offen 8","In Arbeit 3","Erledigt 41","!Aufgabe anlegen"]},
  {t:"table",title:"Aufgaben",tools:["Nur meine"],
   cols:["Aufgabe","Bereich","Zuständig","Frist","Priorität","Stand",""],
   rows:[
    ["!Rollenfeld ins Nutzerschema","Fundament","Wof K.","30.07.2026","bad:Hoch","warn:In Arbeit","@Öffnen"],
    ["!Nutzer-Index aufbauen","Fundament","Wof K.","31.07.2026","bad:Hoch","dim:Offen","@Öffnen"],
    ["!Transparenzhinweis Maus-Engine","EU AI Act","Wof K.","02.08.2026","bad:Hoch","dim:Offen","@Öffnen"],
    ["!SPF/DKIM/DMARC prüfen","E-Mail","Wof K.","05.08.2026","warn:Mittel","dim:Offen","@Öffnen"],
    ["!Auskunft m.roth beantworten","DSGVO","Wof K.","24.08.2026","warn:Mittel","warn:In Arbeit","@Öffnen"],
    ["!Salad-Kapazität entscheiden","Betrieb","Wof K.","29.07.2026","warn:Mittel","dim:Offen","@Öffnen"],
    ["!Zwei Schlüssel rotieren","Sicherheit","A. Bergmann","31.07.2026","warn:Mittel","dim:Offen","@Öffnen"],
    ["!Variante B übernehmen","Produkt","Wof K.","—","dim:Niedrig","dim:Offen","@Öffnen"]]},
 ]},

{id:"Z",g:"Verwaltung",n:"Admin-Verwaltung",h:"Admins",d:"Wer darf hier überhaupt hinein, seit wann, mit welchem zweiten Faktor. Und wie der Notzugang aussieht, wenn alles andere ausfällt.",
 blocks:[
  {t:"table",title:"Administratoren",tools:["Einladen"],
   cols:["Person","Rolle","Seit","Zweiter Faktor","Letzte Anmeldung","Rechte laufen ab",""],
   rows:[
    ["!Wof Kadavanich","acc:Owner","01.01.2026","ok:Passkey","vor 41 Min","dim:unbefristet","@Sitzungen"],
    ["!A. Bergmann","acc:Admin","14.03.2026","ok:Passkey","vor 2 h","warn:in 12 Tagen","@Sitzungen|-Entziehen"],
    ["!L. Petrov","acc:Support","02.06.2026","ok:Passkey","vor 8 Min","ok:in 64 Tagen","@Sitzungen|-Entziehen"],
    ["!Steuerbüro Kranz","acc:Finance","11.02.2026","warn:TOTP","vor 1 T","warn:in 5 Tagen","@Sitzungen|-Entziehen"],
    ["!Externe Prüfung 2026","acc:Auditor","20.07.2026","ok:Passkey","vor 3 T","ok:in 82 Tagen","@Sitzungen|-Entziehen"]]},
  {t:"cols2",
   left:[{t:"dual",title:"Freigabe ausstehend",sub:"Vier-Augen-Prinzip",a:"L. Petrov",bb:"Wof Kadavanich",
     reason:"Konto #u_a91f4 endgültig löschen — Missbrauch bestätigt, Widerspruchsfrist abgelaufen."}],
   right:[
    {t:"note",tone:"bad",icon:"⚿",h:"Notzugang (Break-Glass)",s:"Ein separates Konto, offline verwahrt, ohne Alltagsnutzung. Jede Verwendung löst sofort Alarm aus, erzwingt eine schriftliche Begründung und verkürzt die Sitzung auf 10 Minuten."},
    {t:"tl",title:"Admin-Zugriffe",items:[
      {tm:"28.07 10:14",tx:"<b>L. Petrov</b> · Anmeldung mit Passkey · DE"},
      {tm:"28.07 09:31",tx:"<b>Wof K.</b> · Anmeldung mit Passkey · DE"},
      {tm:"27.07 14:20",tx:"<b>Steuerbüro Kranz</b> · Anmeldung mit TOTP · DE"},
      {tm:"25.07 08:02",tx:"<b>Notzugang</b> · nicht verwendet seit Einrichtung"}]}]},
 ]},
];
