# XR-Interaktion

Die Kamera gehört dem XR-Tracking. Werkstücktransformationen liegen auf einer eigenen Stage; der Kopf wird beim Modellieren nicht künstlich mitgedreht. Miniatur und Lebensgröße verändern die Ansicht, nicht die kanonischen Maße des Dokuments.

## Eingabezustände

`PinchState` verwendet unterschiedliche Schwellwerte für Schließen (21 mm) und Öffnen (32 mm). Fehlendes Tracking bricht eine laufende Geste ab. `Stroke` begrenzt einen Strich auf 64 Punkte und den Verschiebevektor auf zwei Meter je Achse. Controller nutzen `selectstart/selectend`; Auswahl und Pinsel teilen sich dieselbe Oberfläche.

Nur eine Quelle darf einen Strich besitzen. Palettenaktionen fangen die Eingabe ab. Trackingverlust, Pointer-Abbruch und XR-Fokusverlust verwerfen unbestätigte aktive Striche. Ein beendeter Strich wird vor dem Versand ins lokale Journal geschrieben.

Controller-Grip verschiebt/dreht das Werkstück. Zwei Grips skalieren und drehen es um ihren gemeinsamen Mittelpunkt. Der gleiche Navigationszustand nimmt erkannte Fäuste entgegen; diese Erkennung lässt sich abschalten und benötigt noch eine Prüfung auf echter Hardware. Pinch bleibt Auswahl/Sculpt. Wechsel zwischen einer und zwei Quellen wird neu verankert, ohne das Modell springen zu lassen. Handflächenwerkzeuge und frei konfigurierbare Gestenzuordnung bleiben Ausbaupunkte.

## Oberfläche

Eine kleine räumliche Palette mit umschaltbaren Werkzeugseiten bietet Formung, Pinsel, Farbkanäle, Presets, Symmetrie, Mehrfachauswahl, Schutzmasken, Geometrieoperationen und Rig-/Sitzvorschau. Die Laptop-Palette bietet weitergehende Zahlenparameter. Vollständige Funktionsparität aller erweiterten Parameter in XR ist gesondert abzunehmen; vorhandene Desktop-Knöpfe allein gelten dafür nicht als Nachweis.

Der Pinsel zeigt seinen räumlichen Einflussbereich. Controller erhalten einen kurzen Impuls beim Start; echte Hände benötigen visuelles Feedback. Konfigurierbare Haptik und ein abschaltbares Werkzeugklangsystem sind eigene Tasks.

## MR

`immersive-ar` verlangt transparente Umgebungskomposition; ein opaquer Modus wird abgelehnt. Virtueller Boden und Hintergrund werden ausgeblendet. Es gibt keine künstliche MR-Fortbewegung. Anchors, Raumgeometrie und dauerhafte Platzierung sind nicht implementiert.

`tools/diagnostics/check-design-xr.mjs` prüft Stereo, Controller, Hand-Pinch, Fokusabbruch, MR-Transparenz und Sessionende mit IWER. Diese Prüfung ist Emulation und kein physischer Quest-Nachweis.
