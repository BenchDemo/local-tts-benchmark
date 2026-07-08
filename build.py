#!/usr/bin/env python3
"""Build docs/ from the benchmark's results directory.

Reads ../tts/results/*/metrics.json + ../tts/config/{texts.json,models.toml},
writes docs/data.json and encodes each result wav to docs/audio/<model>/<utt>.mp3
(96k mono, plenty for speech). Re-run after every benchmark/scoring pass; the
site itself is fully static.

    python3 build.py            # uses ../tts
    python3 build.py /path/to/tts
"""
import json
import shutil
import subprocess
import sys
import tomllib
from pathlib import Path

SITE = Path(__file__).resolve().parent
DOCS = SITE / "docs"

# Display metadata the benchmark harness doesn't carry. Params are the
# published sizes (approximate where the vendor is vague). All links
# verified live 2026-07-08.
META = {
    "kokoro": {
        "name": "Kokoro-82M", "license": "Apache-2.0", "params": "82M",
        "vendor": "hexgrad",
        "desc": "A deliberately small model in the StyleTTS2 lineage with an ISTFTNet "
                "vocoder — no diffusion, no autoregression, just a fast feed-forward "
                "pipeline with espeak-ng grapheme-to-phoneme up front. Ships dozens of "
                "stock voices. The benchmark's headline result: best quality AND best "
                "speed at 82M parameters.",
        "github": "https://github.com/hexgrad/kokoro",
        "hf": "https://huggingface.co/hexgrad/Kokoro-82M",
    },
    "melotts": {
        "name": "MeloTTS", "license": "MIT", "params": "~52M",
        "vendor": "MyShell.ai",
        "desc": "VITS-family multilingual model (English, Chinese, Japanese, Korean, "
                "French, Spanish) tuned for CPU real-time use. Fast and light, but its "
                "voices score lowest of the GPU pack here on naturalness, and it fumbles "
                "technical jargon.",
        "github": "https://github.com/myshell-ai/MeloTTS",
        "hf": "https://huggingface.co/myshell-ai/MeloTTS-English",
    },
    "xtts": {
        "name": "XTTS-v2", "license": "CPML (non-commercial)", "params": "~470M",
        "vendor": "Coqui (maintained by Idiap)",
        "desc": "GPT-style autoregressive acoustic model with a HiFi-GAN decoder; "
                "zero-shot voice cloning from ~6 seconds of reference audio across 17 "
                "languages. The original startup shut down — the Idiap fork maintains "
                "the code, and the CPML license bars commercial use.",
        "github": "https://github.com/idiap/coqui-ai-TTS",
        "hf": "https://huggingface.co/coqui/XTTS-v2",
    },
    "chatterbox_turbo": {
        "name": "Chatterbox-Turbo", "license": "MIT", "params": "350M",
        "vendor": "Resemble AI",
        "desc": "Distilled 'turbo' variant of Resemble's open cloning model: a Llama-style "
                "token generator (T3) feeding a CosyVoice-style flow-matching decoder "
                "(S3Gen), with an emotion-exaggeration knob. Every output carries Resemble's "
                "PerTh neural watermark. Best cloning model in this benchmark, and the "
                "intelligibility champion overall.",
        "github": "https://github.com/resemble-ai/chatterbox",
        "hf": "https://huggingface.co/ResembleAI/chatterbox-turbo",
    },
    "vibevoice": {
        "name": "VibeVoice-1.5B", "license": "MIT", "params": "1.5B",
        "vendor": "Microsoft (community fork)",
        "desc": "A Qwen2.5-1.5B language model driving continuous acoustic/semantic "
                "tokenizers and a diffusion decoder head — built for long-form, "
                "multi-speaker audio (podcast-length, up to ~90 minutes). Microsoft "
                "pulled the original release; this community fork keeps it usable. "
                "Slowest model here, and it produced the benchmark's one broken clip.",
        "github": "https://github.com/vibevoice-community/VibeVoice",
        "hf": "https://huggingface.co/vibevoice/VibeVoice-1.5B",
    },
    "fish": {
        "name": "OpenAudio S1-mini", "license": "Apache-2.0 (gated)", "params": "0.5B",
        "vendor": "Fish Audio",
        "desc": "Distilled release of Fish Audio's S1 with dual-autoregressive semantic "
                "token generation and a DAC codec decoder. Weights are license-gated on "
                "Hugging Face — not yet benchmarked here.",
        "github": "https://github.com/fishaudio/fish-speech",
        "hf": "https://huggingface.co/fishaudio/openaudio-s1-mini",
    },
    "piper": {
        "name": "Piper (lessac-medium)", "license": "MIT", "params": "~20M",
        "vendor": "Open Home Foundation / Rhasspy",
        "desc": "VITS exported to ONNX, one compact model per voice — the workhorse of "
                "the Home Assistant ecosystem, built to speak promptly on a Raspberry Pi. "
                "One-second cold start and surprisingly natural for its size.",
        "github": "https://github.com/OHF-Voice/piper1-gpl",
        "hf": "https://huggingface.co/rhasspy/piper-voices",
    },
    "f5tts": {
        "name": "F5-TTS", "license": "MIT code / CC-BY-NC weights", "params": "336M",
        "vendor": "SWivid (SJTU)",
        "desc": "Non-autoregressive flow-matching Diffusion Transformer with ConvNeXt-v2 "
                "text conditioning and 'sway' sampling; clones a voice zero-shot from one "
                "short reference. Strong on calm prose, weak on exclamations, speaks "
                "noticeably slower than its peers — and genuinely cannot read big numbers.",
        "github": "https://github.com/SWivid/F5-TTS",
        "hf": "https://huggingface.co/SWivid/F5-TTS",
    },
    "supertonic": {
        "name": "Supertonic int8", "license": "OpenRAIL-M", "params": "66M",
        "vendor": "Supertone",
        "desc": "Supertone's on-device model, run here as an int8 ONNX export through "
                "sherpa-onnx: text encoder, duration predictor, vector estimator and "
                "vocoder as four small graphs. 0.4-second cold start, 411MB of RAM, "
                "quality that embarrasses models ten times its size.",
        "github": "https://github.com/supertone-inc/supertonic",
        "hf": "https://huggingface.co/Supertone/supertonic",
    },
    "kittentts": {
        "name": "KittenTTS nano", "license": "Apache-2.0", "params": "15M",
        "vendor": "KittenML",
        "desc": "A 15-million-parameter ONNX model — the smallest thing here by far, "
                "phonemized by espeak-ng and runnable on nearly anything. Sounds robotic "
                "(lowest naturalness score) yet articulates the most intelligibly of the "
                "whole field. A fascinating clarity-vs-warmth tradeoff.",
        "github": "https://github.com/KittenML/KittenTTS",
        "hf": "https://huggingface.co/KittenML/kitten-tts-nano-0.1",
    },
}
CLONING = {"xtts", "chatterbox_turbo", "vibevoice", "fish", "f5tts"}


def encode(wav: Path, mp3: Path) -> None:
    mp3.parent.mkdir(parents=True, exist_ok=True)
    if mp3.exists() and mp3.stat().st_mtime >= wav.stat().st_mtime:
        return
    subprocess.check_call(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav),
         "-ac", "1", "-b:a", "96k", str(mp3)]
    )


def main() -> int:
    tts = Path(sys.argv[1]) if len(sys.argv) > 1 else SITE.parent / "tts"
    results = tts / "results"
    texts = json.loads((tts / "config" / "texts.json").read_text())["utterances"]
    labels = {
        name: spec.get("label", name)
        for name, spec in tomllib.loads((tts / "config" / "models.toml").read_text()).items()
    }

    models = []
    for mdir in sorted(results.iterdir()):
        mfile = mdir / "metrics.json"
        if not mfile.exists():
            continue
        m = json.loads(mfile.read_text())
        name = m["model"]
        quality = m.get("quality", {})
        utts = {}
        for u in m.get("utterances", []):
            q = quality.get(u["id"], {})
            utts[u["id"]] = {
                "rtf": u.get("rtf"),
                "audio_s": u.get("audio_s"),
                "error": u.get("error"),
                "wer": q.get("wer"),
                "mos": q.get("mos"),
            }
            wav = mdir / f"{u['id']}.wav"
            if wav.exists() and "error" not in u:
                encode(wav, DOCS / "audio" / name / f"{u['id']}.mp3")
        if not any(v.get("rtf") for v in utts.values()):
            continue  # model never produced audio (e.g. fish: gated weights)
        wers = [v["wer"] for v in utts.values() if v.get("wer") is not None]
        moses = [v["mos"] for v in utts.values() if v.get("mos") is not None]
        # kokoro's adapter reports "auto"; it resolves to CUDA on this rig
        device = {"auto": "cuda"}.get(m.get("device"), m.get("device"))
        models.append({
            "id": name,
            "label": labels.get(name, name),
            "device": device,
            "load_s": m.get("load_s"),
            "rtf_median": m.get("rtf_median"),
            "peak_rss_mb": m.get("peak_rss_mb"),
            "gpu_mem_mb": m.get("gpu_mem_mb"),
            "cloning": name in CLONING,
            "wer": round(sum(wers) / len(wers), 4) if wers else None,
            "mos": round(sum(moses) / len(moses), 3) if moses else None,
            "mos_min": round(min(moses), 3) if moses else None,
            "utterances": utts,
            **META.get(name, {"name": name, "license": "?", "params": "?"}),
        })

    (DOCS / "data.json").write_text(json.dumps({
        "hardware": "NVIDIA RTX 4090 Laptop GPU (16GB) / WSL2 devcontainer",
        "repeat": 10,
        "texts": texts,
        "models": models,
    }, indent=1) + "\n")
    n_audio = len(list((DOCS / "audio").rglob("*.mp3"))) if (DOCS / "audio").exists() else 0
    print(f"data.json: {len(models)} models; audio clips: {n_audio}")
    return 0


if __name__ == "__main__":
    if not shutil.which("ffmpeg"):
        sys.exit("ffmpeg not found")
    sys.exit(main())
