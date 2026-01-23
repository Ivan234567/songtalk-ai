#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Coqui TTS HTTP Server for Node.js backend
Keeps model in memory for fast synthesis
"""

import sys
import json
import os
import warnings
import re
import time
import hashlib
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import threading

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
    print(f"ERROR: TTS library not installed: {str(e)}. Run: pip install TTS", file=sys.stderr)
    sys.exit(1)

# Global TTS instance cache
_tts_instances = {}
_model_lock = threading.Lock()

def is_english_text(text):
    """Simple check if text is primarily English"""
    if not text or not text.strip():
        return False
    
    total_chars = 0
    latin_chars = 0
    cyrillic_chars = 0
    other_chars = 0
    
    for char in text:
        if char.isalpha():
            total_chars += 1
            if '\u0400' <= char <= '\u04FF':
                cyrillic_chars += 1
            elif char.isascii():
                latin_chars += 1
            else:
                other_chars += 1
    
    if total_chars == 0:
        return True
    
    non_latin_ratio = (cyrillic_chars + other_chars) / total_chars
    return non_latin_ratio < 0.1

def get_tts_instance(model_name, device):
    """Get or create TTS instance (cached in memory)"""
    cache_key = f"{model_name}_{device}"
    
    with _model_lock:
        if cache_key in _tts_instances:
            return _tts_instances[cache_key]
        
        # Create new instance
        print(f"[TTS Server] Loading model: {model_name} on {device}...", file=sys.stderr)
        start_time = time.time()
        tts = TTS(model_name=model_name, progress_bar=False).to(device)
        load_time = time.time() - start_time
        print(f"[TTS Server] Model loaded in {load_time:.2f} seconds", file=sys.stderr)
        
        _tts_instances[cache_key] = tts
        return tts

def synthesize_speech(text, model_name="tts_models/en/ljspeech/tacotron2-DDC", output_dir="tts_output"):
    """Synthesize speech from text using Coqui TTS"""
    try:
        # Create output directory if it doesn't exist
        os.makedirs(output_dir, exist_ok=True)
        
        # Normalize text
        text = text.strip().replace('\n', ' ').replace('\r', ' ').replace('\t', ' ')
        text = re.sub(r'\s+', ' ', text)
        
        # Remove emojis
        emoji_pattern = re.compile(
            "["
            "\U0001F600-\U0001F64F"
            "\U0001F300-\U0001F5FF"
            "\U0001F680-\U0001F6FF"
            "\U0001F1E0-\U0001F1FF"
            "\U00002702-\U000027B0"
            "\U000024C2-\U0001F251"
            "]+", flags=re.UNICODE)
        text = emoji_pattern.sub('', text).strip()
        
        if not text:
            return {
                "success": False,
                "error": "Text is empty after cleaning",
                "audio_path": None,
                "language_unsupported": False
            }
        
        # Check if text is English
        if not is_english_text(text):
            return {
                "success": False,
                "error": "TTS is only available for English text. Please use English language.",
                "audio_path": None,
                "language_unsupported": True
            }
        
        # Limit text length
        max_length = 500
        if len(text) > max_length:
            text = text[:max_length] + "..."
        
        # Generate filename based on text hash
        text_hash = hashlib.md5(text.encode('utf-8')).hexdigest()
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
        print(f"[TTS Server] Cache MISS: Creating new file: {output_filename}", file=sys.stderr)
        start_time = time.time()
        
        # Get device
        device = "cuda" if torch.cuda.is_available() else "cpu"
        
        # Get TTS instance (cached in memory)
        tts = get_tts_instance(model_name, device)
        
        # Synthesize speech
        synth_start = time.time()
        tts.tts_to_file(text=text, file_path=output_path)
        synth_time = time.time() - synth_start
        total_time = time.time() - start_time
        
        print(f"[TTS Server] Synthesis took {synth_time:.2f} seconds (total: {total_time:.2f}s)", file=sys.stderr)
        
        # Check if file was created
        if not os.path.exists(output_path):
            return {
                "success": False,
                "error": "Audio file was not created",
                "audio_path": None
            }
        
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

class TTSRequestHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            response = {
                "status": "ok",
                "service": "Coqui TTS Server",
                "default_model": "tts_models/en/ljspeech/tacotron2-DDC"
            }
            self.wfile.write(json.dumps(response, ensure_ascii=False).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()
    
    def do_POST(self):
        if self.path == '/synthesize':
            try:
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                data = json.loads(post_data.decode('utf-8'))
                
                text = data.get('text', '')
                model_name = data.get('model', 'tts_models/en/ljspeech/tacotron2-DDC')
                output_dir = data.get('output_dir', 'tts_output')
                
                result = synthesize_speech(text, model_name, output_dir)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps(result, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                error_response = {
                    "success": False,
                    "error": str(e),
                    "audio_path": None
                }
                self.wfile.write(json.dumps(error_response).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()
    
    def log_message(self, format, *args):
        # Suppress default logging
        pass

def run_server(port=8765, output_dir="tts_output"):
    """Run TTS HTTP server"""
    server_address = ('localhost', port)
    httpd = HTTPServer(server_address, TTSRequestHandler)
    print(f"[TTS Server] Starting on http://localhost:{port}", file=sys.stderr)
    print(f"[TTS Server] Output directory: {output_dir}", file=sys.stderr)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[TTS Server] Shutting down...", file=sys.stderr)
        httpd.shutdown()

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description='Coqui TTS HTTP Server')
    parser.add_argument('--port', type=int, default=8765, help='Server port (default: 8765)')
    parser.add_argument('--output-dir', type=str, default='tts_output', help='Output directory for audio files')
    args = parser.parse_args()
    
    run_server(args.port, args.output_dir)
