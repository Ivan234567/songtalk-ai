#!/usr/bin/env python3
"""
Preload only required models for Whisper and Coqui TTS
This script ensures only small.en (Whisper) and tacotron2-DDC (TTS) are downloaded
"""

import sys
import os
import shutil
from pathlib import Path

print("[Preload] Starting model preload...", file=sys.stderr)

# Сначала удаляем ВСЕ существующие модели, чтобы начать с чистого листа
print("[Preload] Cleaning all existing models...", file=sys.stderr)
cache_dirs_to_clean = [
    os.path.expanduser("~/.cache/whisper"),
    os.path.expanduser("~/.cache/tts"),
    os.path.expanduser("~/.cache/huggingface"),
    os.path.expanduser("~/.local/share/tts"),
    os.path.expanduser("~/.local/share/coqui"),
]

for cache_dir in cache_dirs_to_clean:
    if os.path.exists(cache_dir):
        try:
            items = os.listdir(cache_dir)
            for item in items:
                item_path = os.path.join(cache_dir, item)
                try:
                    if os.path.isdir(item_path):
                        shutil.rmtree(item_path)
                        print(f"[Preload] Removed: {item_path}", file=sys.stderr)
                    else:
                        os.remove(item_path)
                        print(f"[Preload] Removed file: {item_path}", file=sys.stderr)
                except Exception as e:
                    print(f"[Preload] Could not remove {item_path}: {e}", file=sys.stderr)
        except Exception as e:
            print(f"[Preload] Could not list {cache_dir}: {e}", file=sys.stderr)

print("[Preload] All existing models cleaned", file=sys.stderr)

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

# Финальная очистка: удаляем все модели, кроме нужных
print("[Preload] Performing final cleanup of unwanted models...", file=sys.stderr)
try:
    for cache_dir in cache_dirs_to_clean:
        if os.path.exists(cache_dir):
            items = os.listdir(cache_dir)
            for item in items:
                item_path = os.path.join(cache_dir, item)
                item_lower = item.lower()
                
                # Проверяем, нужно ли сохранить этот файл/директорию
                keep_item = False
                
                if cache_dir.endswith("whisper"):
                    # Сохраняем только small.en
                    if "small.en" in item_lower or "small_en" in item_lower:
                        keep_item = True
                elif cache_dir.endswith("tts") or cache_dir.endswith("huggingface") or "tts" in cache_dir.lower() or "coqui" in cache_dir.lower():
                    # Сохраняем только tacotron2-DDC
                    if "tacotron2-ddc" in item_lower or "tacotron2_ddc" in item_lower or "tacotron2ddc" in item_lower:
                        keep_item = True
                
                # Удаляем, если не нужно сохранять
                if not keep_item:
                    try:
                        if os.path.isdir(item_path):
                            shutil.rmtree(item_path)
                            print(f"[Preload] Removed unused model: {item_path}", file=sys.stderr)
                        else:
                            os.remove(item_path)
                            print(f"[Preload] Removed unused file: {item_path}", file=sys.stderr)
                    except Exception as e:
                        print(f"[Preload] Could not remove {item_path}: {e}", file=sys.stderr)
except Exception as e:
    print(f"[Preload] Warning: Could not perform final cleanup: {e}", file=sys.stderr)
    # Not critical, continue

# Проверяем размер оставшихся моделей
print("[Preload] Checking final model sizes...", file=sys.stderr)
total_size = 0
for cache_dir in cache_dirs_to_clean:
    if os.path.exists(cache_dir):
        for root, dirs, files in os.walk(cache_dir):
            for file in files:
                file_path = os.path.join(root, file)
                try:
                    total_size += os.path.getsize(file_path)
                except:
                    pass

size_mb = total_size / (1024 * 1024)
print(f"[Preload] Total model cache size: {size_mb:.2f} MB", file=sys.stderr)

print("[Preload] Model preload complete", file=sys.stderr)
