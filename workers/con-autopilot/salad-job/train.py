"""con-Autopilot — QLoRA-Training mit Zwischenstaenden in e2 (Single Responsibility: Training).

Regeln aus dem Auftrag, hier maschinell:
  * Basismodell kommt aus e2 (bf16), wird in 4 Bit (nf4) geladen -> passt auf 24 GB.
  * Alle paar Minuten ein Zwischenstand nach e2 (Adapter + Trainer-Zustand).
    Salad-Knoten koennen jederzeit verschwinden; der naechste Job setzt beim
    letzten Zwischenstand fort (resume_from_checkpoint).
  * Der Job traegt eine Zeitgrenze (job.py) — laeuft sie ab, wird der aktuelle
    Zustand gesichert und sauber beendet, nie einfach abgeschossen.
  * Nur der Sprachteil wird trainiert (LoRA auf allen Linear-Schichten des
    language_model, lm_head ausgenommen). Der Bildturm bleibt eingefroren.

Datensatz: JSONL, je Zeile {"messages":[{"role":..,"content":..}, ...]}
(oder {"prompt","response"}). Nur der Assistenten-Anteil traegt Verlust.
"""
import gc
import hashlib
import json
import os
import re
import time

# Gemessen 04.09. auf einer RTX 3090: das Laden fuer das Training scheiterte mit
# "CUDA out of memory, tried to allocate 4.74 GiB" bei 19,07 GiB belegt. Zerstueckelter
# Speicher ist ein Teil davon; expandable_segments legt zusammenhaengend nach.
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")

import e2


def _lade_zeilen(pfad, max_zeilen=None):
    zeilen = []
    with open(pfad, encoding="utf-8") as f:
        for roh in f:
            roh = roh.strip()
            if not roh:
                continue
            d = json.loads(roh)
            if "messages" in d:
                m = d["messages"]
            else:
                m = [{"role": "user", "content": d["prompt"]}, {"role": "assistant", "content": d["response"]}]
            zeilen.append(m)
            if max_zeilen and len(zeilen) >= max_zeilen:
                break
    return zeilen


def _ziel_module(modell):
    """Alle Linear-Schichten des Sprachmodells, lm_head ausgenommen (namensunabhaengig, robust)."""
    import torch
    namen = set()
    for name, mod in modell.named_modules():
        klasse = type(mod).__name__
        if not (isinstance(mod, torch.nn.Linear) or "Linear" in klasse):
            continue
        if "lm_head" in name or "embed" in name:
            continue
        if "vis" in name.lower() or "vision" in name.lower() or "visual" in name.lower():
            continue
        namen.add(name.split(".")[-1])
    namen.discard("lm_head")
    return sorted(namen)


def _neuester_zwischenstand(prefix):
    eintraege = e2.liste(prefix.rstrip("/") + "/")
    schritte = set()
    for e in eintraege:
        m = re.search(r"/checkpoint-(\d+)/", e["key"])
        if m:
            schritte.add(int(m.group(1)))
    return max(schritte) if schritte else None


def trainiere(modellpfad, datensatz_pfad, ausgabe, checkpoint_prefix, status, konfig, abbruch=lambda: False):
    import torch
    from transformers import AutoTokenizer, BitsAndBytesConfig, Trainer, TrainingArguments, TrainerCallback
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training

    tok = AutoTokenizer.from_pretrained(modellpfad)
    if tok.pad_token is None:
        tok.pad_token = tok.eos_token
    ohne_quant = os.environ.get("CON_QUANT", "nf4") == "none"
    quant = None if ohne_quant else BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4",
                               bnb_4bit_compute_dtype=torch.bfloat16, bnb_4bit_use_double_quant=True)
    cuda = torch.cuda.is_available()
    status.setze(phase="training", schritt="modell_laden", quantisierung="none" if ohne_quant else "nf4", cuda=cuda)
    import transformers
    modell = None
    fehler = []
    for laderName in ("AutoModelForImageTextToText", "AutoModelForCausalLM"):
        try:
            kw = {"dtype": torch.float32 if ohne_quant else torch.bfloat16, "low_cpu_mem_usage": True}
            if quant is not None: kw["quantization_config"] = quant
            if cuda: kw["device_map"] = "auto"
            modell = getattr(transformers, laderName).from_pretrained(modellpfad, **kw)
            break
        except Exception as e:  # noqa: BLE001
            fehler.append(f"{laderName}: {str(e)[:200]}")
    if modell is None:
        raise RuntimeError("Modell laesst sich nicht laden: " + " | ".join(fehler))
    if quant is not None:
        # prepare_model_for_kbit_training rechnet ALLE nicht quantisierten Schichten auf
        # float32 hoch — bei Qwen3.8 ist die Ausgabeschicht wegen des Wortschatzes von
        # 248.320 rund 1,27 Milliarden Werte gross, in float32 also gut 5 GB. Genau diese
        # 4,74 GiB fehlten am 04.09. auf der 24-GB-Karte.
        # Der schlanke Weg macht dasselbe fuer das Training Noetige, ohne den Aufpreis:
        # Gradientenpruefpunkte an, und die Eingaenge muessen Gradienten annehmen, damit
        # die Pruefpunkte bei eingefrorenen Gewichten ueberhaupt greifen.
        try:
            modell.gradient_checkpointing_enable()
            if hasattr(modell, "enable_input_require_grads"):
                modell.enable_input_require_grads()
            else:
                modell.get_input_embeddings().register_forward_hook(
                    lambda _m, _e, ausgabe: ausgabe.requires_grad_(True))
            modell.config.use_cache = False
            status.setze(schritt="vorbereitet", weg="schlank_ohne_fp32_upcast")
        except Exception as fehler:  # noqa: BLE001 — im Zweifel der erprobte Weg
            status.setze(schritt="vorbereitet", weg="prepare_model_for_kbit_training", hinweis=str(fehler)[:120])
            modell = prepare_model_for_kbit_training(modell, use_gradient_checkpointing=True)
    ziele = _ziel_module(modell)
    lora = LoraConfig(r=int(konfig.get("r", 16)), lora_alpha=int(konfig.get("alpha", 32)),
                      lora_dropout=float(konfig.get("dropout", 0.05)), bias="none",
                      target_modules=ziele, task_type="CAUSAL_LM")
    modell = get_peft_model(modell, lora)
    trainierbar = sum(p.numel() for p in modell.parameters() if p.requires_grad)
    status.setze(schritt="daten", zielModule=ziele, trainierbareParameter=trainierbar)

    max_len = int(konfig.get("maxLen", 2048))
    # Wie viel Zeit bleibt wirklich? Das Laden des 55-GB-Modells dauert je nach Knoten
    # zwischen 16 und ueber 60 Minuten (gemessen 03./04.09.). Eine feste Zeilenzahl fuehrt
    # auf einem langsamen Knoten dazu, dass die Zeitgrenze mitten im Lernplan zuschlaegt:
    # die Lernrate ist dann noch nicht abgeklungen, der Adapter halbgar. Darum richtet sich
    # die Menge nach der RESTZEIT, nicht nach einer Wunschzahl.
    rest_min = konfig.get("restMinuten")
    if rest_min is None:
        frist = os.environ.get("CON_JOB_MAX_MINUTEN")
        rest_min = float(frist) if frist else 180.0
    mess_reserve = float(konfig.get("messReserveMinuten", 35))
    minuten_je_schritt = float(konfig.get("minutenJeSchritt", 2.5))
    batch = int(konfig.get("batch", 1))
    grad_akk = int(konfig.get("gradAkk", 8))
    moegliche_schritte = max(4, int((float(rest_min) - mess_reserve) / minuten_je_schritt))
    zeilen_grenze_zeit = moegliche_schritte * batch * grad_akk
    wunsch = konfig.get("maxZeilen")
    zeilen_grenze = min(int(wunsch), zeilen_grenze_zeit) if wunsch else zeilen_grenze_zeit
    status.setze(schritt="daten", restMinuten=round(float(rest_min), 1), moeglicheSchritte=moegliche_schritte,
                 zeilenGrenze=zeilen_grenze, wunsch=wunsch)
    zeilen = _lade_zeilen(datensatz_pfad, zeilen_grenze)
    if not zeilen:
        raise RuntimeError("Datensatz leer")

    def kodiere(messages):
        # Nur der Assistenten-Teil traegt Verlust: Prompt-Tokens werden mit -100 maskiert.
        try:
            prompt_ids = tok.apply_chat_template(messages[:-1], add_generation_prompt=True, enable_thinking=False)
            voll_ids = tok.apply_chat_template(messages, enable_thinking=False)
        except TypeError:
            prompt_ids = tok.apply_chat_template(messages[:-1], add_generation_prompt=True)
            voll_ids = tok.apply_chat_template(messages)
        if hasattr(prompt_ids, "get"):
            prompt_ids, voll_ids = prompt_ids["input_ids"], voll_ids["input_ids"]
        voll_ids = list(voll_ids)[:max_len]
        labels = [-100] * min(len(prompt_ids), len(voll_ids)) + voll_ids[len(prompt_ids):]
        return {"input_ids": voll_ids, "labels": labels[:len(voll_ids)], "attention_mask": [1] * len(voll_ids)}

    beispiele = [kodiere(m) for m in zeilen]

    class Datensatz(torch.utils.data.Dataset):
        def __len__(self):
            return len(beispiele)

        def __getitem__(self, i):
            return beispiele[i]

    def sammle(batch):
        n = max(len(b["input_ids"]) for b in batch)
        pad = tok.pad_token_id
        ids = torch.tensor([b["input_ids"] + [pad] * (n - len(b["input_ids"])) for b in batch])
        lab = torch.tensor([b["labels"] + [-100] * (n - len(b["labels"])) for b in batch])
        att = torch.tensor([b["attention_mask"] + [0] * (n - len(b["attention_mask"])) for b in batch])
        return {"input_ids": ids, "labels": lab, "attention_mask": att}

    os.makedirs(ausgabe, exist_ok=True)
    # Zwischenstaende gehoeren zu GENAU dieser Kombination aus Kandidat, Datensatz und
    # Trainingsplan. Am 05.09. fand ein Lauf mit dem NEUEN Datensatz einen Zwischenstand
    # des alten (Schritt 66 von geplanten 64) und hielt sich fuer fertig — null neue
    # Schritte, und gemessen worden waere die alte Arbeit unter neuem Namen.
    kennung = hashlib.sha256(json.dumps({
        "daten": os.path.abspath(datensatz_pfad),
        "quelle": konfig.get("datensatzKennung") or os.environ.get("CON_DATENSATZ_PREFIX", ""),
        "r": konfig.get("r"), "alpha": konfig.get("alpha"), "lr": konfig.get("lr"),
        "maxLen": max_len, "batch": batch, "gradAkk": grad_akk
    }, sort_keys=True).encode("utf-8")).hexdigest()[:12]
    checkpoint_prefix = f"{checkpoint_prefix.rstrip('/')}/{kennung}"
    status.setze(schritt="zwischenstand_kennung", kennung=kennung)
    letzter = _neuester_zwischenstand(checkpoint_prefix)
    resume = None
    if letzter is not None:
        status.setze(schritt="zwischenstand_laden", schrittNr=letzter)
        e2.lade_verzeichnis_herunter(f"{checkpoint_prefix.rstrip('/')}/checkpoint-{letzter}",
                                     os.path.join(ausgabe, f"checkpoint-{letzter}"))
        resume = os.path.join(ausgabe, f"checkpoint-{letzter}")

    # Gemessen 03.09. auf einer RTX 3090 mit 27B/nf4: ein Zwischenstand traegt Adapter UND
    # Optimierer-Zustand (zusammen ueber 1 GB) nach e2 und dauert damit laenger als ein
    # Trainingsschritt. Bei 5 Minuten Abstand verdoppelte sich die Zeit je Schritt von 2 auf 4
    # Minuten. 15 Minuten sind der Kompromiss: bei einem Salad-Abbruch geht hoechstens eine
    # Viertelstunde verloren, die Rechenzeit bleibt aber ueberwiegend Rechenzeit.
    sicherungs_minuten = float(konfig.get("checkpointMinuten", 15))

    class E2Sicherung(TrainerCallback):
        def __init__(self):
            self.zuletzt = time.time()
            self.hochgeladen = set()

        def on_log(self, args, state, control, logs=None, **kw):
            status.setze(schritt="training", globalStep=state.global_step, maxSteps=state.max_steps,
                         epoche=round(float(state.epoch or 0), 3), loss=(logs or {}).get("loss"),
                         lernrate=(logs or {}).get("learning_rate"))
            if abbruch():
                control.should_save = True
                control.should_training_stop = True
            elif time.time() - self.zuletzt >= sicherungs_minuten * 60:
                control.should_save = True
            return control

        def on_save(self, args, state, control, **kw):
            self.zuletzt = time.time()
            pfad = os.path.join(ausgabe, f"checkpoint-{state.global_step}")
            if os.path.isdir(pfad) and pfad not in self.hochgeladen:
                status.setze(schritt="zwischenstand_sichern", schrittNr=state.global_step)
                e2.lade_verzeichnis_hoch(pfad, f"{checkpoint_prefix.rstrip('/')}/checkpoint-{state.global_step}")
                self.hochgeladen.add(pfad)
                status.setze(schritt="training", letzterZwischenstand=state.global_step)
            return control

    import inspect
    gewuenscht = dict(
        output_dir=ausgabe,
        per_device_train_batch_size=int(konfig.get("batch", 1)),
        gradient_accumulation_steps=int(konfig.get("gradAkk", 8)),
        num_train_epochs=float(konfig.get("epochen", 1)),
        learning_rate=float(konfig.get("lr", 1e-4)),
        lr_scheduler_type="cosine", warmup_steps=int(konfig.get("warmupSteps", 10)),
        logging_steps=int(konfig.get("logSteps", 5)),
        save_strategy="steps", save_steps=int(konfig.get("saveSteps", 10_000_000)),
        save_total_limit=2, bf16=cuda, optim="paged_adamw_8bit" if cuda else "adamw_torch",
        gradient_checkpointing=cuda, report_to=[], dataloader_pin_memory=False, use_cpu=not cuda,
        remove_unused_columns=False, max_grad_norm=1.0, save_only_model=False,
    )
    # transformers-Versionen unterscheiden sich in den Argumentnamen (z. B. warmup_ratio -> warmup_steps in 5.x).
    # Nur Argumente durchreichen, die diese Version kennt; das Protokoll nennt die ausgelassenen.
    erlaubt = set(inspect.signature(TrainingArguments.__init__).parameters)
    ausgelassen = sorted(k for k in gewuenscht if k not in erlaubt)
    args = TrainingArguments(**{k: v for k, v in gewuenscht.items() if k in erlaubt})
    if ausgelassen:
        status.setze(trainingsArgsAusgelassen=ausgelassen)
    trainer = Trainer(model=modell, args=args, train_dataset=Datensatz(), data_collator=sammle,
                      callbacks=[E2Sicherung()])
    status.setze(schritt="training", beispiele=len(beispiele), resume=resume)
    start = time.time()
    ergebnis = trainer.train(resume_from_checkpoint=resume)
    dauer = time.time() - start
    adapter_pfad = os.path.join(ausgabe, "adapter")
    modell.save_pretrained(adapter_pfad)
    tok.save_pretrained(adapter_pfad)
    with open(os.path.join(adapter_pfad, "con-training.json"), "w", encoding="utf-8") as f:
        json.dump({"konfig": konfig, "zielModule": ziele, "trainierbareParameter": trainierbar,
                   "beispiele": len(beispiele), "globalStep": trainer.state.global_step,
                   "trainLoss": getattr(ergebnis, "training_loss", None), "sekunden": round(dauer),
                   "abgebrochen": bool(abbruch())}, f, indent=2)
    schritte = trainer.state.global_step
    abbruch_gewuenscht = bool(abbruch())
    # VRAM freigeben, BEVOR die Messung dasselbe Modell ein zweites Mal laedt.
    # Ohne das laufen Training und Messung nacheinander in dieselbe 24-GB-Karte
    # und die Messung stirbt mit CUDA out of memory.
    try:
        del trainer
        del modell
        gc.collect()
        if cuda:
            torch.cuda.empty_cache()
            torch.cuda.reset_peak_memory_stats()
            status.setze(schritt="vram_freigegeben",
                         vramBelegtMiB=int(torch.cuda.memory_allocated() // (1024 * 1024)))
    except Exception as fehler:  # noqa: BLE001 — Aufraeumen darf den Lauf nie kippen
        status.setze(schritt="vram_freigeben_fehler", hinweis=str(fehler)[:120])
    # Ein Lauf, der keinen einzigen neuen Schritt gemacht hat, ist kein Training.
    # Das gehoert ins Ergebnis, nicht in die Fussnote.
    neue_schritte = schritte - (letzter or 0)
    return {"adapterPfad": adapter_pfad, "globalStep": schritte, "neueSchritte": neue_schritte,
            "ohneNeueSchritte": neue_schritte <= 0, "zwischenstandKennung": kennung,
            "trainLoss": getattr(ergebnis, "training_loss", None), "sekunden": round(dauer),
            "beispiele": len(beispiele), "abgebrochen": abbruch_gewuenscht, "zielModule": ziele}
