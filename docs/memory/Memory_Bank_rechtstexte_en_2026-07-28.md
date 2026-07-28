# Memory_Bank Archiv — Rechtstexte EN (2026-07-28)

Ausgelagert am 2026-07-28 aus Memory_Bank.md wegen der 800-Zeilen-Regel
(AI_Guidelines.md). Wortgleich uebernommen, nichts geloescht oder geaendert.

### [2026-07-28] ENGLISCHE RECHTSTEXTE, ECHTE UMLAUTE, BREITEN NACHGEMESSEN (job_rechtstexte_en_20260728)

Freigabe "smejj.com 100 % fertig" (Wof Kadavanich, 2026-07-28), Abschluss.
Arbeits-Commit `8158ac0`, Live-Commit `eaa64ed`, Rueckfall `56c63be`.

**Entscheidung:** englische Hoeflichkeitsfassungen der Rechtstexte
(`public/en/legal-notice.html`, `public/en/privacy.html`) mit ausdruecklichem
Hinweis, dass ausschliesslich der deutsche Text verbindlich ist. Uebersetzt
wurde der bestehende Text; inhaltlich wurde nichts entschieden. Keine
Rechtsberatung — ob eine englische Fassung noetig ist, bleibt fachlich zu
klaeren.

**Begruendung:** die Seite hat 14 Sprachversionen, die Rechtstexte gab es nur
auf Deutsch. Eine Lesehilfe mit klarer Vorrangregel ist der einzige Schritt,
den ich ohne juristische Bewertung verantworten kann.

**Drei Dinge, die dabei belastbar wurden:**
1. *Breitenpruefung ist doch moeglich.* Meine Aussage in allen drei QA-Berichten,
   echte Viewports seien nicht pruefbar, galt nur fuer den ferngesteuerten
   Chrome. Im Vorschaubrowser wirkt `resize_window`. Nachgemessen bei 320, 375,
   430, 768, 1920 px: kein horizontales Scrollen, kein Ziel unter 24x24 px.
   Befund F-22 erledigt, Berichte korrigiert. Offen bleibt nur 200-%-Zoom.
2. *Ein 404 killt den ganzen Precache.* Die neuen Seiten fehlten in der
   Erlaubnisliste `isPublicAsset()` des lokalen Servers; `cache.addAll()` haette
   komplett versagt. Auf GitHub Pages waere das nie aufgefallen. Neue
   HTML-Seiten im Precache brauchen immer auch einen ROUTES-Eintrag.
3. *Fremdes Umpinnen kann den Lauf blockieren.* Die app.js-Aufteilung
   (`1e75c54`, parallele Sitzung) aenderte `scripts/check-guidelines.mjs`, ohne
   das Benchmark-Manifest nachzuziehen — `check:all` war rot. Neu gepinnt auf
   `2026-07-28.5`, nur der abweichende Datei-Hash.

**Verifikation:** `check:all` und `release:preflight` gruen; beide Locks nach
Freigabe neu eingefroren; live geprueft — `/impressum.html`,
`/datenschutz.html`, `/en/legal-notice.html`, `/en/privacy.html` je 200, echte
Umlaute sichtbar, Fusszeilen-Links 24 px hoch, `sw.js` auf `smejj-shell-v158`
mit beiden Seiten im Precache, Darstellung bei 375 px per Bildschirmfoto belegt.

**Bewusst nicht umgesetzt:** die 17 Seiten mit Inline-`<style>` (2 Rechtsseiten,
14 Sprach-Startseiten, 404) werden vom eigenen Node-Server per `style-src
'self'` unformatiert dargestellt; live faellt es nicht auf, weil GitHub Pages
keine CSP setzt. Ein Fix hiesse gemeinsames Stylesheet plus Neuerzeugung aller
Sprachseiten — Begruendung in der Kapsel.

---

