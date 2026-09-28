"""Per-asset budgets, not promises about headset frame rate."""
PROFILES = {
    "desktop-high": {"triangles": 250000, "textureSize": 4096, "drawCalls": 80, "textureBytes": 256 * 1024**2, "fileBytes": 64 * 1024**2, "ratio": 1.0},
    "desktop-medium": {"triangles": 100000, "textureSize": 2048, "drawCalls": 48, "textureBytes": 128 * 1024**2, "fileBytes": 32 * 1024**2, "ratio": .8},
    "quest3-high": {"triangles": 60000, "textureSize": 2048, "drawCalls": 24, "textureBytes": 64 * 1024**2, "fileBytes": 24 * 1024**2, "ratio": .7},
    "quest3-balanced": {"triangles": 30000, "textureSize": 1024, "drawCalls": 16, "textureBytes": 32 * 1024**2, "fileBytes": 16 * 1024**2, "ratio": .5},
    "quest3-performance": {"triangles": 12000, "textureSize": 512, "drawCalls": 8, "textureBytes": 16 * 1024**2, "fileBytes": 8 * 1024**2, "ratio": .3},
}


def performance(report: dict) -> dict:
    result = {}
    for name, profile in PROFILES.items():
        failures = [label for label, measured, maximum in [
            ("triangles", report["geometry"].get("renderTriangles", report["geometry"]["triangles"]), profile["triangles"]),
            ("drawCalls", report["drawCalls"], profile["drawCalls"]),
            ("textureBytes", report["memory"]["textureBytes"], profile["textureBytes"]),
            ("fileBytes", report["fileBytes"], profile["fileBytes"]),
            ("textureSize", max((max(t["resolution"]) for t in report["textures"]), default=0), profile["textureSize"]),
        ] if measured > maximum]
        result[name] = {"withinBudget": not failures, "exceeded": failures, "estimated": True}
    return result
