# Orbit – Wilde Inseln

VR und Mixed Reality für Meta Quest 3 und Laptop/PC: Die Quest rendert und verarbeitet Tracking lokal, der Laptop simuliert Welt, Physik, Missionen und optionale Sprach-KI.

Das ausführbare Fundament verbindet tropische Inseln, Bogen, Drachenflug und Planetensicht mit deklarativen Lernabenteuern. Arin begleitet den Spieler; Ananta erscheint als Orakel an besonderen Orten. Nach „Der Bruch“ setzen Entdeckungen ein altes Wissenssystem wieder zusammen.

## Was bereits läuft

- Offene Inselwelt mit 32-m-Chunks, Vegetation, Wasserfällen, Rehen, Wildschweinen und fremden Wesen; neue Regionen und lokale Weltänderungen werden nachgeladen.
- VR und Passthrough-MR als getrennte Modi; lokales Kopftracking, Controller-Bogen, Haptik und Hand-Pinch für Dialog-/Missionsfelder.
- Gehen, Drachenflug, höhenabhängige Beschleunigung, Schweben, Landung und vereinfachte Globusübersicht.
- **Pfeile im Wind:** Wind beobachten, echte ballistische Treffer, bewegtes Finale. **Die verlorene Brücke:** englische Anweisungen, Bohlen sammeln, freie Antwort, Reparatur. **Das Tier am Tempel:** beobachten und über Ablenkung, Seitenpfad oder Umweltinteraktion lösen.
- Geschlossene Paketschemas, Validator, reproduzierbarer Paketbau und atomarer Katalogwechsel mit gebundenen Versionen laufender Missionen.
- Lokale SQLite-Spielstände, Episoden-Resume, Lernbeobachtungen, Arins Erinnerungen, manuelle Fitness-/Schwierigkeitsprofile und Anantas vier Hilfestufen.
- Optionale Ananta-/Jev-, Whisper.cpp- und Piper-Adapter. Ohne externe Dienste bleibt das Spiel ausführbar; Arin verwendet dann als solche gekennzeichnete Autorentexte.

Das ist Version **0.1.0**, ein weiterentwickelbares Fundament. Die drei Episoden sind kompakte Mechanikbeispiele mit einem 15-Minuten-Designziel. Ausproduzierte Abenteuer, hochwertigere Assets, durchgehend sphärische Physik, Raumverständnis und die erneute Abnahme des neuen Checkouts auf echter Quest/780M stehen im [TODO-Track](todos/active/todo.orbit-core-foundation.json).

## Verteilte Berechnung

| Quest 3 | Laptop / PC |
|---|---|
| Stereo-Rendering und WebXR | Autoritativer Spielzustand, Physik und Pfeile |
| Kopf-/Controller-/Hand-Eingaben | Terrain, Tierwelt, Missionen und Lernfortschritt |
| Direkte Bewegungsdarstellung, Passthrough, Audio | Lokale Speicherung, AI-Orchestrierung, ASR/LLM/TTS |

Die Verbindung überträgt Zustände, Inhalte, Eingaben und Audio über HTTPS/WebSockets. WLAN genügt bei erreichbarem Netzwerk; USB-C ist für diesen Pfad nicht nötig. Die Quest rendert selbst. Das Verfahren bündelt die beiden GPUs nicht zu einer gemeinsamen Rendering-GPU.

## Schnellstart

Python 3.11+ und Node.js 22+ installieren. Im Repository:

```sh
python -m venv .venv
# Linux/macOS:
source .venv/bin/activate
# Windows PowerShell stattdessen: .venv\Scripts\Activate.ps1
python -m pip install -c requirements-dev.lock -e '.[dev]'
npm ci
python -m orbit_server --http
```

Desktop-Vorschau: <http://localhost:8443>. Quest benötigt HTTPS; siehe [Verbindung und XR](docs/vr/setup.md).

Desktop: WASD bewegen, F fliegen/landen, Leertaste/Shift Höhe, rechte Maus umsehen, linke Maus Bogen. Quest: links bewegen, rechts drehen/Höhe, A fliegen, X links Episodenmenü. Episode auswählen, Aufgaben nahe am passenden Objekt ausführen. [Bedienung](docs/vr/setup.md) · [Sprache einrichten](docs/ai/speech.md).

## Entwicklung

```sh
python -m pytest
python -m ruff check server tests tools
python -m mypy
python -m orbit_server.missions.cli validate
python tools/validate_todos.py
npm test
```

[Architektur](ARCHITECTURE.md) · [Beitragen](CONTRIBUTING.md) · [Agentenregeln](AGENTS.md) · [Content-Pakete](docs/content-format/specification.md) · [Roadmap](ROADMAP.md) · [TODO-Track](todos/active/todo.orbit-core-foundation.json)

Die Kernmodule liegen in `server/orbit_server`, der XR-Client in `client/webxr/src`, gemeinsame Verträge in `shared`, Episoden in `content/missions`. `AGENTS.md`, ADRs und der validierte TODO-Track beschreiben Zuständigkeiten und Erweiterungspunkte. Tests laufen ohne Headset oder Pflichtmodell; Browser-/XR-Emulation ist von [physischer Abnahme](docs/vr/device-checklist.md) getrennt.

## Lizenz

Projektcode, Beispielmissionen und eigene prozedurale Geometrien: **BSD-3-Clause**, Copyright 2026 Peter Stuiber. Three.js und weitere Abhängigkeiten behalten ihre eigenen Lizenzen. Modelle, Stimmen und Ananta/Piper-Installationen werden nicht mitgeliefert; Details in [THIRD_PARTY.md](THIRD_PARTY.md).
