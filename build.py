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
# published sizes (approximate where the vendor is vague).
META = {
    "kokoro": {"name": "Kokoro-82M", "license": "Apache-2.0", "params": "82M"},
    "melotts": {"name": "MeloTTS", "license": "MIT", "params": "~52M"},
    "xtts": {"name": "XTTS-v2", "license": "CPML (non-commercial)", "params": "~470M"},
    "chatterbox_turbo": {"name": "Chatterbox-Turbo", "license": "MIT", "params": "350M"},
    "vibevoice": {"name": "VibeVoice-1.5B", "license": "MIT", "params": "1.5B"},
    "fish": {"name": "OpenAudio S1-mini", "license": "Apache-2.0 (gated)", "params": "0.5B"},
    "piper": {"name": "Piper (lessac-medium)", "license": "MIT", "params": "~20M"},
    "f5tts": {"name": "F5-TTS", "license": "MIT code / CC-BY-NC weights", "params": "336M"},
    "supertonic": {"name": "Supertonic int8", "license": "OpenRAIL-M", "params": "66M"},
    "kittentts": {"name": "KittenTTS nano", "license": "Apache-2.0", "params": "15M"},
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
