"""Atomic SQLite revision store with content-addressed, deduplicated array blocks."""
from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
import sqlite3
import threading
import time
import zlib

from .document import Conflict, DesignError, canonical, validate

BLOCK_SIZE = 1024
MAX_HISTORY = 128
MAX_STORE_BYTES = 512 * 1024 * 1024


class Repository:
    def __init__(self, path: str | Path = ":memory:"):
        if str(path) != ":memory:": Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA synchronous=FULL")
        self.lock = threading.RLock()
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS design_blobs(hash TEXT PRIMARY KEY, body BLOB NOT NULL);
            CREATE TABLE IF NOT EXISTS design_assets(
              owner TEXT NOT NULL, id TEXT NOT NULL, revision INTEGER NOT NULL,
              history TEXT NOT NULL, cursor INTEGER NOT NULL, PRIMARY KEY(owner,id));
            CREATE TABLE IF NOT EXISTS design_revisions(
              owner TEXT NOT NULL, id TEXT NOT NULL, revision INTEGER NOT NULL,
              body TEXT NOT NULL, created REAL NOT NULL, PRIMARY KEY(owner,id,revision));
            CREATE TABLE IF NOT EXISTS design_receipts(
              owner TEXT NOT NULL, id TEXT NOT NULL, command TEXT NOT NULL, request_hash TEXT NOT NULL,
              revision INTEGER NOT NULL, PRIMARY KEY(owner,id,command));
        """)

    def close(self):
        with self.lock: self.db.close()

    def _pack(self, value):
        if isinstance(value, list):
            if len(value) > 128 and isinstance(value[0], (float, int)):
                refs = []
                for start in range(0, len(value), BLOCK_SIZE):
                    raw = canonical(value[start:start + BLOCK_SIZE])
                    key = hashlib.sha256(raw).hexdigest()
                    self.db.execute("INSERT OR IGNORE INTO design_blobs VALUES(?,?)", (key, zlib.compress(raw)))
                    refs.append(key)
                return {"$blocks": refs}
            return [self._pack(v) for v in value]
        if isinstance(value, dict): return {k: self._pack(v) for k, v in value.items()}
        return value

    def _unpack(self, value):
        if isinstance(value, dict) and set(value) == {"$blocks"}:
            result = []
            for key in value["$blocks"]:
                row = self.db.execute("SELECT body FROM design_blobs WHERE hash=?", (key,)).fetchone()
                if not row: raise DesignError("Assetbuffer fehlt; letzter Stand bleibt erhalten")
                raw = zlib.decompress(row[0])
                if hashlib.sha256(raw).hexdigest() != key: raise DesignError("Beschädigter Assetbuffer")
                result.extend(json.loads(raw))
            return result
        if isinstance(value, dict): return {k: self._unpack(v) for k, v in value.items()}
        if isinstance(value, list): return [self._unpack(v) for v in value]
        return value

    def list(self, owner):
        with self.lock:
            return [{"id": row[0], "revision": row[1], "name": json.loads(row[2])["name"]} for row in self.db.execute(
                "SELECT a.id,a.revision,r.body FROM design_assets a JOIN design_revisions r "
                "ON a.owner=r.owner AND a.id=r.id AND a.revision=r.revision "
                "WHERE a.owner=? ORDER BY a.rowid DESC LIMIT 100", (owner,))]

    def load(self, owner, ident, revision=None):
        with self.lock:
            asset = self.db.execute("SELECT revision,history,cursor FROM design_assets WHERE owner=? AND id=?", (owner, ident)).fetchone()
            if not asset: raise DesignError("Kreatur nicht gefunden")
            revision = asset[0] if revision is None else revision
            row = self.db.execute("SELECT body FROM design_revisions WHERE owner=? AND id=? AND revision=?",
                                  (owner, ident, revision)).fetchone()
            if not row: raise DesignError("Revision nicht gefunden")
            doc = self._unpack(json.loads(row[0])); validate(doc)
            return doc

    def history_state(self, owner, ident):
        with self.lock:
            row = self.db.execute("SELECT history,cursor FROM design_assets WHERE owner=? AND id=?", (owner, ident)).fetchone()
            if not row: raise DesignError("Kreatur nicht gefunden")
            history = json.loads(row[0])
            return {"undo": row[1], "redo": len(history) - row[1], "labels": [item["label"] for item in history]}

    def receipt(self, owner, ident, command, request_hash):
        with self.lock:
            row = self.db.execute("SELECT request_hash,revision FROM design_receipts WHERE owner=? AND id=? AND command=?",
                                  (owner, ident, command)).fetchone()
            if row and row[0] != request_hash: raise Conflict("Command-ID mit anderem Inhalt wiederverwendet")
            return row[1] if row else None

    def create(self, owner, doc):
        validate(doc)
        with self.lock:
            self.db.execute("BEGIN IMMEDIATE")
            try:
                if len(self.list(owner)) >= 100: raise DesignError("Assetlimit erreicht")
                doc = copy.deepcopy(doc); doc["revision"] = 0
                body = canonical(self._pack(doc)).decode()
                self._budget()
                self.db.execute("INSERT INTO design_assets VALUES(?,?,0,'[]',0)", (owner, doc["id"]))
                self.db.execute("INSERT INTO design_revisions VALUES(?,?,0,?,?)", (owner, doc["id"], body, time.time()))
                self.db.execute("COMMIT")
            except BaseException:
                self.db.execute("ROLLBACK")
                raise
        return doc

    def commit(self, owner, doc, command, request_hash, label, *, history_action=None):
        """Revision CAS, receipt and autosave are one durable database transaction."""
        validate(doc)
        with self.lock:
            self.db.execute("BEGIN IMMEDIATE")
            try:
                receipt = self.receipt(owner, doc["id"], command, request_hash)
                if receipt is not None:
                    self.db.execute("ROLLBACK")
                    return self.load(owner, doc["id"])
                row = self.db.execute("SELECT revision,history,cursor FROM design_assets WHERE owner=? AND id=?",
                                      (owner, doc["id"])).fetchone()
                if not row or row[0] != doc["revision"]: raise Conflict("Revision geändert; Vorschlag erneut prüfen")
                revision, history, cursor = row[0] + 1, json.loads(row[1]), row[2]
                if history_action:
                    if history_action == "undo" and cursor > 0:
                        doc = self.load(owner, doc["id"], history[cursor - 1]["before"]); cursor -= 1
                    elif history_action == "redo" and cursor < len(history):
                        doc = self.load(owner, doc["id"], history[cursor]["after"]); cursor += 1
                    else: raise DesignError("Keine passende Historyoperation")
                else:
                    history = history[:cursor] + [{"before": row[0], "after": revision, "label": label[:80]}]
                    history = history[-MAX_HISTORY:]; cursor = len(history)
                doc = copy.deepcopy(doc); doc["revision"] = revision
                body = canonical(self._pack(doc)).decode()
                self._budget()
                self.db.execute("INSERT INTO design_revisions VALUES(?,?,?,?,?)", (owner, doc["id"], revision, body, time.time()))
                self.db.execute("UPDATE design_assets SET revision=?,history=?,cursor=? WHERE owner=? AND id=?",
                                (revision, json.dumps(history), cursor, owner, doc["id"]))
                self.db.execute("INSERT INTO design_receipts VALUES(?,?,?,?,?)", (owner, doc["id"], command, request_hash, revision))
                self.db.execute("COMMIT")
                return doc
            except BaseException:
                if self.db.in_transaction: self.db.execute("ROLLBACK")
                raise

    def _budget(self):
        size = self.db.execute("SELECT COALESCE(SUM(length(body)),0) FROM design_blobs").fetchone()[0]
        if size > MAX_STORE_BYTES: raise DesignError("Lokaler Assetspeicher voll; bitte exportieren")
