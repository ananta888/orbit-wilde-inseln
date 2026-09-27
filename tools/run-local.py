"""Start the game with explicitly selected, ignored local service configuration."""
import os
import sys
from orbit_server.configuration import load_environment
from orbit_server.paths import ROOT

load_environment(ROOT / ".local/runtime.json")
os.chdir(ROOT)
os.execv(sys.executable, [sys.executable, "-m", "orbit_server", *sys.argv[1:]])
