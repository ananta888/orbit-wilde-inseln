# ADR: Mastergeometrie für den ersten Designer

Status: angenommen für den ausführbaren ersten Bearbeitungspfad; eine spätere SDF-Masterentscheidung bleibt evidenzgebunden.

## Vergleich

| Variante | Vorteil | Grenze |
|---|---|---|
| Dreiecksmesh | Direkte Three.js-Darstellung, stabile Vertex-Deltas, offene Flügelmembranen | Große Verformung verschlechtert die Topologie |
| Voxel/SDF | Intuitive Addition/Subtraktion und organische Volumen | Auflösung, dünne Flächen, Remesh- und Attributtransferkosten |
| Hybrid | Volumenwerkzeuge plus optimierte Darstellung | Zwei Repräsentationen müssen Masken, Semantik und Revisionen konsistent erhalten |

Entscheidung: kanonisches Dreiecksmesh mit semantischen Regionen; NumPy für lokale Formung, Manifold für explizite geschlossene Volumenoperationen. Ein SDF-Forschungsadapter darf einen Kandidaten liefern, ersetzt aber noch nicht den Master. Die kleine Benchmark-Fixture reicht nicht für eine universelle SDF-Entscheidung.

## Gewählte Bibliotheken

Bestehendes Three.js 0.186.1 (MIT), three-mesh-bvh 0.9.15 (MIT), NumPy 2.3.5 (BSD-3-Clause), trimesh 5.1.0 (MIT), manifold3d 3.5.4 (Apache-2.0). Versionen sind im Paketmanifest festgehalten; Lizenznachweise stehen in [THIRD_PARTY](../../../THIRD_PARTY.md). Diese Komponenten behalten ihre Lizenzen.

Three.js-eigene GLTFLoader/GLTFExporter liefern GLB, kein eigener Binärmodellstandard. Blender bleibt optionales künftiges Offline-Tool. OpenVDB, libigl, Open3D, PyMeshLab und CGAL wurden nicht als Pflichtabhängigkeiten übernommen. Insbesondere paketabhängige GPL/LGPL-Teile werden nicht pauschal als BSD-kompatibel erklärt.

Ein austauschbares GeometryBackend muss validierte Kandidaten zurückgeben, ohne Livezustand zu verändern. Der erste Worker ruft den konkreten Triangle-Backend direkt auf; vollständige Laufzeit-Injektion weiterer Backends bleibt ein Trackpunkt.
