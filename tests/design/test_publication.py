import copy
import json

import pytest

pytest.importorskip("numpy")
pytest.importorskip("trimesh")
pytest.importorskip("manifold3d")

from orbit_server.design.document import Conflict, DesignError, canonical, digest
from orbit_server.design.generation import generate
from orbit_server.design.geometry import apply
from orbit_server.design.publication import PublicationStore, build_artifact
from orbit_server.design.repository import Repository


@pytest.fixture
def store(tmp_path):
    repository = Repository(tmp_path / "creatures.sqlite3")
    store = PublicationStore(repository)
    doc = apply(generate("dragon", "arin"), {"tool": "prepare_mount"})
    repository.create("alice", doc)
    yield store
    repository.close()


def test_publish_pins_revision_and_preserves_editor_protection(store):
    repo = store.repository
    original = repo.load("alice", "arin")
    original["regions"][0]["mask"][0] = 1.
    original = repo.commit("alice", original, "mask", "mask", "mask")
    asset = store.publish("alice", "arin", 1, activate=True)
    runtime = store.load("alice", asset["hash"])
    assert digest(runtime) == asset["hash"]
    assert runtime["document"]["regions"][0]["mask"][0] == 0
    assert repo.load("alice", "arin")["regions"][0]["mask"][0] == 1
    changed = apply(original, {"tool": "rename", "name": "Arin two"})
    repo.commit("alice", changed, "rename", "rename", "rename")
    assert store.active("alice")["hash"] == asset["hash"]
    assert store.load("alice", asset["hash"])["document"]["name"] == "Arin"


def test_stale_revision_unauthorized_and_unknown_behavior_leave_active_unchanged(store):
    first = store.publish("alice", "arin", 0, activate=True)
    with pytest.raises(Conflict): store.publish("alice", "arin", 8, activate=True)
    with pytest.raises(DesignError): store.load("bob", first["hash"])
    with pytest.raises(DesignError): store.select("bob", first["hash"])
    doc = store.repository.load("alice", "arin")
    doc["behaviour_profile"] = "execute_script"
    store.repository.commit("alice", doc, "change", "change", "behavior")
    with pytest.raises(DesignError): store.publish("alice", "arin", 1, activate=True)
    assert store.active("alice") == first


def test_previous_runtime_can_be_restored_after_edit_and_restart(store):
    first = store.publish("alice", "arin", 0, activate=True)
    doc = store.repository.load("alice", "arin")
    doc["name"] = "New Arin"
    store.repository.commit("alice", doc, "rename", "rename", "rename")
    second = store.publish("alice", "arin", 1, activate=True)
    assert second["hash"] != first["hash"]
    restored = PublicationStore(store.repository)
    assert restored.select("alice", first["hash"]) == first
    assert restored.select("alice", None) is None


@pytest.mark.parametrize("field", ["rig", "mount_points", "colliders", "behaviour_profile"])
def test_mount_requirements_are_validated(field):
    doc = apply(generate("dragon", "arin"), {"tool": "prepare_mount"})
    doc[field] = {"bones": [], "weights": {}} if field == "rig" else "unknown" if field == "behaviour_profile" else []
    with pytest.raises(DesignError): build_artifact(doc)


def test_corrupt_runtime_never_loads(store):
    asset = store.publish("alice", "arin", 0)
    doc = store.load("alice", asset["hash"])
    doc["document"]["name"] = "Corruption"
    store.repository.db.execute("UPDATE runtime_creatures SET body=?", (canonical(doc),))
    with pytest.raises(DesignError, match="beschädigt"): store.load("alice", asset["hash"])


def test_prepare_mount_is_reversible_without_changing_geometry():
    original = generate("dragon", "arin")
    before = copy.deepcopy(original)
    prepared = apply(original, {"tool": "prepare_mount"})
    assert original == before
    assert prepared["regions"] == before["regions"]
    assert prepared["rig"]["bones"] and prepared["mount_points"] and prepared["colliders"]
    assert apply(prepared, {"tool": "prepare_mount"}) == prepared


def test_publication_routes_and_test_flight_do_not_save_game_progress():
    import asyncio
    from aiohttp.test_utils import TestClient, TestServer
    from orbit_server.networking.http import make_app, SERVICE

    async def run():
        app = make_app()
        async with TestClient(TestServer(app)) as client:
            await client.get("/api/design/catalog")
            origin = {"Origin": str(client.make_url("/")).rstrip("/")}
            doc = apply(generate("dragon", "arin"), {"tool": "prepare_mount"})
            result = await client.post("/api/design/import", json=doc, headers=origin)
            ident = (await result.json())["id"]
            body = {"asset_id": ident, "revision": 0, "activate": False}
            assert (await client.post("/api/design/publish", json=body)).status == 403
            result = await client.post("/api/design/publish", json=body, headers=origin)
            assert result.status == 200, await result.text()
            asset = await result.json()
            assert (await (await client.get("/api/creatures/active")).json())["asset"] is None
            raw = await (await client.get(asset["url"])).read()
            assert digest(json.loads(raw)) == asset["hash"]
            socket = await client.ws_connect("/ws?test_asset=" + asset["hash"], headers=origin)
            assert (await socket.receive_json())["type"] == "hello"
            packet = await socket.receive_json()
            assert packet["test_flight"] and packet["asset"] == asset
            await socket.send_json({"type": "start"})
            async with asyncio.timeout(5):
                while True:
                    message = await socket.receive_json()
                    if message["type"] == "state" and message["phase"] == "playing": break
            await socket.close()
            await asyncio.sleep(.05)
            # Temporary flight does not create an ordinary save row.
            assert app[SERVICE].store.connection.execute("SELECT count(*) FROM saves").fetchone()[0] == 0
            # A damaged selected model must not prevent ordinary play. A pinned
            # test flight still fails closed instead of testing another creature.
            result = await client.post("/api/creatures/active", json={"hash": asset["hash"]}, headers=origin)
            assert result.status == 200
            app[SERVICE].publications.repository.db.execute("UPDATE runtime_creatures SET body=?", (b'{}',))
            socket = await client.ws_connect("/ws", headers=origin)
            assert (await socket.receive_json())["type"] == "hello"
            packet = await socket.receive_json()
            assert packet["type"] == "mount_asset" and packet["asset"] is None and packet["error"]
            await socket.close()
            assert (await client.get("/ws?test_asset=" + asset["hash"], headers=origin)).status == 400
    asyncio.run(run())
