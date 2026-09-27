# Rig, Pose und Arin

`weighted-semantic-chains` baut ein kontrolliertes Skelett aus semantischen Regionen: Rumpf, Hals, Kopf und angeschlossene Teile; Flügel, Gliedmaßen und Schwanz erhalten nach Budget weitere Biegegelenke. Vier Gewichtsslots pro Vertex mischen den Hauptknochen, die Spitze und am Ansatz den Elternknochen. Die Bindpose bleibt in kanonischen Metern; Miniaturansichten verändern die Darstellung, nicht die Gewichte.

Das ist ein deterministisches semantisches Rig, kein anatomisch universelles Auto-Rig. Bis zu 128 Knochen und vier Einflüsse sind erlaubt. Unbekannte Knochen, negative/nichtendliche/nichtnormalisierte Gewichte und fehlerhafte Hierarchien werden verworfen.

```json
{"tool":"pose","bone":"head","rotation":[0,0.2,0]}
```

Gewichtsmalerei verwendet Auswahl, Radius, Masken, Sperren und dieselbe Undo-Transaktion wie Sculpting. `joint_limits` setzt symmetrische Grenzen. `ik` bewegt bis zu vier Elterngelenke mit begrenzter deterministischer Iteration zu einem Ziel in Assetkoordinaten; ein unerreichbares Ziel ist keine Garantie einer passenden Pose. Gelenkwinkel bleiben innerhalb der Grenzen.

```json
{"tool":"ik","bone":"left_wing_tip","position":[-1.5,1.6,0]}
```

Unter „Pose & Vorschau“ Gelenk wählen, Pose einstellen, Keyframezeit setzen und „Pose aufnehmen“. Mindestens zwei Zeitpunkte lassen sich als benannter Clip speichern. Jeder Clip enthält bis zu 512 Bone-/Zeit-/Rotationskeys; doppelte Keys, fehlende Bones und Grenzverletzungen werden abgelehnt. Wiedergabe interpoliert Quaternionen. Eigene Clips bleiben beim Speichern, Optimieren, Veröffentlichen und GLB-Export erhalten.

Der lebende Modus bewegt Kopf, Flügel und Schwanz und lässt Augen blinzeln. Procedural Animation und ein gewählter Clip sind getrennte Pfade. Geometriebearbeitung zeigt die Restpose; stabiles Sculpting erhält Rig/Clips. Allgemeines Remeshing invalidiert sie explizit. Die konservative Meshopt-Optimierung überträgt dagegen die Gewichte der erhaltenen Vertices exakt.

## Sitz, Collider und Probeflug

```json
{"tool":"mount","id":"rider_seat","position":[0,1.6,0],"rotation":[0,0,0],"radius":0.3}
```

„Flug vorbereiten“ erzeugt fehlendes Rig, einen Sitz über dem Rumpf und eine Körperbox; bestehende Marker bleiben erhalten. Der Client richtet das Asset anhand des Sitzes aus, während das reale Kopftracking unabhängig bleibt. Kugel/Kapsel/Box sind validierte Metadaten. Sie ersetzen noch nicht die einfache Terrain-Kollision der Flugruntime. Convex-/Compound-Collider, Knochenbindungen, vollständige Marker-Greifwerkzeuge und Fußkontakte bleiben offen.

Die Editor-Sitzansicht ist ein Vorschauwerkzeug. „Im Spiel testen“ öffnet zusätzlich einen [isolierten echten Probeflug](publication.md). In einer aktiven MR-Session wird künstlicher Flug abgelehnt; MR zuerst ausdrücklich beenden.
