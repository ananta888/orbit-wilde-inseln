"""Interaction tolerances, no biometric interpretation."""
from dataclasses import dataclass


@dataclass(frozen=True)
class FitnessProfile:
    reach: float
    target_scale: float
    description: str


PROFILES = {
    "seated": FitnessProfile(6.0, 1.4, "Sitzend: alle Aufgaben per Strahl erreichbar"),
    "light": FitnessProfile(5.0, 1.2, "Leicht: kleine Bewegungen"),
    "normal": FitnessProfile(4.0, 1.0, "Normal: frei wählbare Bewegung"),
    "active": FitnessProfile(3.0, 1.0, "Aktiv: näher an Aufgaben herantreten"),
}
