"""Immutable content-addressed bytes and profile-scoped provenance/catalog records."""
from __future__ import annotations
from contextlib import contextmanager
import json
from pathlib import Path
import re
import secrets
import sqlite3
import threading

from .contracts import AssetError, canonical, sha256

HASH = re.compile(r"^[a-f0-9]{64}$")


class AssetStore:
    def __init__(self, root: Path, *, quota: int = 2 * 1024**3):
        self.root, self.quota = root, quota
        self.lock = threading.RLock()
        root.mkdir(parents=True, exist_ok=True)
        for name in ("source", "canonical", "optimized", "thumbnails", "metadata", "licenses", "work"):
            (root / name).mkdir(exist_ok=True)
        self.db = sqlite3.connect(root / "catalog.sqlite3", check_same_thread=False, isolation_level=None)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.executescript("""
          CREATE TABLE IF NOT EXISTS blobs(hash TEXT PRIMARY KEY, kind TEXT NOT NULL, size INTEGER NOT NULL);
          CREATE TABLE IF NOT EXISTS assets(owner TEXT, id TEXT, body BLOB NOT NULL, PRIMARY KEY(owner,id));
          CREATE TABLE IF NOT EXISTS quarantines(owner TEXT,id TEXT,body BLOB NOT NULL,PRIMARY KEY(owner,id));
          CREATE TABLE IF NOT EXISTS placements(owner TEXT PRIMARY KEY,revision INTEGER,body BLOB NOT NULL);
        """)

    def close(self) -> None:
        with self.lock: self.db.close()

    @contextmanager
    def write(self):
        # CLI and server may share a catalog. SQLite, not just the process lock,
        # serializes quota checks and compare-and-swap across those writers.
        with self.lock:
            self.db.execute("BEGIN IMMEDIATE")
            try:
                yield
                self.db.execute("COMMIT")
            except BaseException:
                self.db.execute("ROLLBACK")
                raise

    def put(self, data: bytes, kind: str) -> str:
        if kind not in {"source", "canonical", "optimized", "thumbnails"}: raise AssetError("Blobklasse")
        key = sha256(data)
        with self.write():
            row = self.db.execute("SELECT kind FROM blobs WHERE hash=?", (key,)).fetchone()
            if row:
                self.read(key)  # Do not silently accept a damaged cache entry.
                return key
            used = self.db.execute("SELECT COALESCE(sum(size),0) FROM blobs").fetchone()[0]
            if used + len(data) > self.quota: raise AssetError("Lokaler Assetspeicher ist voll", "quota")
            target = self.root / kind / key
            temp = target.with_name("." + secrets.token_hex(12))
            try:
                temp.write_bytes(data); temp.replace(target)
                self.db.execute("INSERT INTO blobs VALUES(?,?,?)", (key, kind, len(data)))
            finally: temp.unlink(missing_ok=True)
        return key

    def read(self, key: str) -> bytes:
        if not HASH.fullmatch(key): raise AssetError("Ungültiger Asset-Hash")
        with self.lock:
            row = self.db.execute("SELECT kind,size FROM blobs WHERE hash=?", (key,)).fetchone()
            if not row: raise AssetError("Assetdatei nicht gefunden", "not_found")
            path = self.root / row[0] / key
            if path.is_symlink() or not path.is_file() or path.stat().st_size != row[1]:
                raise AssetError("Assetcache beschädigt", "integrity")
            data = path.read_bytes()
            if sha256(data) != key: raise AssetError("Assetprüfsumme stimmt nicht", "integrity")
            return data

    def save(self, owner: str, record: dict, *, quarantine: bool = False) -> dict:
        from .contracts import check
        check("asset", record)
        table = "quarantines" if quarantine else "assets"
        body = canonical(record)
        with self.write():
            existing = self.db.execute(f"SELECT body FROM {table} WHERE owner=? AND id=?", (owner, record["id"])).fetchone()
            if existing:
                # Content IDs include source, policy metadata and transformation parameters.
                return json.loads(existing[0])
            count = self.db.execute(f"SELECT count(*) FROM {table} WHERE owner=?", (owner,)).fetchone()[0]
            size = sum(self.db.execute(f"SELECT COALESCE(sum(length(body)),0) FROM {name} WHERE owner=?", (owner,)).fetchone()[0]
                       for name in ("assets", "quarantines"))
            if count >= 1000 or len(body) > 4 * 1024**2 or size + len(body) > 64 * 1024**2:
                raise AssetError("Assetkatalog voll", "quota")
            self.db.execute(f"INSERT INTO {table} VALUES(?,?,?)", (owner, record["id"], body))
        return record

    def get(self, owner: str, ident: str, *, quarantine: bool = False) -> dict:
        table = "quarantines" if quarantine else "assets"
        with self.lock:
            row = self.db.execute(f"SELECT body FROM {table} WHERE owner=? AND id=?", (owner, ident)).fetchone()
            if not row: raise AssetError("Asset nicht gefunden", "not_found")
            return json.loads(row[0])

    def list(self, owner: str) -> list[dict]:
        with self.lock:
            return [json.loads(row[0]) for row in self.db.execute("SELECT body FROM assets WHERE owner=? ORDER BY id", (owner,))]

    def placements(self, owner: str) -> dict:
        with self.lock:
            row = self.db.execute("SELECT revision,body FROM placements WHERE owner=?", (owner,)).fetchone()
            return {"revision": row[0], "items": json.loads(row[1])} if row else {"revision": 0, "items": []}

    def place(self, owner: str, revision: int, item: dict | None, remove: str | None = None) -> dict:
        with self.write():
            current = self.placements(owner)
            if current["revision"] != revision: raise AssetError("Platzierung veraltet; erneut laden", "conflict")
            items = [p for p in current["items"] if p["id"] != remove]
            if item:
                if len(items) >= 24: raise AssetError("Höchstens 24 zusätzliche Weltobjekte", "budget")
                items.append(item)
            self.db.execute("INSERT OR REPLACE INTO placements VALUES(?,?,?)", (owner, revision + 1, canonical(items)))
            return {"revision": revision + 1, "items": items}
