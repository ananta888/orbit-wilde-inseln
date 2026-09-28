"""Providers know catalog APIs; the game does not."""
from .remote import PolyHaven, AmbientCG, Sketchfab
from .links import LinkProvider, LocalProvider

__all__ = ["PolyHaven", "AmbientCG", "Sketchfab", "LinkProvider", "LocalProvider"]
