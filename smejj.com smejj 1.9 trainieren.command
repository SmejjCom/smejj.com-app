#!/bin/zsh
# smejj.com — smejj 1.9 trainieren
#
# DERSELBE DATENSATZ wie 1.8. Nur zwei Zahlen sind anders:
#
#                    1.8      1.9
#   Rang             16       8
#   Lernrate         1e-4     3e-5
#
# WARUM: Am 10.09. wurde ueber alle fuenf Laeufe dasselbe gemessen — das WISSEN
# faellt und das KOENNEN steigt, ohne eine einzige Ausnahme:
#
#   1.4  -5,7 / +1,9   1.5  -9,2 / +0,1   1.6  -7,3 / +3,5
#   1.7  -9,5 / +3,4   1.8 -13,1 / +7,4
#
# 1.8 hat nur das Gewicht der Handpaare erhoeht und beides verdoppelt. Der
# Adapter ueberschreibt gespeichertes Faktenwissen, waehrend er Verhalten lernt.
# Die Suite misst neun Wissens- gegen sechs Koennensgebiete — darum gewinnt die
# nackte Basis, obwohl der Adapter beim Koennen deutlich besser ist
# (Ehrlichkeit +18,3, Rechnen +15,4 ueber Basis).
#
# 1.9 greift halb so tief ein. Die Erwartung: weniger Vergessen bei weniger
# Gewinn. Was die Messung beantwortet, ist die einzige Frage, die zaehlt —
# ob der Verlust schneller schrumpft als der Gewinn.
#
# DASS DER DATENSATZ DERSELBE BLEIBT, IST DER GANZE PUNKT. Aendert man Daten
# und Eingriffstiefe zugleich, sagt die Messung hinterher nichts.
#
# DABEI GEFUNDEN: Bis 1.8 schrieb das Skript `rang` und `lernrate` in die
# Job-Konfiguration — train.py liest `r` und `lr` und nahm still seine Vorgaben.
# Die waren zufaellig dieselben Zahlen, darum fiel es nie auf. Ein geaenderter
# Wert waere lautlos verpufft und die Messung haette "kein Unterschied"
# gemeldet, obwohl gar nichts anders trainiert wurde. Behoben und mit vier
# Tests abgesichert.
#
# Reihe: 1.4 = 66,0 | 1.5 = 62,6 | 1.6 = 64,9 | 1.7 = 63,3 | 1.8 = 62,9 | Basis = 68,4

cd "$(dirname "$0")" || exit 1
if [ -f "$HOME/.config/smejj.com/env.local" ]; then
  set -a; . "$HOME/.config/smejj.com/env.local" >/dev/null 2>&1; set +a
fi

clear
echo "smejj 1.9 trainieren"
echo "════════════════════════════════════════════════════════════════════════"
echo ""
echo "SCHRITT 1 — ist die Gruppe frei?"
echo "────────────────────────────────────────────────────────────────────────"

node -e '
Promise.all([
  import("./workers/con-autopilot/config.js"),
  import("./workers/con-autopilot/salad.js"),
  import("./workers/con-autopilot/e2.js"),
  import("./scripts/training/smejj-1-1-trainieren.mjs")
]).then(async ([c, s, e, t]) => {
  const konfig = t.trainingsKonfig(c.leseKonfig(process.env));
  const client = s.saladClient(konfig.salad);
  const e2 = e.e2Client(e.e2KonfigAusEnv(process.env));
  const z = await s.gruppenZustand(client);
  console.log(`  Gruppe: ${z.zustand}${z.jobId ? ` (${z.jobId}, ${z.modus || "?"})` : ""}`);

  if (["stopped", "failed", "fehlt"].includes(z.zustand)) { console.log("  Frei."); process.exit(0); }

  // Nur abschalten, was seine Arbeit ERLEDIGT hat. Ein laufender Lauf ist
  // bezahlte Zeit und wird nie angefasst.
  //
  // "fertig: true" allein genuegt dafuer NICHT — und daran ist der Klick vom
  // 07.09. gescheitert: Salad teilt einen beendeten Job neu zu, der neue
  // Durchlauf schreibt "fertig: false, Phase: laden" ueber den alten Status,
  // und der Zombie sieht in der Statusdatei exakt aus wie ein frischer Lauf.
  // Die Datei verweigerte daraufhin das Stoppen — und die Kostenschleife lief
  // weiter, waehrend das Training nicht startete.
  //
  // Das verlaessliche Kennzeichen ist das ERGEBNIS in der Ablage: eine
  // Bewertung (Messung) oder ein Adapter (Training). Wer sein Ergebnis
  // abgeliefert hat, ist fertig — egal was sein Herzschlag gerade behauptet.
  if (z.jobId) {
    const st = await e2.getJson(`con/logs/jobs/${z.jobId}/status.json`, null).catch(() => null);
    const bewertung = await e2.getJson(`smejj/bewertungen/${z.jobId}.json`, null).catch(() => null);
    const version = st?.version || st?.kandidat || null;
    const training = version ? await e2.getJson(`con/versions/${version}/training.json`, null).catch(() => null) : null;
    const ergebnisDa = Boolean(bewertung) || (training && training.jobId === z.jobId);

    if (st && st.fertig !== true && !ergebnisDa) {
      console.log(`  ABBRUCH: ${z.jobId} laeuft wirklich noch (Phase ${st.phase}, ${version || "?"}) und hat kein Ergebnis abgelegt.`);
      console.log("  Es wird nichts angefasst — das waere bezahlte Rechenzeit zum Fenster hinaus.");
      process.exit(3);
    }
    if (ergebnisDa && st?.fertig !== true) {
      console.log(`  ${z.jobId} hat sein Ergebnis laengst abgelegt (${bewertung ? "Bewertung" : "Adapter"}) und wurde von Salad nur neu zugeteilt.`);
      console.log("  Das ist die Kostenschleife, kein Lauf — sie wird beendet.");
    } else {
      console.log(`  ${z.jobId} ist fertig — die Gruppe darf abgeschaltet werden.`);
    }
  }
  const r = await client.stoppe();
  console.log(`  Stopp: ${r.ok ? "bestaetigt" : "ABGELEHNT"} (HTTP ${r.status})`);
  if (!r.ok) process.exit(4);
  for (let i = 0; i < 25; i += 1) {
    await new Promise((f) => setTimeout(f, 6000));
    const n = await s.gruppenZustand(client);
    if (["stopped", "failed", "fehlt"].includes(n.zustand)) { console.log(`  Gruppe ist ${n.zustand}.`); process.exit(0); }
    console.log(`  noch ${n.zustand} — warte (${i + 1}/25)`);
  }
  process.exit(5);
});'
FREI=$?
if [ $FREI -eq 3 ]; then
  echo ""; echo "Es laeuft noch etwas. Nichts wurde angefasst."; echo "Fenster kann geschlossen werden."; exit 3
fi

echo ""
echo "SCHRITT 2 — Training starten"
echo "────────────────────────────────────────────────────────────────────────"
SMEJJ_KANDIDAT=smejj-1-9 SMEJJ_DATENSATZ=smejj-1-8 SMEJJ_RANG=8 SMEJJ_LERNRATE=0.00003 node scripts/training/smejj-1-1-trainieren.mjs --starten
START=$?

echo ""
echo "════════════════════════════════════════════════════════════════════════"
if [ $START -eq 0 ]; then
  echo "Training laeuft. Rund 90 Minuten, hoechstens 420."
  echo ""
  echo "Fortschritt:  SMEJJ_KANDIDAT=smejj-1-9 node scripts/training/smejj-1-1-trainieren.mjs --stand"
  echo ""
  echo "Danach messen mit der Datei 'smejj.com smejj 1.9 messen.command'."
else
  echo "NICHT gestartet (Ausstieg $START). Der Grund steht oben."
fi
echo "════════════════════════════════════════════════════════════════════════"
echo ""
echo "Fenster kann geschlossen werden."
