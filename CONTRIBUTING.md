# Beitragen

Beginne mit [AGENTS.md](AGENTS.md), [Architektur](ARCHITECTURE.md) und dem [TODO-Track](todos/active/todo.orbit-core-foundation.json). Wähle einen klar abgegrenzten Task und benenne Änderungen an gemeinsamen Verträgen frühzeitig. Client, Simulation, Content, KI und Speicherung sollen unabhängig bearbeitbar bleiben.

## Entwicklung starten

```sh
python -m venv .venv
source .venv/bin/activate
python -m pip install -c requirements-dev.lock -e '.[dev]'
npm ci
python -m orbit_server --http --port 8765
```

Unter PowerShell die Umgebung mit `.venv\Scripts\Activate.ps1` aktivieren. Starte aus dem Checkout; ein isoliertes Python-Wheel enthält derzeit nicht die Web-/Content-Verzeichnisse. `ORBIT_ROOT` kann auf einen separaten vollständigen Checkout zeigen. Es gibt keinen zusätzlichen Bundler und zur Laufzeit kein CDN.

## Prüfungen

```sh
python -m pytest
python -m ruff check server tests tools
python -m mypy
python -m orbit_server.missions.cli validate
python -m orbit_server.missions.cli build
python tools/validate_todos.py
npm test
npx playwright install chromium
# bei laufendem Testserver auf Port 8765:
npm run test:browser
```

`ORBIT_URL` und optional `CHROMIUM_PATH` wählen Server und Browser für Diagnostik. `npm run test:game` prüft zusätzliche Bewegungs-/Flugfälle; `npm run test:xr` verwendet IWER, kein physisches Headset. Beide benötigen `ORBIT_URL`; unter Linux kann Chromium für Software-Rendering SwiftShader verwenden. Test-Screenshots gehören nach `.local/`. Live-Weltänderungen nur gegen eine Kopie mit `ORBIT_TEST_WORLD` und Server-`--world` testen.

Tests verwenden keine privaten Tokens, Sprachmodelle oder externe AI-Dienste. Neue Tests sollen relevantes Verhalten, Grenzfälle oder Invarianten prüfen. Die CI führt Python-Prüfungen auf zwei Versionen und einen eigenen headless Browserpfad aus.

## Änderung abgeben

Code typisieren, Fehlerfälle behandeln, betroffene Vertragsdokumente und TODO aktualisieren. Schemaänderungen benötigen Versionsentscheidung, Beispielcontent und Reject-Tests. Paketinhalte bei jeder semantischen Änderung neu versionieren. Keine `.local`-Daten, Tokens, Zertifikate, Modelle, fremde Stimmen oder private Pfade einchecken.

Vor dem Commit Diff und Dateiliste prüfen und gezielt stagen. Präzise Conventional-Commit-Titel verwenden. Im PR Problem, beobachtbare Änderung und ausgeführte Prüfungen nennen. Hardware-Emulation und reale Quest-Ergebnisse getrennt ausweisen. Beiträge zum Orbit-Code werden unter BSD-3-Clause eingereicht; fremde Assets brauchen dokumentierte Herkunft und passende Weitergaberechte.
