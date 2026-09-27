# Creature-Dokument und Austausch

Bearbeitungsformat: `schema_version: "1.0"`, durch ein lokales Draft-2020-12-Schema und semantische Prüfungen validiert. Dokument-ID, monoton steigende Revision, Meter als Einheit und getrennte Regionen bilden den Kern. Die formale Quelle ist `shared/schemas/design/v1/edit-document.schema.json`.

Eine Region enthält `id`, `part`, `topology_revision`, `solid`, `locked`, Positionen, Dreiecksindizes, Normalen, lineare RGB-Farben, Schutzmaske und vier Oberflächenkanäle. `surface` ist je Vertex `[roughness, metallic, emission, opacity]`. Alle Geometrie-Arrays werden als Float32 beziehungsweise Uint32 übertragen.

Koordinaten: rechtshändig, Y nach oben, X seitlich, die Ausgangskreatur schaut in Richtung -Z. Werkstückansichten skalieren nur die Stage. Das kanonische Asset und Sitzpunkte bleiben in Metern.

`rig`, `clips`, `mount_points`, `colliders`, `layers`, `provenance` und `behaviour_profile` sind getrennte Metadaten. `behaviour_profile` ist eine Referenz, keine ausführbare KI-Logik. Sparse additive Sculpt-/Paint-/Detail-Layer sind versioniert; unbekannte Layerarten werden abgelehnt. Quelle und Lizenz stehen in `provenance`; unbekannte Nutzerdateien werden nicht automatisch als BSD-3-Clause lizenziert.

## GLB

GLB ist das bevorzugte Austauschformat. Orbit exportiert Standardgeometrie, Vertexfarben, Basis-PBR, Skelett, Skin-Gewichte und eigene Animationsclips. Orbit-spezifische Metadaten liegen in standardkonformen `extras.orbitCreature` und `extras.orbitRegion`. Zusätzliche Vertexattribute `_SURFACE`, `_EDITMASK` und `_ORBIT_SKINWEIGHT` erhalten Mal-, Masken- und exakte Float32-Gewichtsdaten beim Orbit-Rundlauf; andere Programme dürfen sie ignorieren. Standard-`WEIGHTS_0` bleibt vorhanden. Three.js normalisiert diese beim Import; Orbit prüft die zusätzliche Gewichtskopie auf maximal 1e-6 Abweichung und stellt die kanonischen Bits wieder her.

Prozedurale Details und räumlich variierende PBR-Kanäle benötigen für visuell identischen Fremdexport noch einen Bake-Schritt. Der GLB-Export ist deshalb kein Nachweis für identische Materialdarstellung in jeder Engine.

Eigene Orbit-GLBs können Geometrie, Materialien, Rig und Metadaten wiederherstellen. Allgemeine fremde GLBs unterstützen im ersten Importprofil statische, nicht texturierte Einzelmaterial-Meshes. Externe URIs, Bilder, erforderliche Erweiterungen sowie fremde Skin-/Morphdaten werden ausdrücklich abgelehnt. Sie werden nicht still gelöscht. JSON ist der vollständige native Sicherungspfad.

Importgrenze im Browser: 16 MiB; serverseitiges Dokument: 24 MiB. Maximal 96 Regionen, 100000 Vertices und 180000 Dreiecke. Jeder Import erzeugt eine neue Asset-ID. Eine ID aus einer Datei kann kein bestehendes Asset überschreiben.

„Modell prüfen“ verwendet `/api/design/assets/{id}/analysis` und zeigt unter anderem degenerierte Dreiecke, offene Kanten, nichtmanifold Kanten und falsche Flächenorientierung. Offene Membranen werden von defekten Volumen unterschieden. `geometry_valid` ist eine Strukturprüfung; `runtime_ready` wird von der allgemeinen Geometrieanalyse nicht zugesichert. Die gesonderte [Veröffentlichung](publication.md) prüft das tatsächliche Spielprofil, Rig, Sitz und Budgets.

Runtime-Artefakte sind als `runtime-creature.schema.json` umgesetzt. Das weitergehende Austauschpaket mit `creature.json`, GLB, separaten Texturen und Vorschaubildern sowie OBJ/STL/USD bleiben Ausbauziele. Der Editor veröffentlicht aktuell kein Asset automatisch in einer Mission.
