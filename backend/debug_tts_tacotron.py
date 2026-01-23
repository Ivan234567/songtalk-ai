import os
from pathlib import Path

from TTS.api import TTS


def main():
    # Явно используем тот же кэш, который мы уже видели
    home = Path.home()
    tts_cache = home / "AppData" / "Local" / "tts"
    os.environ["TTS_HOME"] = str(tts_cache)

    print("TTS_HOME =", os.environ.get("TTS_HOME"))

    model_name = "tts_models/en/ljspeech/tacotron2-DDC"
    print("Loading model:", model_name)

    tts = TTS(model_name)

    out_dir = Path(__file__).resolve().parent.parent / "tts_output"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "debug_tacotron_en.wav"

    print("Synthesizing to:", out_path)
    tts.tts_to_file(text="This is a test of the tacotron two Dee Dee C model.", file_path=str(out_path))

    print("Done, file exists:", out_path.exists(), "size:", out_path.stat().st_size if out_path.exists() else 0)


if __name__ == "__main__":
    main()

