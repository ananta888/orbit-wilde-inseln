# Diagnosepfade

Alle Browserprogramme erwarten einen separat gestarteten Testserver. `ORBIT_URL` wählt ihn, `CHROMIUM_PATH` optional ein vorhandenes Chromium. Ergebnisse/Screenshots werden nur unter `.local` abgelegt.

| Programm | Abdeckung |
|---|---|
| `check-foundation.mjs` | Vollständige Brückenmission über echte Browser-UI, Inventar, freie Textantwort, Reparatur und Persistenz |
| `check-browser.mjs` | Wildlife-Treffer, Bewegung, Flug/Höhe/Landung, Streaming, Reconnect und Layout |
| `check-xr.mjs` | IWER-VR/MR, Stereokameras, Bogen, Bewegung, Pause/Tracking und optional live editierte Weltkopie |
| `check-mission-xr.mjs` | Explizites Episodenmenü, Controller-Auswahl und Pinch-Eingabe im MR-Modus |

Die Pinch-Prüfung verwendet synthetische Gelenkpositionen; es ist kein physischer Quest-Handtracking-Test. Reale Headset-Abnahme: `docs/vr/device-checklist.md`. Nutze für Live-Welttests nur eine Kopie (`--world .local/qa-world.json` und `ORBIT_TEST_WORLD=.local/qa-world.json`), nie eine fremde laufende Spielsitzung.
