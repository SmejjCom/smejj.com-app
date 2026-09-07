#!/bin/zsh
# smejj.com — Anbieterkette verlaengern
#
# WARUM DAS WICHTIG IST, gemessen am 07.09.2026:
# Die Plattform haengt an EINEM Anbieter. Als Zhipu an diesem Tag sein
# Anfragelimit erreichte (HTTP 429), fielen vier von fuenf Sicherheitspruefungen
# aus — nicht weil das Modell falsch antwortete, sondern weil gar keine Antwort
# kam. Sieben Autopiloten meldeten daraufhin Ausfall.
#
# Eine Kette mit zwei Gliedern ist kein Netz, sondern ein Seil.
#
# WAS DIESE DATEI TUT: Sie misst, wie viele Glieder die Kette gerade hat, und
# nennt die fehlenden beim Namen. Sie traegt NICHTS ein und legt kein Konto an —
# Zugangsdaten gehoeren in Deine Hand, nicht in meine.

cd "$(dirname "$0")" || exit 1
if [ -f "$HOME/.config/smejj.com/env.local" ]; then
  set -a; . "$HOME/.config/smejj.com/env.local" >/dev/null 2>&1; set +a
fi

clear
echo "Anbieterkette von smejj.com"
echo "════════════════════════════════════════════════════════════════════════"
echo ""
echo "SCHRITT 1 — wie viele Glieder hat die Kette gerade?"
echo "────────────────────────────────────────────────────────────────────────"

SCHLUESSEL=$(cat "$HOME/.config/smejj.com/api-schluessel-smejj-unbefristet.txt" 2>/dev/null | tr -d '\n')
if [ -z "$SCHLUESSEL" ]; then
  echo "  (kein API-Schluessel auf diesem Mac — die Live-Messung entfaellt)"
else
  # Ein absichtlich winziger Auftrag. Kommt eine Antwort, hat die Kette ein
  # funktionierendes Glied gefunden; kommt ein Fehler, listet er ALLE
  # versuchten Glieder auf — das ist die genaueste Auskunft, die es gibt.
  ANTWORT=$(curl -s --max-time 90 -X POST "https://api.smejj.com/api/agent" \
    -H "content-type: application/json" -H "authorization: Bearer $SCHLUESSEL" \
    -d '{"task":"Antworte nur mit dem Wort Kettentest.","mode":"fast"}' 2>/dev/null)
  printf '%s' "$ANTWORT" | python3 -c '
import sys, json
roh = sys.stdin.read()
if roh.startswith("data:"):
    print("  Die Kette antwortet — mindestens ein Glied traegt gerade.")
    print("  (Wie viele es insgesamt sind, zeigt sich erst, wenn eines ausfaellt.)")
else:
    try:
        d = json.loads(roh)
        vs = d.get("attempts") or []
        if vs:
            print(f"  Die Kette hat {len(vs)} Glied(er) versucht — ALLE sind gescheitert:")
            for v in vs:
                b = str(v.get("backend"))
                m = str(v.get("model"))[:32]
                e = str(v.get("error"))
                print("     %-14s %-32s %s" % (b, m, e))
            print("")
            print("  Genau das ist der Engpass: faellt das eine aus, steht der Chat.")
        else:
            print("  " + roh[:160])
    except Exception:
        print("  " + roh[:160])
'
fi

echo ""
echo "SCHRITT 2 — welche Glieder fehlen"
echo "────────────────────────────────────────────────────────────────────────"
echo ""
echo "  Der Router kennt 16 Anbieter. Zwei haben einen Schluessel (Zhipu, Groq)."
echo "  Jeder weitere kostet NICHTS und macht die Kette belastbarer:"
echo ""
printf "  %-16s %-34s %s\n" "ANBIETER" "VARIABLE FUER ZEABUR" "ANMELDUNG"
printf "  %-16s %-34s %s\n" "────────" "───────────────────" "─────────"
printf "  %-16s %-34s %s\n" "Google Gemini" "SMEJJ_LLM_GEMINI_API_KEY"     "aistudio.google.com"
printf "  %-16s %-34s %s\n" "Cerebras"      "SMEJJ_LLM_CEREBRAS_API_KEY"   "cloud.cerebras.ai"
printf "  %-16s %-34s %s\n" "Mistral"       "SMEJJ_LLM_MISTRAL_API_KEY"    "console.mistral.ai"
printf "  %-16s %-34s %s\n" "OpenRouter"    "SMEJJ_LLM_OPENROUTER_API_KEY" "openrouter.ai"
printf "  %-16s %-34s %s\n" "Together"      "SMEJJ_LLM_TOGETHER_API_KEY"   "api.together.ai"
printf "  %-16s %-34s %s\n" "NVIDIA"        "SMEJJ_LLM_NVIDIA_API_KEY"     "build.nvidia.com"
printf "  %-16s %-34s %s\n" "SambaNova"     "SMEJJ_LLM_SAMBANOVA_API_KEY"  "cloud.sambanova.ai"
echo ""
echo "  Die Adressen sind der Stand vom 07.09.2026 und koennen sich aendern."
echo "  Massgeblich ist immer die Seite des Anbieters."
echo ""
echo "SCHRITT 3 — so traegst DU einen Schluessel ein"
echo "────────────────────────────────────────────────────────────────────────"
echo ""
echo "  1. Beim Anbieter anmelden, in den Einstellungen einen API-Schluessel"
echo "     erzeugen."
echo ""
echo "  2. KEINE ZAHLUNGSDATEN HINTERLEGEN. Ohne hinterlegte Karte kann keine"
echo "     Rechnung entstehen — das ist die einzige wirklich sichere Bremse."
echo ""
echo "  3. Zeabur-Portal -> Dienst 'smejj-control' -> Environment Variables:"
echo "     die Variable aus der Tabelle oben setzen."
echo ""
echo "  4. Dienst NEU BAUEN. Ein blosser Neustart zieht keine neue Umgebung —"
echo "     der Schluessel waere gesetzt und trotzdem wirkungslos."
echo ""
echo "  Mehr ist nicht noetig. Der Router prueft beim Start, welche Schluessel"
echo "  da sind, und baut die Kette daraus. Es gibt keine zweite Stelle."
echo ""
echo "════════════════════════════════════════════════════════════════════════"
echo "Diese Datei hat nichts eingetragen und kein Konto angelegt."
echo "Zugangsdaten gehoeren in Deine Hand."
echo "════════════════════════════════════════════════════════════════════════"
echo ""
echo "Fenster kann geschlossen werden."
