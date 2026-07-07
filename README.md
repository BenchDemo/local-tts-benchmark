# Local TTS Benchmark — results site

Static results site for a head-to-head benchmark of open-source text-to-speech
models, all run on the same machine (RTX 4090 Laptop GPU, 16GB, WSL2 devcontainer):
speed (real-time factor), cold-start, memory, intelligibility (Whisper WER),
predicted quality (UTMOS22), and listenable output for every model × utterance.

The site is fully static — no models run here. `docs/` is the deployable site
(GitHub Pages serves it from this folder on `main`).

## Regenerating after a benchmark run

```
python3 build.py [path-to-benchmark-project]   # default: ../tts
```

Reads `results/*/metrics.json` + `config/{texts.json,models.toml}` from the
benchmark harness, writes `docs/data.json`, and encodes result wavs to
`docs/audio/<model>/<utterance>.mp3` (ffmpeg required).

## Notes

- Chart colors encode device: amber = GPU (CUDA), steel = CPU. The pair is
  colorblind-validated (Machado ΔE ≈ 95) against the panel surface.
- ◈ marks voice-cloning models; they all clone the same reference clip for
  comparability.
- Some model weights are non-commercial (XTTS-v2 CPML, F5-TTS CC-BY-NC).
  Audio samples are published for evaluation only.
