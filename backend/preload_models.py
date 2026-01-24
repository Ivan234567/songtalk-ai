#!/usr/bin/env python3
"""
Preload only required models for Whisper and Coqui TTS
This script ensures only small.en (Whisper) and tacotron2-DDC (TTS) are downloaded
"""

import sys
import os

print("[Preload] Starting model preload...", file=sys.stderr)

# Preload Whisper model: small.en
try:
    print("[Preload] Loading Whisper model: small.en...", file=sys.stderr)
    import whisper
    model = whisper.load_model("small.en")
    print("[Preload] ✓ Whisper model 'small.en' loaded successfully", file=sys.stderr)
    del model  # Free memory
except Exception as e:
    print(f"[Preload] ✗ Failed to load Whisper model: {e}", file=sys.stderr)
    sys.exit(1)

# Preload Coqui TTS model: tacotron2-DDC
# NOTE: This is optional - if download fails, model will be loaded on first use
try:
    print("[Preload] Loading Coqui TTS model: tts_models/en/ljspeech/tacotron2-DDC...", file=sys.stderr)
    from TTS.api import TTS
    import torch
    device = "cuda" if torch.cuda.is_available() else "cpu"
    tts = TTS(model_name="tts_models/en/ljspeech/tacotron2-DDC", progress_bar=False).to(device)
    print("[Preload] ✓ Coqui TTS model 'tacotron2-DDC' loaded successfully", file=sys.stderr)
    del tts  # Free memory
except Exception as e:
    print(f"[Preload] ⚠ Warning: Failed to preload Coqui TTS model: {e}", file=sys.stderr)
    print("[Preload] ⚠ Model will be downloaded on first use (this is OK)", file=sys.stderr)
    # Don't exit - this is not critical for build

print("[Preload] ✓ Whisper model preloaded successfully", file=sys.stderr)
print("[Preload] ℹ TTS model will be loaded on first use if not preloaded", file=sys.stderr)

# Clean up any other models from cache (optional, but helps reduce size)
try:
    import shutil
    cache_dirs = [
        os.path.expanduser("~/.cache/whisper"),
        os.path.expanduser("~/.cache/tts"),
        os.path.expanduser("~/.cache/huggingface"),
    ]
    
    for cache_dir in cache_dirs:
        if os.path.exists(cache_dir):
            # List all files/dirs in cache
            items = os.listdir(cache_dir)
            for item in items:
                item_path = os.path.join(cache_dir, item)
                # Keep only small.en for Whisper and tacotron2-DDC for TTS
                if cache_dir.endswith("whisper"):
                    # Keep only small.en related files
                    if "small.en" not in item.lower() and "small_en" not in item.lower():
                        try:
                            if os.path.isdir(item_path):
                                shutil.rmtree(item_path)
                                print(f"[Preload] Removed unused Whisper cache: {item}", file=sys.stderr)
                            else:
                                os.remove(item_path)
                                print(f"[Preload] Removed unused Whisper cache file: {item}", file=sys.stderr)
                        except Exception as e:
                            print(f"[Preload] Could not remove {item_path}: {e}", file=sys.stderr)
                elif cache_dir.endswith("tts") or cache_dir.endswith("huggingface"):
                    # Keep only tacotron2-DDC related files
                    if "tacotron2-ddc" not in item.lower() and "tacotron2_ddc" not in item.lower():
                        try:
                            if os.path.isdir(item_path):
                                shutil.rmtree(item_path)
                                print(f"[Preload] Removed unused TTS cache: {item}", file=sys.stderr)
                            else:
                                os.remove(item_path)
                                print(f"[Preload] Removed unused TTS cache file: {item}", file=sys.stderr)
                        except Exception as e:
                            print(f"[Preload] Could not remove {item_path}: {e}", file=sys.stderr)
except Exception as e:
    print(f"[Preload] Warning: Could not clean cache: {e}", file=sys.stderr)
    # Not critical, continue

print("[Preload] Model preload complete", file=sys.stderr)
