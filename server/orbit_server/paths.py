"""Checkout assets; ORBIT_ROOT supports relocated source distributions."""
import os
from pathlib import Path
ROOT = Path(os.environ.get("ORBIT_ROOT", Path(__file__).resolve().parents[2])).resolve()
