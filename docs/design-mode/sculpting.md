# Geometrie und Sculpting

Der erste Master ist ein in Metern gespeichertes Dreiecksmesh mit getrennten semantischen Regionen. Formänderungen benutzen NumPy; geschlossene Boolesche Operationen benutzen Manifold. Die [Entscheidung](../architecture/adr/design-001-editing-foundation.md) bewertet Dreiecke, SDF und Hybrid getrennt.

## Einfluss

Für Abstand `d` und Radius `r` gilt `max(0, 1 - (d/r)^2)^2`. Maske 1 schützt vollständig; Maske 0 erlaubt Bearbeitung. Stärke und Anzahl der Stroke-Samples begrenzen die Gesamtänderung. Push/Pull arbeiten entlang der ursprünglichen Normalen. Grab/Move folgen dem Verschiebevektor; Glätten nutzt Nachbarschaften aus Dreiecken. Alle Resultate werden vor Übernahme validiert.

X/Y/Z- und Radialsymmetrie verwenden transformierte Pinselpositionen. Am stärksten wirkende Spiegelung gewinnt, überlappende Einflüsse addieren sich nicht. Verschiebevektoren und Flächennormalen werden mitgespiegelt. Die serverseitige Auswahl bleibt verbindlich: Gegenstücke außerhalb der expliziten Regionen werden nicht heimlich verändert.

Push, Pull, Grab, Inflate, Deflate, Smooth, Flatten, Pinch, Crease, Clay, Stretch, Bend, Twist, Scale und Move sind lokale Dreiecksoperationen. Clay verschiebt die bestehende Oberfläche; es fügt noch keine neue SDF-Auflösung hinzu. Cut schneidet ein geschlossenes Volumen an einer Ebene. Remove/Subtract benutzt ein zweites Volumen.

## Topologiewechsel

Manifold liefert Union, Subtract, Cut, Refine und Simplify. Offene Flügelmembranen werden nicht automatisch zu Volumen erklärt. Maskierte Volumenoperationen werden abgelehnt, weil ein ungeprüfter Attributtransfer die Schutzregion beschädigen könnte. Farben und Oberflächenkanäle gehen als Vertex-Properties durch Manifold; Normalen werden neu berechnet.

Jeder Topologiewechsel erhöht `topology_revision`. Der Server ersetzt nur betroffene Regionen. Sculpting mit unveränderten Vertex-IDs erhält Rig und Clips. Allgemeine Manifold-Topologieänderungen invalidieren derzeit Rig und Clips; Undo stellt sie vollständig wieder her. Automatischer Skin-/UV-/Morphtransfer nach Remeshing ist noch nicht freigegeben.

## History

Ein beendeter Strich ist eine Transaktion. Der Server erzeugt eine neue Revision, einen Command-Beleg und Autosave in derselben SQLite-Transaktion. Große Zahlenfelder werden in 1024-Werte-Blöcke zerlegt und anhand SHA-256 dedupliziert. Es werden keine vollständigen Modelle pro Tracking-Frame gespeichert.

Die letzte History umfasst maximal 128 Schritte.

## Bearbeitungsebenen

Bis zu 32 sparse additive Ebenen speichern Positions-, Farb- und Materialdeltas mit stabilen Vertex-IDs und Topologieversion. Sichtbarkeit, Sperre, Stärke, Reihenfolge und Löschen sind eigenständige Undo-Befehle. Zum Malen/Formen muss die gewählte Ebene sichtbar, entsperrt und auf 100 % stehen. Geschützte Vertices verhindern nachträgliche Änderungen durch Ausblenden oder Stärkeänderung.

Das Dokument enthält die aktuell ausgewertete Oberfläche und zusätzlich die Deltas. Die Reihenfolge ist bei der additiven Darstellung kommutativ; es sind noch keine Photoshop-artigen Mischmodi. Farbwerte außerhalb des zulässigen Bereichs werden abgelehnt, nicht verlustbehaftet abgeschnitten. „Ebenen zusammenfassen“ hält die sichtbare Oberfläche fest und entfernt den Stack in einer rückgängig machbaren Transaktion. Allgemeine Topologieänderungen und Optimierung benötigen diesen expliziten Schritt. Runtime-Veröffentlichung enthält die ausgewertete Oberfläche; der Editor-Master behält seinen Stack.
