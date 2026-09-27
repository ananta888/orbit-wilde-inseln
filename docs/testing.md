# Nachweis des Foundation-Stands

Die lokale Abnahme verwendet Python 3.12, Chromium/Playwright und IWER. Sie benötigt weder Headset noch Sprachmodelle und enthält keine erfundenen Ananta-Gate-IDs.

- Python: **71 Tests sowie 16 Subtests** bestanden; Schema-/Referenzfehler, Paketgrenzen, Hot-load, alle Missionswege, echte Pfeilkollisionen, Netzwerkgrenzen, Speicherung, Kontext und Speech-Verträge.
- JavaScript: Syntaxprüfung aller Clientmodule und **3 Node-Tests** für Fluggrundlagen und begrenzte/cancelbare Aufnahme bestanden.
- Ruff und Mypy für die konfigurierten Domänenmodule bestanden.
- Drei Pakete validiert und reproduzierbar gebaut; Größen/Hashes stehen in den erzeugten, nicht eingecheckten `dist/packages`-Reports.
- TODO-Track mit 45 Tasks validiert; lokale Dokumentationslinks geprüft.
- Browser: Brückenepisode über die echte Oberfläche einschließlich Inventar, freier Antwort, Reparatur und Wiederherstellung nach Neuladen bestanden.
- Erweiterter Desktop-Browserpfad: Wildtiertreffer, Gehen, Flug/Schweben/Sinken/Landung, Weltstreaming, Mausblick und Reconnect bestanden.
- IWER: MR/VR mit zwei Stereokameras, Bogen, Flug-/Bewegungsgrenzen, Pause/Fokuswechsel und lokalem Tracking bestanden.
- Missions-XR: explizites Menü, Controller-Auswahl, synthetischer direkter Hand-Pinch, keine versehentlichen Pfeile und stationärer MR-Modus bestanden.

Der [erste öffentliche CI-Lauf](https://github.com/ananta888/orbit-wilde-inseln/actions/runs/36344166842) ist auf Python 3.11, Python 3.12 und im Browser vollständig erfolgreich. Die CI unter `.github/workflows/ci.yml` wiederholt Python-Prüfungen auf 3.11/3.12 sowie Browser- und Missions-XR-Tests. Der vollständige Flug-/Bogen-Emulationspfad bleibt zusätzlich lokal aufrufbar. Testprotokolle und Screenshots liegen in `.local` und werden nicht veröffentlicht.

**Noch kein Nachweis:** physische Quest-Lesbarkeit/Framerate, tatsächliches Passthrough-Bild, echte Hand-/Controller-Ergonomie und der vollständige neue Checkout mit 780M-ASR. Dafür gibt es den [Geräteplan](vr/device-checklist.md). Der vorherige lokale Prototyp bleibt unabhängig von diesem neuen Repository bestehen.
