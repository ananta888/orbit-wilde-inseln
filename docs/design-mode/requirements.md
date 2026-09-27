# Anforderungen und Ausbaufolge

Der vollständige Nutzerauftrag bleibt erhalten. Die erste lauffähige Bearbeitungskette ist ein Zwischenziel; die folgenden Aufgaben beschreiben auch noch offene Funktionen. Der aktuelle Beleg steht jeweils im TODO-Track, nicht im bloßen Vorhandensein einer Schaltfläche.

## Reihenfolge

1. Vorhandene Kreatur → Auswahl → Push/Pull → Serverdelta → Undo → Speichern.
2. Primitive und Volumenoperationen → Malen und Masken → lokale KI-Vorschau.
3. Rig/Gewichte/IK → Pose/Animation → Sitz und Collider → isolierter Flugtest.
4. Optimierte Runtime-Pakete, vollständige XR-Ergonomie und Freigabe auf echten Geräten.

Arbeit ohne Quest ist ausdrücklich fortzusetzen. Hardwareabhängige Abnahmen werden dadurch nicht automatisch erfüllt. Optionale Bilder, OBJ/STL/USD, Blender-Interop und spätere Branches bleiben als solche markiert.

## Quellcodeabgleich, vollständiger Umfang und Integrationsgrenzen

| Task | Anforderung |
|---|---|
| `DM-AUDIT-SOURCE` | Vorhandene Orbit-Grundlagen und fehlende Editor-Systeme erfassen |
| `DM-AUDIT-SCOPE` | Vollständige Anforderungen und Ausbauphasen verbindlich abbilden |
| `DM-AUDIT-COMPAT` | Schnittstellen zum parallel entstehenden Orbit-Fundament stabilisieren |

## Architecture – Rendering, Bibliotheken, Ressourcen und Domänengrenzen

| Task | Anforderung |
|---|---|
| `DM-RESEARCH-FRONTEND` | Three.js, three-mesh-bvh und WebGL/WebGPU-XR-Eignung prüfen |
| `DM-RESEARCH-GEOMETRY-LICENSE` | Server-Geometriebibliotheken nach Version, Lizenz und Wartung vergleichen |
| `DM-RESEARCH-BUDGET` | Prüfbare Budgets für Quest, Framework ohne eGPU und optionale KI festlegen |
| `DM-RESEARCH-PORTS` | Editor-Domäne, Geometrie-Port und Zustandswechsel als ADR definieren |

## Voxel/SDF Evaluation – datenbasierte Entscheidung über die Mastergeometrie

| Task | Anforderung |
|---|---|
| `DM-RESEARCH-REPRESENTATION` | Dynamic Triangle Mesh, Voxel/SDF und Hybrid anhand desselben Szenarios bewerten |

## Semantic Creature Parts – Dokument, Teile, Regionen und Ressourcenbesitz

| Task | Anforderung |
|---|---|
| `DM-DOC-SCHEMA` | Versioniertes CreatureAsset- und EditDocument-Schema erstellen |
| `DM-DOC-COORDINATES` | Physische Einheiten und Editor-/Asset-/Spielkoordinaten festlegen |
| `DM-DOC-PARTS` | Semantische Teile als stabile IDs und Attachments modellieren |
| `DM-DOC-REGIONS` | Regionale Geometrie-IDs, Topologieversionen und Attributkanäle einführen |
| `DM-DOC-OWNERSHIP` | Editierbare Kopien und Lebenszyklus geteilter GPU-Ressourcen absichern |

## Commands, Undo/Redo und konsistente Bearbeitungstransaktionen

| Task | Anforderung |
|---|---|
| `DM-HISTORY-COMMANDS` | Revisionsgebundene Edit-Commands und Transaktionen implementieren |
| `DM-HISTORY-STROKES` | Kontinuierliche Striche zu begrenzten Undo-Einheiten bündeln |
| `DM-HISTORY-TOPOLOGY` | Undo für Remesh, Cut, Merge und Attributwechsel definieren |
| `DM-HISTORY-UI` | Undo/Redo über Controller, Hände und Laptop verfügbar machen |

## Networking – DesignSession, Worker und regionale Geometrieübertragung

| Task | Anforderung |
|---|---|
| `DM-SERVER-SESSION` | Eigenständige autoritative DesignSession mit Asset-Lease einführen |
| `DM-SERVER-WORKERS` | Abbrechbare CPU-/Native-Geometriejobs außerhalb des Eventloops ausführen |
| `DM-NET-CONTRACT` | Separates versioniertes Editor-Control- und Geometrieprotokoll spezifizieren |
| `DM-NET-DELTAS` | Vertex-/Index-Deltas, Dirty Regions und progressive LOD-Updates übertragen |
| `DM-NET-FLOW` | Backpressure, begrenzte Puffer und Wiederaufnahme nach Netzverlust umsetzen |
| `DM-NET-PREDICTION` | Lokale Brush-Vorschau und serverseitige Korrektur ohne Dokumentdrift verbinden |

## XR Workspace – räumlicher Arbeitsplatz, Navigation und Komfort

| Task | Anforderung |
|---|---|
| `DM-XR-SHELL` | Eigenen VR-/MR-Design-Workspace samt Desktop-Begleitung öffnen |
| `DM-XR-NAVIGATION` | Dollhouse, Life Size und ein-/beidhändige Modellnavigation implementieren |
| `DM-XR-TOOL-UI` | Werkzeugpalette, Parameter und Vorschau ergonomisch anordnen |
| `DM-XR-COMFORT` | MR-Arbeitsplatz und zugängliche Editorprofile absichern |

## Hand Interaction – Gesten, Controller und Bereichsauswahl

| Task | Anforderung |
|---|---|
| `DM-XR-INPUT` | Gemeinsame Pointer-/Kontakt-/Grab-Aktionen für Controller und Hände abstrahieren |
| `DM-XR-PINCH` | Zuverlässiges Pinch-Begin/Update/End als erste Handgeste liefern |
| `DM-XR-GESTURES` | Konfigurierbare Pinch-, Faust-, Zeige- und Handflächen-Gesten erkennen |
| `DM-XR-SELECTION-CORE` | Oberflächenkontakt, lokale Region und Schutzmaske für den Vertical Slice liefern |
| `DM-XR-SELECTION` | Masken, Sphere Selection, Grab Region, Lasso und Oberflächenmarkierung umsetzen |
| `DM-XR-REFERENTS` | Sprache, Zeigen, Markierung und Kopfrichtung auf einen Bereich beziehen |
| `DM-XR-FEEDBACK` | Haptik sowie abschaltbares visuelles und akustisches Werkzeugfeedback ergänzen |

## Mesh Pipeline – Importvorbereitung, Remeshing und nichtdestruktive Layer

| Task | Anforderung |
|---|---|
| `DM-PIPELINE-EDITABLE` | Bestehenden Arin oder eine Spielkreatur als unabhängiges EditDocument übernehmen |
| `DM-PIPELINE-BACKEND` | Austauschbares Mesh-/SDF-Backend mit klaren Operationen implementieren |
| `DM-PIPELINE-REMESH` | Lokales Remeshing mit Seams und Attributtransfer umsetzen |
| `DM-PIPELINE-LAYERS` | Base Shape, Sculpt, Detail, Paint, Decals, Rig und Animation getrennt verwalten |
| `DM-PIPELINE-MULTIRES` | Mehrere Bearbeitungsauflösungen mit stabilen Detailbeziehungen anbieten |

## Sculpting – vollständige Werkzeuge mit direkter Oberfläche und Undo

| Task | Anforderung |
|---|---|
| `DM-SCULPT-CORE` | Brush-Kontakt, Falloff, Stärke und lokale Wirkungsgrenze implementieren |
| `DM-SCULPT-PUSH-PULL` | Push und Pull als ersten produktionsnahen Formungsablauf liefern |
| `DM-SCULPT-VOLUME` | Inflate, Deflate, Clay/Add und Remove/Subtract hinzufügen |
| `DM-SCULPT-SMOOTH` | Smooth und Flatten mit erhaltbaren Formgrenzen implementieren |
| `DM-SCULPT-CREASE` | Pinch, Crease und präzisen Cut anbieten |
| `DM-SCULPT-DEFORM` | Grab, Stretch, Bend, Twist, Scale locally und Move region integrieren |
| `DM-SCULPT-SYMMETRY` | X-/Y-/Z- und Radialsymmetrie mit bewusstem Asymmetriemodus implementieren |

## Creature Generation – parametrische Basen, Skizzen und neue Körperteile

| Task | Anforderung |
|---|---|
| `DM-GEN-DRAGON` | Parametrisches Dragon-Template aus vorhandener Arin-Geometrie ableiten |
| `DM-GEN-TEMPLATES` | Quadruped, Humanoid, Bird, Serpent, Insectoid, Fish und Generic ergänzen |
| `DM-GEN-PRIMITIVES` | Primitive und Curve/Tube direkt an Oberflächen platzieren |
| `DM-GEN-ANATOMY` | Körperteilbibliothek für Hörner, Flügel, Augen und weitere organische Formen bauen |
| `DM-GEN-JOIN` | Verbinden, Verschmelzen, Remeshen und Anschluss glätten anbieten |
| `DM-GEN-SKETCH` | Grobe 3D-Skizzen als editierbare Entwurfsquelle anbieten |

## Painting – direktes Oberflächenmalen, Masken und lokale Texturupdates

| Task | Anforderung |
|---|---|
| `DM-PAINT-REPRESENTATION` | Speicherung von Paint, Masken und UV-/Triplanar-/Vertexdaten entscheiden |
| `DM-PAINT-BRUSHES` | Pinsel, Airbrush, Spray und Eraser auf Oberfläche implementieren |
| `DM-PAINT-FILL-GRADIENT` | Fill und Gradient mit semantischen und gemalten Grenzen anbieten |
| `DM-PAINT-SMUDGE-STAMP` | Smudge und Pattern Stamp mit reproduzierbaren Mustern ergänzen |
| `DM-PAINT-AI-MATERIAL` | Lokale KI-Malaufträge in Materialparameter, Masken und Prozeduren übersetzen |

## Materials – PBR, Oberflächendetails und Quest-taugliche Darstellung

| Task | Anforderung |
|---|---|
| `DM-MATERIAL-PBR` | PBR-Kanäle und nachvollziehbare Materialpresets bereitstellen |
| `DM-MATERIAL-DETAILS` | Schuppen, Haut, Federn, Fell, Horn, Narben, Falten, Poren und Panzerdetails planen und rendern |
| `DM-MATERIAL-BAKE` | Normal-/Height-/Decal-Baking und Exportmaterialien ableiten |

## AI Editing – kontrollierte lokale Vorschläge, Sprache und Ananta

| Task | Anforderung |
|---|---|
| `DM-AI-CONTRACT` | Strikte strukturierte Design-Operationen und erlaubte Ziele definieren |
| `DM-AI-CONTEXT` | Begrenzten multimodalen Designkontext und zwingende Schutzmasken aufbauen |
| `DM-AI-GENERATOR` | CreatureGenerator mit parametrischem Fallback und austauschbaren 3D-Providern einführen |
| `DM-AI-ANANTA` | Ananta-Orchestrierung für Designaufträge getrennt vom Drachen-Dialog anbinden |
| `DM-AI-PREVIEW` | Before/After, Accept/Reject, Strength, Blend und Regenerate implementieren |
| `DM-AI-LOCAL-IMPROVE` | Lokale Formverbesserung und KI-Formanbau ausführen |
| `DM-AI-SPEECH` | Natürliche Designbefehle über bestehende Whisper-/Ananta-Pipeline verarbeiten |
| `DM-AI-VARIANTS` | Mehrere Kandidaten als räumliche Miniaturvorschauen vergleichen |
| `DM-AI-ORACLE` | Ananta als räumlichen Design-Assistenten am Arbeitstisch integrieren |

## Rigging – kontrolliertes Drachenskelett, Auto-Rig und Gewichte

| Task | Anforderung |
|---|---|
| `DM-RIG-SCHEMA` | Skeleton-, Bone-, Bindpose-, Constraint- und Skinning-Metadaten definieren |
| `DM-RIG-DRAGON` | Kontrolliertes Dragon-Rig für Arin mit stabiler Restpose bauen |
| `DM-RIG-AUTO` | Auto-Rigging-Port mit Typvorschlag, Jointplacement und Qualitätsbericht implementieren |
| `DM-RIG-WEIGHTS` | Skin-Weights erzeugen, prüfen und räumlich korrigieren |
| `DM-RIG-CONSTRAINTS` | IK und Gelenkconstraints mit stabilen Fehlergrenzen vorbereiten und ausführen |

## Pose Mode – direktes Posieren und statischer Sculpt-Zustand

| Task | Anforderung |
|---|---|
| `DM-POSE-HANDS` | Kopf, Beine, Flügel und Schwanz durch direkte Hand-/Controllergriffe posieren |
| `DM-POSE-SCULPT-FREEZE` | Statisches Sculpting und lebende Vorschau konsistent umschalten |

## Animation – lebender Arin, Clip-Authoring und überprüfte KI-Vorschläge

| Task | Anforderung |
|---|---|
| `DM-ANIM-LIVING` | Arin im Editor blinzeln, atmen, schauen und Flügel bewegen lassen |
| `DM-ANIM-CLIPS` | Versionierte Clips für alle zentralen Kreaturenbewegungen vorbereiten |
| `DM-ANIM-AUTHORING` | Einfache Poseaufnahme und Keyframe-Bearbeitung in VR ermöglichen |
| `DM-ANIM-AI` | KI-Clips oder Bewegungsparameter nur als validierte Vorschläge übernehmen |

## Dragon Mount Editing – Sitz, Collider und isolierter Testflug

| Task | Anforderung |
|---|---|
| `DM-MOUNT-POINTS` | Rider Seat, Orientierung, Handkontakte, Sattel und Camera Safe Zone editieren |
| `DM-MOUNT-COLLIDERS` | Einfache Collider unabhängig vom Render-Mesh bearbeiten |
| `DM-MOUNT-TESTFLIGHT` | Design -> Rig Preview -> Reiterposition -> Testflug -> Editor umsetzen |

## Optimization – konfigurierbare Quest-Profile, LOD und validierte Ableitungen

| Task | Anforderung |
|---|---|
| `DM-OPT-ANALYZE` | Creature Validator mit strukturierter Diagnose und Reparaturvorschlägen bauen |
| `DM-OPT-PIPELINE` | 'Für Quest optimieren' als reversible Ableitungspipeline implementieren |
| `DM-OPT-CODECS` | Draco und Meshopt samt Decodierkosten und Lizenzpflichten vergleichen |
| `DM-OPT-RENDER` | LOD, Culling, Instancing und begrenzte GPU-Uploads für den Editor abstimmen |

## Import/Export – Creature-Format, glTF/GLB und Orbit-Laufzeitintegration

| Task | Anforderung |
|---|---|
| `DM-IO-FORMAT` | Creature-Paket mit Standard-GLB und Orbit-Metadaten spezifizieren |
| `DM-IO-GLB` | GLB Import und Export einschließlich Skin, Animation und Morph Targets bereitstellen |
| `DM-IO-RUNTIME` | Gespeicherte CreatureRevision im Orbit-Spiel testbar registrieren |
| `DM-IO-OPTIONAL` | OBJ/STL/USD und optionale Blender-Interop als spätere Adapter planen |

## Persistence – Revisionen, Autosave, Offlinejournal und Crash Recovery

| Task | Anforderung |
|---|---|
| `DM-SAVE-REVISIONS` | Lokalen Creature-Store mit unveränderlichen Revisionen und deduplizierten Blobs implementieren |
| `DM-SAVE-AUTOSAVE` | Autosave, Recovery und Wiederaufnahme angefangener Bearbeitung anbieten |
| `DM-SAVE-OFFLINE` | Begrenztes lokales Commandjournal für WLAN-Abbrüche und erneutes Senden implementieren |
| `DM-SAVE-LIFECYCLE` | Versionmigration, Hashprüfung und sichere Blobbereinigung implementieren |
| `DM-SAVE-BRANCHES` | Spätere Kreaturenvarianten als benannte Branches vorbereiten |

## Testing – Geometrie, KI, Netzwerk, Assets und echte Quest

| Task | Anforderung |
|---|---|
| `DM-TEST-GEOMETRY` | Deterministische Geometrie-, Push/Pull- und Delta-Prüfungen für die Basis aufbauen |
| `DM-TEST-NETWORK` | Revisionskonflikte, Offline-Replay und Lastfälle automatisiert prüfen |
| `DM-TEST-AI-ASSETS` | KI-Masken, Undo und Asset-/Rig-/GLB-Roundtrips prüfen |
| `DM-TEST-XR` | Interaktionszustände, Gesten und Auswahl per XR-Emulation testen |
| `DM-TEST-DEVICE` | Vertical Slice auf physischer Quest 3 abnehmen |
| `DM-TEST-CI` | Design-Prüfungen reproduzierbar in die bestehende CI integrieren |
| `DM-TEST-GEOMETRY-EXTENDED` | Remeshing, vollständige Sculpt-Palette, Symmetrie und Attributtransfer abnehmen |
| `DM-TEST-DEVICE-CREATOR` | Ausgebauten Creator mit Sprache, MR, Rig und Testflug auf Quest abnehmen |

## Documentation – Bedienung, Architektur, Format, Pipeline und Betrieb

| Task | Anforderung |
|---|---|
| `DM-DOCS-MODE` | Geforderte Design-Mode-Dokumentation mit ausführbaren Beispielen schreiben |
| `DM-DOCS-CONTRIBUTING` | Subsystemregeln, Erweiterungsleitfaden und Statusberichterstattung pflegen |

## Vertical Slice und gestufte Freigabe des vollständigen Creature Creators

| Task | Anforderung |
|---|---|
| `DM-GATE-SLICE` | Produktionsnahen Vertical Slice aus bestehendem Mesh auf Quest freigeben |
| `DM-GATE-CREATOR` | Ausbaufolge Add Geometry -> Paint -> AI Local Edit -> Rig -> Animation abnehmen |

