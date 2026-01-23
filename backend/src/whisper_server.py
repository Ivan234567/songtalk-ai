#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Whisper HTTP Server for Node.js backend
Keeps model in memory for fast transcription
"""

import sys
import json
import os
import warnings
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
warnings.filterwarnings('ignore', message='FP16 is not supported on CPU')

try:
    import whisper
except ImportError as e:
    print(f"ERROR: Whisper library not installed: {str(e)}. Run: pip install openai-whisper", file=sys.stderr)
    sys.exit(1)

# Global Whisper model cache
_whisper_models = {}
_model_lock = threading.Lock()

def get_whisper_model(model_name, device=None):
    """Get or create Whisper model instance (cached in memory)"""
    cache_key = model_name
    
    with _model_lock:
        if cache_key in _whisper_models:
            return _whisper_models[cache_key]
        
        # Create new instance
        print(f"[Whisper Server] Loading model: {model_name}...", file=sys.stderr)
        start_time = time.time()
        model = whisper.load_model(model_name, device=device)
        load_time = time.time() - start_time
        print(f"[Whisper Server] Model loaded in {load_time:.2f} seconds", file=sys.stderr)
        
        _whisper_models[cache_key] = model
        return model

def transcribe_audio(audio_path, model_name="tiny.en", language="en"):
    """Transcribe audio file using Whisper (model cached in memory)"""
    try:
        if not os.path.exists(audio_path):
            return {
                "success": False,
                "error": f"Audio file not found: {audio_path}",
                "text": None,
                "language": None
            }
        
        # Get cached model (will load if first time)
        model = get_whisper_model(model_name)
        
        # Transcribe with language specified
        transcribe_options = {"language": language} if language else {}
        
        print(f"[Whisper Server] Transcribing: {audio_path}", file=sys.stderr)
        start_time = time.time()
        result = model.transcribe(audio_path, **transcribe_options)
        transcribe_time = time.time() - start_time
        print(f"[Whisper Server] Transcription took {transcribe_time:.2f} seconds", file=sys.stderr)
        
        detected_language = result.get("language", "unknown")
        
        # Validate: if language was specified, check if detected language matches
        if language and detected_language != language:
            return {
                "success": False,
                "error": f"Detected language '{detected_language}' does not match required language '{language}'. Please speak in English.",
                "text": None,
                "language": detected_language
            }
        
        # Return result
        return {
            "success": True,
            "text": result["text"].strip(),
            "language": detected_language,
            "segments": [
                {
                    "start": seg.get("start", 0),
                    "end": seg.get("end", 0),
                    "text": seg.get("text", "").strip()
                }
                for seg in result.get("segments", [])
            ]
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "text": None,
            "language": None
        }

class WhisperRequestHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/transcribe':
            try:
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                data = json.loads(post_data.decode('utf-8'))
                
                audio_path = data.get('audio_path', '')
                model_name = data.get('model', 'tiny.en')
                language = data.get('language', 'en')
                
                result = transcribe_audio(audio_path, model_name, language)
                
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
                    "text": None,
                    "language": None
                }
                self.wfile.write(json.dumps(error_response).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()
    
    def log_message(self, format, *args):
        # Suppress default logging
        pass

def run_server(port=8766):
    """Run Whisper HTTP server"""
    server_address = ('localhost', port)
    httpd = HTTPServer(server_address, WhisperRequestHandler)
    print(f"[Whisper Server] Starting on http://localhost:{port}", file=sys.stderr)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[Whisper Server] Shutting down...", file=sys.stderr)
        httpd.shutdown()

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description='Whisper HTTP Server')
    parser.add_argument('--port', type=int, default=8766, help='Server port (default: 8766)')
    args = parser.parse_args()
    
    run_server(args.port)
