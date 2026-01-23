#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Coqui TTS synthesis script for Node.js backend
Accepts text as command line argument and returns audio file path
"""

import sys
import json
import os
import warnings
from pathlib import Path
import re

# Set UTF-8 encoding for stdout/stderr (important for Windows)
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# Suppress warnings
warnings.filterwarnings('ignore')

try:
    from TTS.api import TTS
    import torch
except ImportError as e:
    print(json.dumps({
        "success": False,
        "error": f"TTS library not installed: {str(e)}. Run: pip install TTS",
        "audio_path": None
    }))
    sys.exit(1)

# Global cache for TTS models (to avoid reloading on each request)
_tts_cache = {}

def is_english_text(text):
    """
    Simple check if text is primarily English (Latin characters)
    Returns True if text is English, False otherwise
    """
    if not text or not text.strip():
        return False
    
    # Count characters
    total_chars = 0
    latin_chars = 0
    cyrillic_chars = 0
    other_chars = 0
    
    for char in text:
        if char.isalpha():
            total_chars += 1
            # Check for Cyrillic (Russian, etc.)
            if '\u0400' <= char <= '\u04FF':
                cyrillic_chars += 1
            # Check for Latin (English, etc.)
            elif char.isascii():
                latin_chars += 1
            else:
                other_chars += 1
    
    # If no letters, consider it English (numbers, punctuation)
    if total_chars == 0:
        return True
    
    # If more than 10% non-Latin characters, it's not English
    non_latin_ratio = (cyrillic_chars + other_chars) / total_chars
    return non_latin_ratio < 0.1  # Less than 10% non-Latin = English

def synthesize_speech(text, model_name="tts_models/en/ljspeech/tacotron2-DDC", output_dir="tts_output"):
    """
    Synthesize speech from text using Coqui TTS
    
    Args:
        text: Text to synthesize
        model_name: TTS model name (default: fast English model)
        output_dir: Directory to save audio files
    
    Returns:
        dict with synthesis result
    """
    try:
        # Create output directory if it doesn't exist
        os.makedirs(output_dir, exist_ok=True)
        
        # Generate filename based on text hash (for caching)
        import hashlib
        text_hash = hashlib.md5(text.encode('utf-8')).hexdigest()
        # Include model name in hash to avoid conflicts between models
        model_hash = hashlib.md5(model_name.encode('utf-8')).hexdigest()[:8]
        output_filename = f"tts_{model_hash}_{text_hash}.wav"
        output_path = os.path.join(output_dir, output_filename)
        
        # Check if file already exists (cache hit)
        if os.path.exists(output_path):
            file_size = os.path.getsize(output_path)
            return {
                "success": True,
                "audio_path": output_path,
                "file_size": file_size,
                "model": model_name,
                "device": "cached",
                "cached": True
            }
        
        # File doesn't exist, need to synthesize
        # Log cache miss (to stderr to avoid interfering with JSON output)
        import sys
        import time
        start_time = time.time()
        sys.stderr.write(f"[TTS Cache MISS] Creating new file: {output_filename}\n")
        sys.stderr.flush()
        
        # Get device
        device = "cuda" if torch.cuda.is_available() else "cpu"
        sys.stderr.write(f"[TTS] Using device: {device}\n")
        sys.stderr.flush()
        
        # Check if model is already loaded in cache
        cache_key = f"{model_name}_{device}"
        if cache_key in _tts_cache:
            tts = _tts_cache[cache_key]
            sys.stderr.write(f"[TTS] Using cached model (no reload needed)\n")
            sys.stderr.flush()
        else:
            # Initialize TTS (progress_bar=False suppresses most output)
            load_start = time.time()
            sys.stderr.write(f"[TTS] Loading model: {model_name} (this may take 5-10 seconds first time)...\n")
            sys.stderr.flush()
            tts = TTS(model_name=model_name, progress_bar=False).to(device)
            load_time = time.time() - load_start
            sys.stderr.write(f"[TTS] Model loaded in {load_time:.2f} seconds\n")
            sys.stderr.flush()
            # Cache the model
            _tts_cache[cache_key] = tts
        
        # Synthesize speech
        synth_start = time.time()
        tts.tts_to_file(text=text, file_path=output_path)
        synth_time = time.time() - synth_start
        total_time = time.time() - start_time
        sys.stderr.write(f"[TTS] Synthesis took {synth_time:.2f} seconds (total: {total_time:.2f}s)\n")
        sys.stderr.flush()
        
        # Check if file was created
        if not os.path.exists(output_path):
            return {
                "success": False,
                "error": "Audio file was not created",
                "audio_path": None
            }
        
        # Get file size
        file_size = os.path.getsize(output_path)
        
        return {
            "success": True,
            "audio_path": output_path,
            "file_size": file_size,
            "model": model_name,
            "device": device,
            "cached": False
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "audio_path": None
        }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "Missing text argument",
            "audio_path": None
        }))
        sys.exit(1)
    
    text = sys.argv[1]
    # tacotron2-DDC — модель, которая уже полностью скачана локально
    model_name = sys.argv[2] if len(sys.argv) > 2 else "tts_models/en/ljspeech/tacotron2-DDC"
    output_dir = sys.argv[3] if len(sys.argv) > 3 else "tts_output"
    
    # Convert to absolute path if relative
    if not os.path.isabs(output_dir):
        # If relative, make it relative to script directory
        script_dir = os.path.dirname(os.path.abspath(__file__))
        output_dir = os.path.join(script_dir, '..', output_dir)
        output_dir = os.path.normpath(output_dir)
    
    # Normalize text (trim and normalize whitespace) for consistent caching
    text = text.strip().replace('\n', ' ').replace('\r', ' ').replace('\t', ' ')
    # Replace multiple spaces with single space
    import re
    text = re.sub(r'\s+', ' ', text)
    
    if not text or not text.strip():
        print(json.dumps({
            "success": False,
            "error": "Text cannot be empty",
            "audio_path": None
        }))
        sys.exit(1)
    
    # Remove emojis first
    emoji_pattern = re.compile(
        "["
        "\U0001F600-\U0001F64F"  # emoticons
        "\U0001F300-\U0001F5FF"  # symbols & pictographs
        "\U0001F680-\U0001F6FF"  # transport & map symbols
        "\U0001F1E0-\U0001F1FF"  # flags
        "\U00002702-\U000027B0"
        "\U000024C2-\U0001F251"
        "]+", flags=re.UNICODE)
    text = emoji_pattern.sub('', text)  # Remove emojis
    
    # Clean up text
    text = text.strip()
    
    if not text:
        print(json.dumps({
            "success": False,
            "error": "Text is empty after cleaning",
            "audio_path": None,
            "language_unsupported": False
        }))
        sys.exit(1)
    
    # Check if text is English - TTS only supports English
    if not is_english_text(text):
        print(json.dumps({
            "success": False,
            "error": "TTS is only available for English text. Please use English language.",
            "audio_path": None,
            "language_unsupported": True
        }))
        sys.exit(1)
    
    # Limit text length (TTS models have limits)
    max_length = 500
    if len(text) > max_length:
        text = text[:max_length] + "..."
    
    result = synthesize_speech(text, model_name, output_dir)
    
    # Print JSON to stdout (TTS may output model info before this, but we'll parse JSON from Node.js)
    print(json.dumps(result))
    
    # Exit with error code if synthesis failed
    if not result.get("success"):
        sys.exit(1)
