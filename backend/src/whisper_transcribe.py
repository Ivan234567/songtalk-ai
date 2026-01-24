#!/usr/bin/env python3
"""
Whisper transcription script for Node.js backend
Accepts audio file path as command line argument and returns JSON with transcription
"""

import sys
import json
import whisper
import os
import warnings

# Suppress FP16 warning on CPU (this is normal behavior)
warnings.filterwarnings('ignore', message='FP16 is not supported on CPU')

def transcribe_audio(audio_path, model_name="base", language=None):
    """
    Transcribe audio file using Whisper
    
    Args:
        audio_path: Path to audio file
        model_name: Whisper model name (tiny.en, base.en, small.en, medium.en, large-v2.en, large-v3.en)
        Recommended: small.en for production (optimal balance of speed and accuracy)
        language: Language code (e.g., 'en' for English). If None, auto-detect.
    
    Returns:
        dict with transcription result
    """
    try:
        # Load Whisper model
        model = whisper.load_model(model_name)
        
        # Transcribe audio with optional language specification
        transcribe_options = {}
        if language:
            transcribe_options["language"] = language
        
        result = model.transcribe(audio_path, **transcribe_options)
        
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
            "text": None
        }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "Missing audio file path argument"
        }))
        sys.exit(1)
    
    audio_path = sys.argv[1]
    model_name = sys.argv[2] if len(sys.argv) > 2 else "base"
    language = sys.argv[3] if len(sys.argv) > 3 else None  # Optional language parameter
    
    if not os.path.exists(audio_path):
        print(json.dumps({
            "success": False,
            "error": f"Audio file not found: {audio_path}"
        }))
        sys.exit(1)
    
    result = transcribe_audio(audio_path, model_name, language)
    print(json.dumps(result))
    
    # Exit with error code if transcription failed
    if not result.get("success"):
        sys.exit(1)
