# Softwareprüfung ohne Quest

Stand dieses Implementierungsdurchlaufs: ausführbare erste Kreaturenwerkstatt, noch keine vollständige Creator-Freigabe. Der Nutzer hat ausdrücklich die Fortsetzung ohne angeschlossenes Headset gewünscht.

## Ausgeführt

| Prüfung | Beobachtetes Ergebnis |
|---|---|
| `python -m pytest -q` | 125 Tests und 16 Untertests bestanden |
| Letzter gezielter Geometrie-/Provider-/Netzlauf | 54 Designtests bestanden, einschließlich Rig-Erhalt bei stabilem Sculpting und Schutz fremder Regionen beim Blend |
| `npm test` | Syntaxprüfung und neun JavaScript-Tests bestanden |
| `python -m mypy` | 29 Quelldateien ohne gemeldete Typfehler |
| `python -m ruff check server tests tools` | Bestanden |
| `python tools/validate_todos.py` | Core-Track mit 45 Tasks und Design-Track mit 108 Tasks gültig |
| Content-Validator | Alle drei bestehenden Missionspakete gültig |
| `check-design.mjs` | Echter Mausstrich, Delta, Undo/Redo, halber KI-Vorschlag, transparente Farbe, Save/Reload bestanden |
| `check-design-assets.mjs` | Original-Arin, skalierte Bindpose, GLB-Rundlauf einschließlich Skin und Standard-Animation, Offlinebefehl über Browserneustart bestanden |
| `check-design-xr.mjs` | Emuliertes Stereo, Controller-/Hand-Pinch-Sculpt, Servercommit, Fokusabbruch, MR-Transparenz und Ende bestanden |
| `check-foundation.mjs` | Bestehende Brückenmission, Browser-UI, Inventar, freie Antwort, Reparatur, Save/Resume und Mobilansicht bestanden |
| `check-mission-xr.mjs` | Bestehendes Episodenmenü, Controllerwahl, Pinch und stationärer MR-Modus bestanden |
| Dokumentationsprüfung | Fünf JSON-Beispiele gelesen, implementierte Vertragsbeispiele validiert und lokale Links geprüft |

Die Prüfungen liefen unter WSL2 mit Python 3.12.3, Node 24.18.0 und lokal vorhandenem Playwright-Chromium. Die CI ist zusätzlich für Python 3.11/3.12 eingerichtet; ein erfolgreicher lokaler Lauf ist noch kein beobachteter GitHub-Actions-Lauf.

## Grenzen des Nachweises

Kein echtes Quest-Handtracking, keine Passthrough-Kamera, keine WLAN-Latenzmessung, keine echte Mikrofonaufnahme, kein realer Ananta-/Whisper-/Jev- oder eGPU-Aufruf. Die Providerprüfungen verwenden einen deterministischen lokalen Testserver. Nicht implementierte Funktionen werden nicht durch Emulation als fertig erklärt.

Die Geometrieprüfung umfasst unter anderem Masken, symmetrische Verschiebung, Radialüberlappung, native Prozessabbrüche, geschlossene Kurvenvolumen, Vorlagennormalen und Rig-Invalidierung. Der Netztest hält parallel eine echte Gameplay-Sitzung aktiv. Das ist keine vollständige Dauerlast- oder Speicherdruckabnahme.

## Forschung

Die synthetische Kugel/Horn-Fixture ergab auf diesem Host ungefähr 1.6 ms für das Dreiecksboolean, 79.8 ms für SDF-Extraktion und 81.6 ms für SDF-Extraktion plus Meshvereinfachung. Renderbuffer: etwa 23/216/49 kB; Dreiecke: 1286/12024/2726. Diese Werte begründen keine allgemeine Überlegenheit und sind keine Quest-Messung. Reproduktionsskript: `tools/diagnostics/benchmark_design_geometry.py`.

Die offenen Vollausbau-Anforderungen bleiben im [TODO-Track](../../todos/active/todo.vr-ai-creature-designer.json), insbesondere Layer, umfassende Generierung, organisches Rig/IK, LOD-/Bake-Pipeline und Runtime-Publishing. Die [Quellinventur](source-audit.json) hält den konkreten Dateistand dieses Durchlaufs fest.
