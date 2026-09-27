# Diagnosepfade

Alle Browserprogramme erwarten einen separat gestarteten Testserver. `ORBIT_URL` wählt ihn, `CHROMIUM_PATH` optional ein vorhandenes Chromium. Ergebnisse/Screenshots werden nur unter `.local` abgelegt.

| Programm | Abdeckung |
|---|---|
| `check-foundation.mjs` | Vollständige Brückenmission über echte Browser-UI, Inventar, freie Textantwort, Reparatur und Persistenz |
| `check-browser.mjs` | Wildlife-Treffer, Bewegung, Flug/Höhe/Landung, Streaming, Reconnect und Layout |
| `check-xr.mjs` | IWER-VR/MR, Stereokameras, Bogen, Bewegung, Pause/Tracking und optional live editierte Weltkopie |
| `check-mission-xr.mjs` | Explizites Episodenmenü, Controller-Auswahl und Pinch-Eingabe im MR-Modus |
| `check-design.mjs` | Echter Mausstrich, Serverdelta, Undo/Redo, KI-Vorschau mit Blend, Transparenzmalerei, Autosave/Reload |
| `check-design-xr.mjs` | IWER-Stereo, Controller und Hand-Pinch zum Formen, Fokusabbruch, transparenter MR-Modus |
| `check-design-assets.mjs` | Original-Arin, skalierte Bindpose, GLB-Rundlauf mit Skin/Animationen, Offlinejournal über Browserneustart |
| `check-designer-authoring.mjs` | Ebenen, weiche Skin-Gewichte, Pose-Aufzeichnung, Clipwiedergabe, Optimierung/Undo |
| `check-published-creature.mjs` | Veröffentlichen, echter isolierter Probeflug, Rückkehr und gemeinsam genutzte Geometrie mit getrennten Skeletten |
| `check-services.py --run-live` | Opt-in: echte Ananta/Jev-Planung, Piper → Whisper mit erzeugtem Audio, gemeldetes ASR-Gerät |
| `benchmark_design_geometry.py` | Synthetischer Mesh-/SDF-/Hybridvergleich, ausdrücklich keine Quest-Messung |

Die Pinch-Prüfung verwendet synthetische Gelenkpositionen; es ist kein physischer Quest-Handtracking-Test. Reale Headset-Abnahme: `docs/vr/device-checklist.md`. Nutze für Live-Welttests nur eine Kopie (`--world .local/qa-world.json` und `ORBIT_TEST_WORLD=.local/qa-world.json`), nie eine fremde laufende Spielsitzung.
