# Nachweis des ausführbaren Stands

Die Prüfungen verwenden Python 3.12, Node.js, Chromium/Playwright und für XR IWER. Eine physische Quest war bei dieser Abnahme nicht angeschlossen.

## Open Asset Resolver, 28. September 2026

- Python: 202 Tests und 16 Subtests bestanden, ohne Skips; darin 46 neue Assetprüfungen. JavaScript: 29 Tests, Syntax und lokale Asset-Prüfsummen bestanden. Ruff und Mypy (49 Quelldateien) bestanden. Alle drei Missionspakete validiert und gebaut; beide TODO-Tracks validiert.
- Sicherheits-/Verarbeitungsnachweise: Lizenzmatrix und eingebettete Quelllizenzen, Quarantäne, Schemafehler, ZIP-Traversal/Links/Budgets, private DNS-Adressen, Redirect-Tokenentfernung, Download-/Kompressionslimits, Hashintegrität, Profiltrennung und parallele SQLite-Schreiber. Der tatsächliche Node-Prozess validiert und optimiert die GLB-Fixtures; Skin, Morphs, Clips, LODs und kompatible Rotationszuordnungen werden geprüft. Nicht unterstützte Retargeting-Ziele scheitern sichtbar. Wiederholter Buildexport ist bytegleich.
- Original-Arin wird aus dem unveränderten Inventar mit 32 Bones und vier Clips importiert. Nur ein fehlerhafter optionaler `skin.skeleton`-Hinweis wird unter Warnung entfernt. Eine eigenständige Animationsbibliothek ohne Mesh wird katalogisiert und ihr Clip auf ein explizit kompatibles Ziel übertragen. Materialpakete behalten ihre nicht interpretierten Autorendateien und melden ungenutzte Texturkarten.
- Automatischer Chromium-/IWER-Pfad: Upload → Analyse/Cache → Optimierung → tatsächliche GLB-Vorschau → emuliertes VR → quellengebundene Werkstattkopie → Sculpt/Undo → tatsächliche Spielinstanz. Ein zusätzlicher HTTP-Test sperrt Veröffentlichung und Runtime-Auslieferung nach Änderung der Betreiber-Lizenzpolitik. JavaScript prüft unabhängige Bones, Morphzustände, Materialien und Mixer bei gemeinsam genutzter unveränderlicher Geometrie.
- Bestehende Browserprüfungen: Foundation mit Brückenepisode/Save/Reconnect, Präsenz mit Bodenbegleiter/Handhaltung, alle vier Design-Diagnosen samt Veröffentlichung/Probeflug sowie VR/MR für Spiel und Designer bestanden. IWER prüft Controller/Pinch, Bogen, Flug/Schweben/Landung, Bewegung, Streaming und Fokusabbruch. Dies sind keine Messungen einer physischen Quest.
- **Echte Remote-Diagnosen, getrennt von CI:** Poly Haven `wooden_stool_01`, CC0, vollständig aus dem Browser gesucht, heruntergeladen, optimiert, mit drei Texturen in der Vorschau und als Weltobjekt gerendert. Ergebnis: 7.458 Dreiecke, SHA-256 `d62f0bdb3da040ecf653b98404738a36d78556889f37d9b7398f56249ce669ea`. ambientCG `Bricks105` erfolgreich über die echte API als PBR-Materialpaket importiert und optimiert. Sketchfab-Suche/Lizenzmetadaten geprüft; Downloadadapter automatisiert mit Fixture, kein Live-Download ohne Token behauptet.
- Laufender Dienst: beide persönlichen SQLite-Datenbanken vor Neustart gesichert und Integrität geprüft. Native Windows-Abfragen prüfen das lokale HTTPS-Zertifikat und bestätigen die neue Resolver-API mit acht Provider-Capabilities sowie bytegleiche Auslieferung von Bibliotheksseite, CSS, Clientmodulen und `app.js` auf `https://localhost:8443/`. Die Pipeline meldet hier Linux-Namensräume plus Node-Berechtigungen und tatsächliche Netzwerkisolation.

Screenshots, Remote-Downloads und Testdaten liegen ausschließlich unter `.local`. Die automatisierten Browserprüfungen liefen gegen einen separaten lokalen Server und neue Browserprofile. Der Browser-Screenshot `.local/asset-library-polyhaven-live.png` zeigt die echte texturierte Poly-Haven-Vorschau. Physische Quest-Framerate, tatsächliches Passthrough und neue Ananta-/Mikrofonintegration werden mit diesem Resolver-Test nicht behauptet. Die [unterstützten Import-/Bearbeitungsfähigkeiten und Grenzen](assets/resolver.md) sind maßgeblich.

## Bogengriff und Handhaltung, 28. September 2026

- Griff und Controllerhand teilen einen anatomischen Griffpunkt. Der 29-mm-Griff bleibt außerhalb der Handfläche; Fingerwinkel berücksichtigen die tatsächlichen Gelenklängen. Echtes Handtracking bleibt unverändert und liefert über Handflächengelenke einen getrennten Griffrahmen.
- Python: 156 Tests und 16 Subtests ohne Skips bestanden. JavaScript: 27 Tests, Syntax und Asset-Prüfsummen bestanden. Vier neue Regressionen verwenden beide tatsächlichen Hand-GLBs: Hautabstand einschließlich Dreiecksproben, unveränderte Fingerlängen, gedrehte Griffe und Ablehnung fehlender, degenerierter oder nicht endlicher Trackingdaten. Ruff, Mypy, alle drei Missionspakete und beide TODO-Tracks bestanden.
- Chromium: `npm run test:bow` prüft die integrierten Hand-/Bogenmodule und erstellt Nahaufnahmen beider Hände von Handfläche und Handrücken. Der Präsenztest mit hoher Grafikstufe besteht einschließlich Griffhaltung, Menüwechsel und Arin.
- IWER: Missionsmenü, Controller-/Handauswahl, Handflächenanker und Abbruch bei fehlendem Fingergelenk ohne versehentlichen Schuss bestanden. Der vollständige XR-Lauf besteht für MR und VR einschließlich Bogentreffern, Flug, Landung, Bewegung, Streaming und Fokusabbruch.
- Der XR-Funktionstest verwendet ein kleineres Browserfenster und das Leistungsprofil für SwiftShader. Er wartet auf die tatsächlich verarbeiteten Controllerposen und den Auszug. Der automatische Testschütze berücksichtigt Schwerkraft und Vorhalt anhand aktueller Serversamples. Die normale Testwelt mit bewegten Tieren und die Spielphysik bleiben unverändert; das Spiel erhält keine automatische Zielhilfe. Zuvor verfehlte der Testschütze bei etwa zwei emulierten Bildern pro Sekunde sein Ziel.
- Native Windows-Abfragen an `https://localhost:8443/` bestätigen die bytegenaue Auslieferung von `bow.js`, `input-visuals.js` und `hand-pose.js`. Die laufende Sitzung benötigt zum Laden der neuen Module ein Neuladen der Seite.

Die Browserprüfungen verwenden einen separaten lokalen Server mit isoliertem Spielstand und Offline-Dialogadapter. Screenshots liegen unter `.local/bow-grip-contact.png`. Die reale Quest-Griffhaltung, Haptik und Trackingqualität sind weiterhin physisch zu prüfen; diese Ergebnisse belegen keine Quest-Framerate.

## Arin als Bodenbegleiter, 28. September 2026

- Hauptcheckout: Begleiterbewegung, Originalclips, Blick-/Sprechgesten und Gespräche am Boden, im Flug und in MR integriert. Eigenständige veröffentlichte Kreaturen bleiben unverändert nutzbar.
- Python: vollständiger Lauf mit 156 Tests und 16 Subtests bestanden, ohne übersprungene Tests; Node für den Optimierer explizit über `ORBIT_NODE` ausgewählt. Enthalten sind zwei neue Linux-Sockettests für den WSL-Starthelfer: sofortige Wiederverwendung nach TIME_WAIT und Ablehnung eines weiterhin erreichbaren fremden Listeners.
- JavaScript: 23 Tests mit echtem GLB-Skelett bestanden; Syntax und lokale Asset-Prüfsummen geprüft. Ruff, Mypy, Validierung/Bau aller drei Missionspakete und beide TODO-Tracks bestanden.
- Chromium/Playwright: Foundation, Präsenz, Desktop-Bogen/Flug/Streaming/Reconnect, Werkstattbearbeitung, GLB-Rundlauf, Ebenen/Rig/Optimierung und Veröffentlichung → isolierter Probeflug → Werkstatt bestanden. Der Präsenztest prüft auch Bodengespräch, schmale Menüs, Landung und die unveränderte hohe Grafikstufe.
- IWER-Emulation: Missionsmenü, Controller-/Handauswahl, MR-/VR-Bogentreffer, Flug/Schweben/Landung, Gehen/Streaming, Fokusabbruch sowie Stereo-Werkstatt, Controller-/Pinch-Bearbeitung und MR-Transparenz bestanden. Dies sind keine physischen Quest-Messungen.
- Der Desktop-Maus-/Ballistiktest (`check-browser.mjs`) lief separat mit `rules.targetSpeed = 0`, Leistungsprofil und Pixelverhältnis 0,5. Bewegte Ziele waren bei der niedrigen SwiftShader-Bildrate für diesen Mausablauf nicht zuverlässig treffbar. Bewegte Kollisionen bleiben durch die Python-Tests abgedeckt; die XR-Treffertests liefen mit der normalen Testwelt. Diese funktionalen Tests sind kein GPU- oder Quest-Leistungsnachweis.
- Laufender HTTPS-Dienst: beide vorhandenen SQLite-Datenbanken vor dem Neustart gesichert und ihre Integrität geprüft. Native Windows-Abfragen an `https://localhost:8443/` bestätigen Protokoll 4 und bytegenaue Übereinstimmung von HTML, `app.js`, Begleiterbewegung, Drachenanimation und Dialogmodul. Ein zusätzlicher Chromium-Lauf gegen das weitergeleitete WSL-Backend bestätigt sichtbaren Arin am Boden, vier Originalclips, zwei Hände mit je 25 Gelenken und das geöffnete Gesprächsmenü ohne JavaScript-Fehler.

Die Browserdiagnosen verwenden separate lokale Testdaten und einen Offline-Dialogadapter. Zum Wiederholen der stationären Desktop-Fixture eine Kopie von `content/core/world.json` in einem ignorierten Testordner anlegen, darin `rules.targetSpeed` auf `0` setzen und den Testserver mit `--world <kopie.json> --data-dir <testordner>` starten. `ORBIT_URL` weist auf diesen Testserver; `CHROMIUM_PATH` kann einen vorhandenen Playwright-Browser auswählen. Die normale Spielwelt und bestehende Spielstände werden dabei nicht überschrieben.

Neue physische Quest-, Mikrofon-, Whisper-/GPU-, Ananta-/LLM- oder Piper-Abnahmen gehören nicht zu diesem Lauf. Bildschirmfotos und Sicherungen liegen ausschließlich unter dem ignorierten `.local`-Verzeichnis.

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
