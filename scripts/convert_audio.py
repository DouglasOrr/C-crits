import subprocess
import sys
from pathlib import Path

if __name__ == "__main__":
    src = Path("assets/sounds")
    dest = Path("static/sounds")
    dest.mkdir(parents=True, exist_ok=True)
    ok = True
    for file in src.glob("*.mp3"):
        dest_file = dest / file.with_suffix(".ogg").name
        if subprocess.call(
            [
                "ffmpeg",
                "-y",
                "-v",
                "fatal",
                "-i",
                file,
                "-c:a",
                "libvorbis",
                "-q:a",
                "4",
                dest_file,
            ]
        ):
            print(f"Failed to convert {file}")
            ok = False
    sys.exit(0 if ok else 1)
