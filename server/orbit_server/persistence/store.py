"""Local SQLite save port with schema validation and atomic versioned writes."""
import json
from pathlib import Path
import sqlite3
import threading
from typing import Any, Protocol

from orbit_server.missions.schema import validate


def new_save() -> dict[str, Any]:
    return {"schema_version": 1, "completed_missions": [], "learning": [], "world": {"discoveries": []},
            "arin": {"memories": [], "relationship": 0},
            "settings": {"fitness": "normal", "difficulty": 2, "adaptive": False},
            "play_style": {"solutions": []}, "abilities": {"body": 0, "skill": 0, "mind": 0},
            "package_versions": {}, "active_mission": None}


def migrate(data: dict[str, Any]) -> dict[str, Any]:
    if data.get("schema_version") != 1:
        raise ValueError("Unsupported save version; preserve the file and use a matching server")
    validate("save", data)
    return data


class SaveStore(Protocol):
    def load(self, profile: str) -> dict[str, Any]: ...
    def save(self, profile: str, state: dict[str, Any]) -> None: ...
    def close(self) -> None: ...


class SQLiteStore:
    def __init__(self, path: Path | str):
        if str(path) != ":memory:": Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(str(path), check_same_thread=False)
        self.lock = threading.RLock()
        self.connection.execute("PRAGMA journal_mode=WAL")
        self.connection.execute("CREATE TABLE IF NOT EXISTS saves (profile TEXT PRIMARY KEY, body TEXT NOT NULL)")
        self.connection.commit()

    def load(self, profile: str) -> dict[str, Any]:
        with self.lock:
            row = self.connection.execute("SELECT body FROM saves WHERE profile=?", (profile,)).fetchone()
        return migrate(json.loads(row[0])) if row else new_save()

    def save(self, profile: str, state: dict[str, Any]) -> None:
        validate("save", state)
        body = json.dumps(state, ensure_ascii=False, allow_nan=False)
        with self.lock, self.connection:
            self.connection.execute("INSERT INTO saves VALUES (?, ?) ON CONFLICT(profile) DO UPDATE SET body=excluded.body", (profile, body))

    def close(self) -> None:
        with self.lock: self.connection.close()
