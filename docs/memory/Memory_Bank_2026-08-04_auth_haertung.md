## 2026-08-04 — A-bis-Z-Pruefung: Passwort im Klartext-Dialog, Auth-Seiten ohne CSP (job_auth_haertung_20260804)

Commit `199449e`, Frontend `c788e47`, live und nachgemessen. `check:all` gruen
(1743 Zusicherungen). Kapsel: `task-capsules/2026/08/job_auth_haertung_20260804/`.

- **EIN BROWSER-DIALOG IST KEIN PASSWORTFELD.** Der Reset fragte das neue Passwort
  mit `window.prompt()` ab: keine Maskierung (Klartext auf dem Schirm), keine
  Passwortverwaltung, blockiert die Seite, von Chrome dauerhaft unterdrueckbar —
  und ohne zweites Feld sperrt ein unsichtbarer Tippfehler den Nutzer aus dem
  eigenen Konto, bei bereits verbrauchtem Token. Jetzt Seitenformular mit
  Bestaetigungsfeld; der Vergleich steht VOR dem Serveraufruf, damit ein
  Tippfehler den Token nicht verbrennt. Live belegt: bei ungleichen Eingaben
  geht KEIN Netzaufruf raus.
- **DIE SICHERSTE SEITE WAR DIE UNGESCHUETZTESTE.** `index.html` trug CSP und
  Referrer-Regel, `/auth/login/` und `/auth/register/` nicht — dort, wo E-Mail,
  Passwort, OAuth-Rueckkehr und Passkey durchlaufen. MERKREGEL: **Schutz, der an
  EINER Seite haengt, ist keine Richtlinie** — beim Anlegen einer neuen Seite
  gegen die Startseite abgleichen, nicht gegen die Nachbarseite.
- **EINE ZU STRENGE CSP IST SCHLIMMER ALS KEINE.** `connect-src` muss den
  Control-Server fuehren, sonst schlaegt jede Anmeldung STUMM fehl. Der Schutztest
  liest die Adresse aus `config.js`, damit beides nicht auseinanderlaufen kann.
- **MERKREGEL Sprachdateien:** der i18n-Waechter prueft nur Woerterbuch → Quelltext.
  Ein entfernter `t()`-Aufruf hinterlaesst einen verwaisten Schluessel und macht
  `check:all` rot; ein NEUER Text ohne Uebersetzung faellt dagegen nie auf.
  Ausserdem liefen die AUSGELIEFERTEN Sprachdateien dem Repo voraus (zwei tote
  Schluessel) — vor dem Ueberschreiben gepflegter Dateien gegen live halten.
- OFFEN: `account-sessions.js` nutzt dieselbe Bauart fuer Passwortwechsel und
  Kontoloeschung. Bewusst NICHT blind mitgeliefert: hinter der Anmeldung, aus
  einer Sitzung nicht pruefbar, und eine ungetestete Aenderung an der
  Kontoloeschung waere schlimmer als der Befund.
