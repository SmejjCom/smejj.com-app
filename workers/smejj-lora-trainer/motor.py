#!/usr/bin/env python3
"""smejj.com LoRA-Trainingsdienst — echtes Training (Single Responsibility: torch/peft).

Wird NUR im Modus 'echt' importiert. Alles hier braucht torch, transformers,
peft und eine CUDA-Karte; der Import steht deshalb bewusst nicht oben in
server.py, sonst koennte der Dienst ohne diese Pakete gar nicht starten — und
genau das braucht der Attrappen-Modus.

WARUM safetensors UND NICHT DIE 9,2-GB-GGUF-DATEI:
Der Auslieferungspfad von smejj-fast-1 ist llama.cpp mit GGUF UD-Q4_K_XL. Auf
einer quantisierten GGUF-Datei laesst sich kein LoRA trainieren — peft und
transformers brauchen die urspruenglichen Gewichte. Trainiert wird deshalb auf
dem safetensors-Stand desselben Modells, und der trainierte Adapter wird danach
fuer die Auslieferung konvertiert.
"""

import os
import time

BASIS_REPO = os.environ.get("SMEJJ_TRAINER_BASIS_REPO", "")
MAX_LAENGE = int(os.environ.get("SMEJJ_TRAINER_MAX_LAENGE", "1024"))
AUSGABE_WURZEL = os.environ.get("SMEJJ_TRAINER_AUSGABE", "/tmp/smejj-lora")


class Motor:
    def __init__(self):
        self.modell = None
        self.zerleger = None

    def lade(self):
        import torch
        from transformers import AutoTokenizer

        if not BASIS_REPO:
            raise RuntimeError("SMEJJ_TRAINER_BASIS_REPO fehlt")

        self.zerleger = AutoTokenizer.from_pretrained(BASIS_REPO)
        if self.zerleger.pad_token is None:
            self.zerleger.pad_token = self.zerleger.eos_token

        # 4-Bit laden spart Platz fuer Aktivierungen und Gradienten. Ein 8B-Modell
        # passt auf einer 24-GB-Karte aber auch in bf16 (rund 16 GB Gewichte, der
        # Rest reicht fuer LoRA), deshalb ist ein Ausfall von bitsandbytes hier
        # kein Grund stillzustehen.
        quantisierung = None
        try:
            from transformers import BitsAndBytesConfig

            quantisierung = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_compute_dtype=torch.bfloat16,
                bnb_4bit_use_double_quant=True,
            )
        except Exception as fehler:  # noqa: BLE001
            # BEWUSST Exception, nicht ImportError: transformers laedt seine
            # Zusatzmodule traege und verpackt jeden Importfehler in ein
            # RuntimeError ("Failed to import transformers.integrations.
            # bitsandbytes ... look up to see its traceback"). Ein
            # `except ImportError` faengt das NICHT — gemessen am 2026-08-03:
            # der Dienst blieb dauerhaft im Zustand 'fehler', obwohl direkt
            # daneben ein tragfaehiger bf16-Weg stand.
            print(
                f"[smejj-lora-trainer] bitsandbytes nicht nutzbar ({str(fehler)[:200]}) "
                "— weiter in bf16 ohne Quantisierung",
                flush=True,
            )

        # DER ERSATZWEG MUSS HIER LIEGEN, NICHT OBEN.
        # BitsAndBytesConfig(...) ist nur ein Datenobjekt und gelingt auch ohne
        # bitsandbytes. Die Bibliothek wird erst INNERHALB von from_pretrained
        # gebraucht (hf_quantizer.validate_environment). Gemessen am 2026-08-03:
        # der Ausfall schlug deshalb an der Konstruktion vorbei und riss das
        # Laden mit — obwohl bf16 daneben tragfaehig gewesen waere.
        try:
            self.modell = self._lade_gewichte(quantisierung, torch)
        except Exception as fehler:  # noqa: BLE001
            if quantisierung is None:
                raise
            # Qwen3-8B braucht in bf16 rund 16 GB. Auf einer 24-GB-Karte bleibt
            # damit genug fuer Aktivierungen und die (winzigen) LoRA-Gradienten.
            # Bei einem deutlich groesseren Basismodell scheitert auch dieser
            # Versuch — dann bleibt der Dienst 'nicht bereit' und der Loop
            # startet keinen Zyklus. Kein stiller Teilbetrieb.
            print(
                f"[smejj-lora-trainer] 4-Bit-Laden fehlgeschlagen ({str(fehler)[:200]}) "
                "— zweiter Versuch in bf16 ohne Quantisierung",
                flush=True,
            )
            self.modell = self._lade_gewichte(None, torch)

        self.modell.eval()
        print(
            f"[smejj-lora-trainer] Modell geladen (dtype={self.modell.dtype})",
            flush=True,
        )

    def _lade_gewichte(self, quantisierung, torch):
        from transformers import AutoModelForCausalLM

        # torch_dtype, NICHT dtype: der Kurzname ist erst in transformers 4.56
        # eingefuehrt worden, gepinnt ist 4.51.3. Dort landet `dtype` unbemerkt
        # in den Konfigurations-kwargs, das Modell kaeme in fp32 (rund 32 GB) und
        # spraengte die 24-GB-Karte — ein Fehler, der wie ein Speicherproblem
        # aussieht und keins ist.
        return AutoModelForCausalLM.from_pretrained(
            BASIS_REPO,
            quantization_config=quantisierung,
            torch_dtype=torch.bfloat16,
            device_map="auto",
        )

    def trainiere(self, auftrag, abbruch=lambda: False):
        import torch
        from peft import LoraConfig, get_peft_model
        from torch.utils.data import DataLoader

        from datenlader import lade_trainingszeilen

        hyper = (auftrag or {}).get("hyperparameter") or {}
        rang = int(hyper.get("loraRang") or 16)
        alpha = int(hyper.get("loraAlpha") or rang * 2)
        lernrate = float(hyper.get("lernrate") or 5e-5)
        epochen = int(hyper.get("epochen") or 1)
        kennung = str((auftrag or {}).get("kennung") or "lauf")

        zeilen = lade_trainingszeilen(
            (auftrag or {}).get("datensatzSchluessel"),
            projekt_anteil=float(hyper.get("projektAnteil") or 0.5),
        )
        if not zeilen:
            # Fail-closed: ohne Daten wird nicht trainiert. Ein Lauf auf einem
            # leeren Datensatz kostet GPU-Zeit und erzeugt einen Adapter, der
            # nichts gelernt hat — schlimmer als kein Adapter, weil er gemessen
            # und moeglicherweise als 'bester Stand' abgelegt wuerde.
            print("[smejj-lora-trainer] keine Trainingszeilen — Abbruch", flush=True)
            return None

        konfiguration = LoraConfig(
            r=rang,
            lora_alpha=alpha,
            lora_dropout=0.05,
            bias="none",
            task_type="CAUSAL_LM",
            target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
        )
        modell = get_peft_model(self.modell, konfiguration)
        modell.train()
        optimierer = torch.optim.AdamW(
            [p for p in modell.parameters() if p.requires_grad], lr=lernrate
        )

        lader = DataLoader(
            zeilen, batch_size=1, shuffle=True, collate_fn=lambda b: self._buendel(b)
        )
        begonnen = time.time()
        for epoche in range(epochen):
            for schritt, buendel in enumerate(lader):
                if abbruch():
                    print("[smejj-lora-trainer] Abbruch waehrend des Trainings", flush=True)
                    return None
                buendel = {k: v.to(modell.device) for k, v in buendel.items()}
                verlust = modell(**buendel).loss
                verlust.backward()
                optimierer.step()
                optimierer.zero_grad()
                if schritt % 50 == 0:
                    print(
                        f"[smejj-lora-trainer] epoche={epoche} schritt={schritt} "
                        f"verlust={float(verlust):.4f} minuten={(time.time()-begonnen)/60:.1f}",
                        flush=True,
                    )

        ziel = os.path.join(AUSGABE_WURZEL, kennung)
        os.makedirs(ziel, exist_ok=True)
        modell.save_pretrained(ziel)
        modell.eval()
        self.modell = modell
        print(f"[smejj-lora-trainer] Adapter abgelegt: {ziel}", flush=True)
        return ziel

    def _buendel(self, batch):
        texte = [
            self.zerleger.apply_chat_template(
                eintrag["messages"], tokenize=False, add_generation_prompt=False
            )
            for eintrag in batch
        ]
        kodiert = self.zerleger(
            texte,
            return_tensors="pt",
            padding=True,
            truncation=True,
            max_length=MAX_LAENGE,
        )
        kodiert["labels"] = kodiert["input_ids"].clone()
        return kodiert

    def antworte(self, nachrichten, max_tokens=512, temperature=0.35):
        import torch

        eingabe = self.zerleger.apply_chat_template(
            nachrichten, tokenize=False, add_generation_prompt=True
        )
        kodiert = self.zerleger(eingabe, return_tensors="pt").to(self.modell.device)
        with torch.no_grad():
            ausgabe = self.modell.generate(
                **kodiert,
                max_new_tokens=max_tokens,
                temperature=max(0.01, temperature),
                do_sample=temperature > 0,
                pad_token_id=self.zerleger.pad_token_id,
            )
        neue = ausgabe[0][kodiert["input_ids"].shape[1]:]
        return self.zerleger.decode(neue, skip_special_tokens=True)
