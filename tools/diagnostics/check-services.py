"""Opt-in real Ananta/Jev + Piper + Whisper test. Uses synthetic speech, retains no audio."""
import argparse
import asyncio
import json
from pathlib import Path
import os
import time

import aiohttp
from orbit_server.configuration import load_environment
from orbit_server.paths import ROOT
from orbit_server.ai.ananta import AnantaAdapter
from orbit_server.design import ai
from orbit_server.design.generation import generate
from orbit_server.design.workers import GeometryWorkers


async def run():
    load_environment(ROOT / ".local/runtime.json")
    report = {"kind": "live-local-services", "physical_quest": False, "checks": {}}
    async with aiohttp.ClientSession() as session:
        adapter = AnantaAdapter(session, os.environ["ORBIT_ANANTA_URL"], Path(os.environ["ORBIT_ANANTA_TOKEN_FILE"]))
        started = time.monotonic()
        answer = json.loads(await adapter.request("decide", data={"context": {"altitude": 20, "speed": 5, "region": "jungle", "creatures": []},
                                                        "message": "Hallo Arin, sind wir bereit für den Flug?", "history": []}, timeout=45))
        report["checks"]["dragon"] = {"ok": bool(answer.get("speech")), "source": answer.get("source"), "milliseconds": round((time.monotonic()-started)*1000)}
        wav = await adapter.request("speak", data={"text": "Hallo Arin. Mach den Kopf etwas größer."}, timeout=45)
        if not wav.startswith(b"RIFF"): raise ValueError("TTS did not return WAV")
        transcript = json.loads(await adapter.request("transcribe", raw=wav, mime="audio/wav", timeout=60))
        report["checks"]["speech"] = {"ok": bool(transcript.get("text")), "device": transcript.get("device"), "fallback": transcript.get("fallback"), "synthetic_audio": True}
        doc = generate("dragon", "live_probe")
        plan, source = await ai.plan(session, doc, ["head"], "Mach den Kopf 20 Prozent größer.")
        workers = GeometryWorkers()
        try: candidate = await workers.run(doc, plan["operations"])
        finally: await workers.close()
        report["checks"]["design"] = {"ok": candidate != doc, "source": source, "tools": [op["tool"] for op in plan["operations"]]}
        spec = await ai.generate_plan(session, "Entwirf einen freundlichen Drachen mit großen Flügeln und zwei Hörnern.")
        generated = generate(spec["generation"]["template"], "generated_probe", spec["generation"]["parameters"])
        report["checks"]["generation"] = {"ok": bool(generated["regions"]), "template": spec["generation"]["template"], "method": "jev-parametric"}
    (ROOT / ".local").mkdir(exist_ok=True)
    (ROOT / ".local/services-verification.json").write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if not all(check["ok"] for check in report["checks"].values()): raise SystemExit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-live", action="store_true", required=True)
    parser.parse_args()
    asyncio.run(run())
