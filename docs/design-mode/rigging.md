# Rig, Pose und Arin

Das erste Rig ist ein kontrollierter Vorschlag aus semantischen Regionen: ein Root und je Region ein Bone im Schwerpunkt. Jeder Vertex erhält vier Gewichtsslots; zunächst ist das Regionsgewicht 1. Diese starre Aufteilung ist sichtbar prüfbar und wird als `semantic-rigid` gemeldet. Sie ersetzt kein anatomisches Auto-Rig.

```json
{"tool":"pose","bone":"head","rotation":[0,0.2,0]}
```

Der Server prüft eindeutige Bone-IDs, topologisch geordnete Eltern, gültige Indizes, endliche Rotationen und normalisierte Gewichte. Posen sind autoritative Commands und Undo-fähig. Die View erzeugt Three.js-SkinnedMeshes; die Bindematrizen berücksichtigen Miniaturansicht und Lebensgröße.

Im lebenden Modus bewegen sich Kopf, Flügel und Schwanz; Augen blinzeln, sofern entsprechende Rig-Bereiche existieren. Statisches Sculpt beendet die lebende Vorschau und zeigt die Restpose. Sculpting mit stabilen Vertex-IDs erhält vorhandene Gewichte und Clips. Ein Topologiewechsel invalidiert sie ausdrücklich, anstatt falsche Skin-Indizes weiterzubenutzen.

Clips bestehen aus ID, Dauer, Loop-Flag und zeitlich zugeordneten Bone-Rotationen. Die View interpoliert Quaternionen. Die erste UI erzeugt eine Flügelbewegung. Weitergehende Clip-Bearbeitung, IK, Constraints, weiche Gewichte und Bewegungsgenerierung benötigen eigene Werkzeuge und Tests.

## Sitz und Kollision

```json
{"tool":"mount","id":"rider_seat","position":[0,1.6,0],"rotation":[0,0,0],"radius":0.3}
```

Sitzpunkte enthalten Position, Orientierung und Kamerafreiraum. Collider sind eigenständige Metadaten für Kugel, Kapsel oder Box. Das Render-Mesh wird nicht automatisch zum Kollisionskörper erklärt. Konvexe/zusammengesetzte Collider, Handkontakte, visueller Mount-Editor und Abnahme gegen die echte Flugphysik sind weitere Tasks.

Die jetzige Sitzansicht verändert nur die Editoransicht; sie ist kein autoritativer Gameplay-Flug. MR lehnt diese künstliche Ansicht ab.
