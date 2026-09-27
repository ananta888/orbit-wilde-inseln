"""Explicit local launcher configuration; tests never read it implicitly."""
import json
import os
from pathlib import Path

KEYS = {"ORBIT_ANANTA_URL", "ORBIT_ANANTA_TOKEN_FILE", "ORBIT_DESIGN_AI_URL",
        "ORBIT_DESIGN_AI_TOKEN_FILE", "ORBIT_NODE", "ORBIT_WHISPER_URL",
        "ORBIT_WHISPER_CPU_URL", "ORBIT_PIPER_URL", "ORBIT_HOST", "ORBIT_PORT", "ORBIT_DATA_DIR"}


def load_environment(path: Path) -> None:
    if not path.is_file(): return
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or set(data) - KEYS:
        raise ValueError("Runtime configuration contains unknown keys")
    for key, value in data.items():
        if not isinstance(value, str) or len(value) > 4096 or "\x00" in value:
            raise ValueError("Invalid runtime setting")
        os.environ.setdefault(key, value)
