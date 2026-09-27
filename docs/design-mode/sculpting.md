# Geometrie und Sculpting

Der erste Master ist ein in Metern gespeichertes Dreiecksmesh mit getrennten semantischen Regionen. Formänderungen benutzen NumPy; geschlossene Boolesche Operationen benutzen Manifold. Die [Entscheidung](../architecture/adr/design-001-editing-foundation.md) bewertet Dreiecke, SDF und Hybrid getrennt.

## Einfluss

Für Abstand `d` und Radius `r` gilt `max(0, 1 - (d/r)^2)^2`. Maske 1 schützt vollständig; Maske 0 erlaubt Bearbeitung. Stärke und Anzahl der Stroke-Samples begrenzen die Gesamtänderung. Push/Pull arbeiten entlang der ursprünglichen Normalen. Grab/Move folgen dem Verschiebevektor; Glätten nutzt Nachbarschaften aus Dreiecken. Alle Resultate werden vor Übernahme validiert.

X/Y/Z- und Radialsymmetrie verwenden transformierte Pinselpositionen. Am stärksten wirkende Spiegelung gewinnt, überlappende Einflüsse addieren sich nicht. Verschiebevektoren und Flächennormalen werden mitgespiegelt. Die serverseitige Auswahl bleibt verbindlich: Gegenstücke außerhalb der expliziten Regionen werden nicht heimlich verändert.

Push, Pull, Grab, Inflate, Deflate, Smooth, Flatten, Pinch, Crease, Clay, Stretch, Bend, Twist, Scale und Move sind lokale Dreiecksoperationen. Clay verschiebt die bestehende Oberfläche; es fügt noch keine neue SDF-Auflösung hinzu. Cut schneidet ein geschlossenes Volumen an einer Ebene. Remove/Subtract benutzt ein zweites Volumen.

## Topologiewechsel

Manifold liefert Union, Subtract, Cut, Refine und Simplify. Offene Flügelmembranen werden nicht automatisch zu Volumen erklärt. Maskierte Volumenoperationen werden abgelehnt, weil ein ungeprüfter Attributtransfer die Schutzregion beschädigen könnte. Farben und Oberflächenkanäle gehen als Vertex-Properties durch Manifold; Normalen werden neu berechnet.

Jeder Topologiewechsel erhöht `topology_revision`. Der Server ersetzt nur betroffene Regionen. Sculpting mit unveränderten Vertex-IDs erhält Rig und Clips. Topologieänderungen invalidieren derzeit Rig und Clips; Undo stellt sie vollständig wieder her. Automatischer Skin-/UV-/Morphtransfer nach Remeshing ist noch nicht freigegeben.

## History

Ein beendeter Strich ist eine Transaktion. Der Server erzeugt eine neue Revision, einen Command-Beleg und Autosave in derselben SQLite-Transaktion. Große Zahlenfelder werden in 1024-Werte-Blöcke zerlegt und anhand SHA-256 dedupliziert. Es werden keine vollständigen Modelle pro Tracking-Frame gespeichert.

Die letzte History umfasst maximal 128 Schritte. Echte nichtdestruktive Ebenen sind noch nicht vorhanden; nichtleere importierte Layer werden ausdrücklich abgelehnt.
