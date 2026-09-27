# ADR: Veröffentlichte Kreaturen und konservative Optimierung

Status: angenommen für den implementierten Runtime-Pfad.

## Unveränderliche Spielmodelle

Ein aktiver Editor darf Rig, Sitz und Oberfläche verändern; eine laufende Flugsitzung benötigt einen stabilen Bezug. Daher entsteht beim expliziten Veröffentlichen ein eigenes, profilgebundenes SHA-256-Artefakt mit Quellrevision. SQLite speichert den Master und die Runtime getrennt. Ein isolierter Probeflug verwendet dieselbe GameSession-Physik, unterbindet aber den regulären Save-Lebenszyklus.

Der Client teilt unveränderliche BufferGeometry zwischen Instanzen, jedoch keine Bones, Materialien oder Animationen. Referenzzähler verhindern die Freigabe aktiver Geometrie. Ein kleiner begrenzter Cache ist hier ausreichend; eine generelle Asset-Engine wäre für diesen Pfad eine unnötige zweite Architektur.

## Meshvereinfachung

Die vorhandene Manifold-Vereinfachung ist für geschlossene Volumen nützlich, erhält aber in diesem Editor keine allgemeine Skin-Zuordnung. Drei Alternativen:

| Ansatz | Nutzen | Grenze |
|---|---|---|
| Manifold-Remesh | Geschlossene Boolesche Geometrie | Rig/Clips benötigen nach Topologiewechsel neue Bindung |
| Meshoptimizer | Attributbewusste, indexbasierte Vereinfachung mit Vertex-/Randschutz | Keine automatische UV-/Atlas-/Anatomiereparatur |
| Blender-Offlineschritt | Breite Produktionswerkzeuge | Zusätzliche Installation, Prozess- und Exportverträge |

Gewählt: `meshoptimizer` **1.3.0**, MIT, gepinnt in npm. Die offizielle [JS-API](https://github.com/zeux/meshoptimizer/blob/master/js/README.md) liefert `simplifyWithAttributes`; [Projektbeschreibung](https://meshoptimizer.org/) und mitgelieferte LICENSE wurden geprüft. Ein fester lokaler Node/WASM-Prozess empfängt begrenztes JSON und liefert einen validierten Kandidaten. Content und Modellantworten können weder Programmdatei noch Argumente bestimmen.

Positionsfehler wird in Metern begrenzt. Normalen, Farben, vier Oberflächenkanäle und Skin-Gewichte fließen als Attribute ein. Gesperrte/maskierte Regionen bleiben unverändert, Sitzbereiche werden zusätzlich geschützt. Überlebende Vertices behalten ihre originalen Attribute und Skin-Indizes. Anatomie/Rig/Clips/Sitze werden nicht neu erfunden. Vorschau, Annahme und Undo verwenden den bestehenden Revisionspfad.

Draco/GLB-Kompression, LOD-Ketten, Texturbaking und ein allgemeiner Skin-/Morph-Transfer sind separate zukünftige Schritte. Die Entscheidung behauptet keine vollständige Produktionspipeline und keine gemessene Quest-Framerate.

## GLB-Gewichte

Three.js GLTFLoader normalisiert `WEIGHTS_0`. Bei weichen Float32-Gewichten ändert dies einzelne Bits, obwohl die Pose praktisch gleich bleibt. Eigene Exporte speichern deshalb zusätzlich `_ORBIT_SKINWEIGHT`. Der Import prüft die Übereinstimmung bis 1e-6 und restauriert die exakten kanonischen Werte. Standard-Skinattribute bleiben für andere glTF-Werkzeuge erhalten. Der Rundlauftest vergleicht Objektinhalte unabhängig von JSON-Schlüsselreihenfolge.
