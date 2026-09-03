"""con-Autopilot — Antworten fuer die Pruefsuiten erzeugen (Single Responsibility: Antworten, nicht Noten).

Bewusste Trennung: Dieser Job erzeugt NUR die Rohantworten und Leistungswerte.
Die Bewertung (Punkte, Regression, Freigabe) rechnet der Autopilot auf Zeabur
deterministisch nach — ein Rechner, der sein eigenes Ergebnis benotet, waere
genau der Interessenkonflikt, den der Auftrag verbietet.

Zwei Wege zum Modell:
  transformers  Basismodell (bf16 aus e2) in 4 Bit (nf4) auf die Karte, optional
                mit LoRA-Adapter — derselbe Stapel wie beim Training.
  openai        Beliebiger OpenAI-kompatibler Endpunkt (z. B. der MLX-Server
                auf dem Mac fuer kostenlose Probelaeufe, spaeter der Canary).

Das Denken (thinking) ist fuer die Messung AUS: die Suiten verlangen kurze,
pruefbare Antworten, und ein Denkblock wuerde das Token-Budget auffressen.
Ein <think>-Block, der trotzdem kommt, wird entfernt und im Ergebnis vermerkt.
"""
import json
import os
import re
import time
import urllib.request

THINK_RE = re.compile(r"<think>[\s\S]*?</think>\s*", re.IGNORECASE)


def _entdenke(text):
    hatte = bool(THINK_RE.search(text or ""))
    return THINK_RE.sub("", text or "").strip(), hatte


def _nachrichten(fall):
    m = []
    if fall.get("system"):
        m.append({"role": "system", "content": fall["system"]})
    m.append({"role": "user", "content": fall["prompt"]})
    return m


class OpenAiWeg:
    def __init__(self, endpunkt, modell, api_key=""):
        self.endpunkt = endpunkt.rstrip("/")
        self.modell = modell
        self.api_key = api_key

    def antworte(self, fall, max_tokens):
        body = {
            "model": self.modell,
            "messages": _nachrichten(fall),
            "max_tokens": max_tokens,
            "temperature": 0,
            "chat_template_kwargs": {"enable_thinking": False},
        }
        req = urllib.request.Request(self.endpunkt + "/v1/chat/completions",
                                     data=json.dumps(body).encode("utf-8"),
                                     headers={"content-type": "application/json",
                                              **({"authorization": "Bearer " + self.api_key} if self.api_key else {})})
        with urllib.request.urlopen(req, timeout=600) as r:
            d = json.loads(r.read().decode("utf-8"))
        msg = d["choices"][0]["message"]
        text = msg.get("content") or ""
        usage = d.get("usage") or {}
        return text, int(usage.get("completion_tokens") or 0)

    def beschreibung(self):
        return {"weg": "openai", "endpunkt": self.endpunkt, "modell": self.modell}


class TransformersWeg:
    def __init__(self, modellpfad, adapterpfad=None, status=None):
        import torch
        from transformers import AutoTokenizer, BitsAndBytesConfig
        self.torch = torch
        self.tok = AutoTokenizer.from_pretrained(modellpfad)
        ohne_quant = os.environ.get("CON_QUANT", "nf4") == "none"
        quant = None if ohne_quant else BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4",
                                   bnb_4bit_compute_dtype=torch.bfloat16, bnb_4bit_use_double_quant=True)
        dtype = torch.float32 if ohne_quant else torch.bfloat16
        geraet = "auto" if torch.cuda.is_available() else None
        modell = None
        fehler = []
        for laderName in ("AutoModelForImageTextToText", "AutoModelForCausalLM"):
            try:
                import transformers
                lader = getattr(transformers, laderName)
                kw = {"dtype": dtype, "low_cpu_mem_usage": True}
                if quant is not None: kw["quantization_config"] = quant
                if geraet: kw["device_map"] = geraet
                modell = lader.from_pretrained(modellpfad, **kw)
                self.lader = laderName
                break
            except Exception as e:  # noqa: BLE001
                fehler.append(f"{laderName}: {str(e)[:200]}")
        if modell is None:
            raise RuntimeError("Modell laesst sich nicht laden: " + " | ".join(fehler))
        if adapterpfad:
            from peft import PeftModel
            modell = PeftModel.from_pretrained(modell, adapterpfad)
        modell.eval()
        self.modell = modell
        self.modellpfad = modellpfad
        self.adapterpfad = adapterpfad

    def antworte(self, fall, max_tokens):
        tok = self.tok
        try:
            prompt_ids = tok.apply_chat_template(_nachrichten(fall), add_generation_prompt=True,
                                                 return_tensors="pt", enable_thinking=False)
        except TypeError:
            prompt_ids = tok.apply_chat_template(_nachrichten(fall), add_generation_prompt=True, return_tensors="pt")
        if not hasattr(prompt_ids, "to"):
            prompt_ids = prompt_ids["input_ids"]
        prompt_ids = prompt_ids.to(self.modell.device)
        with self.torch.no_grad():
            out = self.modell.generate(prompt_ids, max_new_tokens=max_tokens, do_sample=False,
                                       pad_token_id=tok.pad_token_id or tok.eos_token_id)
        neu = out[0][prompt_ids.shape[-1]:]
        return tok.decode(neu, skip_special_tokens=True), int(neu.shape[-1])

    def beschreibung(self):
        vram = None
        try:
            vram = int(self.torch.cuda.max_memory_allocated() // (1024 * 1024))
        except Exception:  # noqa: BLE001
            pass
        return {"weg": "transformers", "lader": self.lader, "modell": self.modellpfad,
                "adapter": self.adapterpfad, "quantisierung": os.environ.get("CON_QUANT", "nf4"), "vramMaxMiB": vram}


def lade_suiten(verzeichnis):
    suiten = []
    for name in sorted(os.listdir(verzeichnis)):
        if name.endswith(".json"):
            with open(os.path.join(verzeichnis, name), encoding="utf-8") as f:
                suiten.append(json.load(f))
    return suiten


def fuehre_aus(weg, suiten, status, abbruch=lambda: False, wiederholungen=1):
    """Liefert {suiteId: {...antworten}}; jeder Fall wird `wiederholungen`-mal gestellt."""
    ergebnisse = []
    gesamt = sum(len(s.get("cases", [])) for s in suiten) * wiederholungen
    erledigt = 0
    tokens_gesamt = 0
    sekunden_gesamt = 0.0
    for suite in suiten:
        faelle = []
        for fall in suite.get("cases", []):
            laeufe = []
            for w in range(wiederholungen):
                if abbruch():
                    break
                start = time.time()
                try:
                    text, tokens = weg.antworte(fall, int(fall.get("maxTokens") or 400))
                    text, hatte_denken = _entdenke(text)
                    dauer = time.time() - start
                    laeufe.append({"text": text, "latencyMs": int(dauer * 1000), "tokensOut": tokens,
                                   "hatteDenkblock": hatte_denken, "error": None})
                    tokens_gesamt += tokens
                    sekunden_gesamt += dauer
                except Exception as e:  # noqa: BLE001
                    laeufe.append({"text": "", "latencyMs": int((time.time() - start) * 1000), "tokensOut": 0,
                                   "hatteDenkblock": False, "error": str(e)[:300]})
                erledigt += 1
                status.setze(phase="messung", suite=suite.get("suiteId"), fall=fall.get("id"),
                             erledigt=erledigt, von=gesamt)
            faelle.append({"id": fall.get("id"), "kategorie": fall.get("kategorie") or suite.get("kategorie"),
                           "runs": laeufe})
        ergebnisse.append({"suiteId": suite.get("suiteId"), "version": suite.get("version"),
                           "contentSha256": (suite.get("integrity") or {}).get("contentSha256"),
                           "kategorie": suite.get("kategorie"), "cases": faelle})
    leistung = {
        "tokensGesamt": tokens_gesamt,
        "sekundenGesamt": round(sekunden_gesamt, 1),
        "tokensProSekunde": round(tokens_gesamt / sekunden_gesamt, 2) if sekunden_gesamt > 0 else None,
        "antworten": erledigt,
    }
    return {"suiten": ergebnisse, "leistung": leistung, "modell": weg.beschreibung(), "wiederholungen": wiederholungen}
