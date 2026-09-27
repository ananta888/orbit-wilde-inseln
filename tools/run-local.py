"""Start the game with explicitly selected, ignored local service configuration."""
import os
from pathlib import Path
from orbit_server.configuration import load_environment
from orbit_server.paths import ROOT


def main() -> None:
    load_environment(Path(os.environ.get("ORBIT_RUNTIME_CONFIG", ROOT / ".local/runtime.json")))
    os.chdir(ROOT)
    from orbit_server.__main__ import main as serve
    serve()


if __name__ == "__main__":
    main()
