# Leistung und Budgets

Quest/Browser: Tracking, Stereo-Rendering, Auswahl-BVH, Pinselvorschau, Interaktionszustände und Journal. Laptop: Befehlsvalidierung, Geometrie, geschlossene Volumenoperationen, KI-Planprüfung und SQLite-Revisionen.

Der Renderer benutzt Three.js/WebGL; WebGPU ist keine Pflicht. `three-mesh-bvh` beschleunigt statische Regionen ohne globale Prototype-Patches. Bei stabiler Topologie werden vorhandene Attribute aktualisiert und die BVH neu angepasst. Eine geänderte Region oder ein neues Rig darf Ressourcen ersetzen; unveränderte Regionen müssen nicht vollständig neu aufgebaut werden.

| Grenze | Aktueller Wert |
|---|---|
| Dokument | 24 MiB kanonisches JSON |
| Gesamtgeometrie | 100000 Vertices / 180000 Dreiecke |
| Regionen | 96 |
| Geometrieframe | 8 MiB |
| WS-Steuernachricht | 64 KiB |
| Geometrieaufträge | 2 gleichzeitig / 15 s je Auftrag |
| Design-Sockets | 4 |
| Lokales Journal | 64 Einträge / 1 MiB; UI derzeit ein unbestätigter Befehl |
| History | 128 Schritte |
| Blobstore | 512 MiB |

Das sind technische Obergrenzen, keine Behauptung einer auf Quest erreichten Bildrate. Der Validator warnt zusätzlich oberhalb 60000 Dreiecken. Vor einer Freigabe müssen Framezeit, Draw Calls, Browser-RAM, Roundtrip, Thermik und Akku mit echten Geräten gemessen werden.

## Reproduzierbarer Geometrievergleich

`python tools/diagnostics/benchmark_design_geometry.py` vergleicht Dreiecksboolean, Level-Set/SDF-Rekonstruktion und SDF-Extraktion mit anschließender Meshvereinfachung an einer kleinen Kugel/Horn-Fixture. Ergebnisse benennen Plattform, Volumenfehler, Zeit, Dreiecke und Buffergröße. Das ist keine repräsentative Quest-Leistungsmessung und keine vollständige Bewertung dünner Flügel, Paint oder Rigtransfer.

Native Geometrie läuft in abtrennbaren Prozessen. Ein Timeout beendet den betroffenen Prozess und hält die letzte bestätigte Revision. Ein Prozess pro Auftrag hat Startkosten; eine später wiederverwendbare Worker-Architektur muss dieselben Abbruch- und Speichergrenzen erhalten.

LOD-Erzeugung, progressiver Detailaufbau, Texturatlanten, Meshopt/Draco und automatische Optimierung mit unverändertem Original sind im Track separat vorgesehen. Keine Kompressionsbibliothek wurde ungeprüft hinzugefügt.
