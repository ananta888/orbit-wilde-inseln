# ADR 006: Lokale XR-Eingaben, stabile Panels und lizenzierte GLBs

Status: angenommen, 2026-09-28.

Das Kopf-HUD verdeckte Teile der Welt; die Auswahl reagierte beim Drücken und konnte mit dem Bogen konkurrieren. Hände/Controller und Tierbeine waren geometrische Platzhalter. Externe Assets fehlten.

Wir behalten Three.js/WebXR und die Server-Simulation. `HandMenu` besitzt die Interaktion für Missions- und Dialogflächen; `SpatialPanel` besitzt Layout, Text-/Aktionsseiten und Picking. Ein kleiner Handgelenk-Dock öffnet ein im lokalen Raum ruhendes Panel. Die reine `SelectionGate`/`PinchGate`-Logik prüft Loslassen, Hysterese, Trackingverlust und Layoutwechsel. Controller und Hand-Pinch verwenden die Runtime-Select-Ereignisse, damit reservierte System-Pinches vom Runtime unterdrückt bleiben. Gelenkabstände verlangen nach Trackingverlust zuerst eine offene Hand und unterscheiden direktes Antippen vom Pinch. Ein gemeinsames Gate verhindert doppelte Aktionen aus Select und Poke. Nach WebXR bestätigt `select` die abgeschlossene Geste; `selectend` ohne Bestätigung verwirft sie. `ActionSequence` hält das frühe `select` älterer Emulatoren bis zum Loslassen zurück. Eigene Handgesten dürfen Metas Systemgeste nicht ersetzen.

Die MIT-WebXR-Input-Profile werden versionsgebunden lokal kopiert. `InputVisuals` trennt echte Gelenkposen von geschätzten Controllergriffen. Der Bogen benutzt Grip-/Handflächenpositionen. `PlayerAvatar` und `kinematics.js` ergänzen rein visuelle inverse Kinematik. Sie verändern weder Kopfkamera noch serverseitige Treffer.

Cethiel/Drummyfishs CC0-Drache wird mit dem vorhandenen Three.js-COLLADA-Loader und GLTFExporter konvertiert. Ein zusätzlicher Blender-Build ist nicht notwendig. Herkunft/Hashes/Budgets stehen im Inventar. Originalclips bleiben erhalten; der Flug ist als eigener prozeduraler Overlay benannt. Das Modell lädt lokal asynchron, Fehler erhalten die bisherige prozedurale Darstellung. Veröffentlichte Designer-Kreaturen haben weiterhin Vorrang.

Vegetation wird pro Chunk instanziert und nach Entfernung vereinfacht. Schatten werden räumlich begrenzt und mit begrenzter Frequenz aktualisiert. Qualitätsprofile sind explizit wählbar. Eine native Engine, PC-Videostreaming und fotorealistische Komplett-Assetpacks würden hier einen anderen Render-/Deploymentpfad erfordern; sie sind nicht Voraussetzung für die vorliegenden Verbesserungen.

Folgen: keine Laufzeit-CDNs, kein neues Serverprotokoll, keine Asset-Skriptausführung. Hand-Picking, geschätzte Beine und Performance benötigen zusätzlich zur Emulation eine Prüfung auf echter Quest. Siehe [Bedienung und Grenzen](../../vr/presence.md) und [Assetpipeline](../../assets/sources.md).
