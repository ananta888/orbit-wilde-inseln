# Nachweis des ausführbaren Stands

Die Prüfungen verwenden Python 3.12, Node.js, Chromium/Playwright und für XR IWER. Eine physische Quest war bei dieser Abnahme nicht angeschlossen.

## HTTPS-Start unter Windows, 28. September 2026

- Python: 148 Tests und 16 Subtests im Gesamtlauf bestanden. Ein optionaler Optimierertest wurde wegen fehlendem Node im Shell-PATH übersprungen; danach bestanden beide Optimierertests mit explizitem `ORBIT_NODE`. Damit wurden alle 149 verschiedenen Tests ausgeführt.
- JavaScript: 11 Node-Tests bestanden. Ruff und Mypy bestanden; drei Missionspakete validiert.
- TCP-Weiterleitung: Byteübertragung einschließlich Antwort nach halbem Verbindungsschluss, Verbindungslimit und Shutdown mit echten lokalen Sockets geprüft.
- PowerShell: Parser, echter Hintergrundstart, Wiederverwendung des eigenen WSL-Backends und Ablehnung eines belegten Frontend-Ports geprüft. Der bereits laufende Dienst blieb beim Konflikttest bestehen.
- Native Windows-Chrome-Prüfung über HTTPS mit separaten Testdaten: Ebenen, Formung, Sichtbarkeit, Bake, Rig, Posen, Clips, Optimierung/Vorschau/Undo bestanden. Veröffentlichung → echter Probeflug → Rückkehr zur Werkstatt ebenfalls bestanden.
- Produktiver Windows-Port 8443: Zertifikat mit lokaler CA-Datei geprüft; `/health` meldet `orbit-wilde-inseln` und Protokoll 4. HTML von Spiel/Werkstatt und `/src/app.js` stimmen bytegenau mit dem aktuellen Checkout überein; Gameplay-WebSocket meldet Protokoll 4.
- Lokale Spiel- und Kreaturendatenbanken vor dem Neustart über SQLite-Backup gesichert und geprüft. Der neue Backend-Prozess verwendet weiterhin dieselben WSL-Daten. Der alte lokale Prototyp-Starter wurde gesichert und zum aktuellen Checkout umgeleitet.
- TODO-Tracks: Foundation mit 46 Tasks und Kreaturenwerkstatt mit 108 Tasks validiert.

Die Windows-Weiterleitung überträgt TLS unverändert an die bestehende WSL-Laufzeit. Der native Windows-Spielserver über WSL-Dateipfade wurde wegen deutlicher Verzögerungen unter Browserlast nicht als lokaler Standard übernommen. [ADR](architecture/adr/005-windows-wsl-launch.md).

## Bereits getrennt geprüfte Spiel- und XR-Pfade

Die vorherige Abnahme des unveränderten Spiel-/Designer-Codes umfasst die Brückenepisode samt Resume, Wildtiertreffer, Bewegung, Flug, Weltstreaming, Reconnect sowie IWER-Prüfungen von VR/MR, Stereokameras, Bogen, Controller-Menü und synthetischem Hand-Pinch. [CI des vorherigen Stands](https://github.com/ananta888/orbit-wilde-inseln/actions/runs/36355903347). Die laufende CI prüft Python 3.11/3.12 und Browser-/XR-Pfade erneut.

Die lokale Ananta-/Jev-, Piper- und Whisper-Integration wurde zuvor mit erzeugtem Audio geprüft, einschließlich 780M/Vulkan-ASR. Erzeugtes Audio ist kein Nachweis für das Quest-Mikrofon. Testprotokolle, Datenbanken und Screenshots bleiben in ignorierten Laufzeitordnern.

**Offen:** physische Quest-Lesbarkeit und Framerate, tatsächliches Passthrough-Bild, Hand-/Controller-Ergonomie und echte Quest-Mikrofonaufnahmen. Dafür gibt es den [Geräteplan](vr/device-checklist.md). Die ursprünglichen Prototyp-Dateien bleiben erhalten; ihr bisheriger Startpfad öffnet jetzt das aktuelle Repository.
