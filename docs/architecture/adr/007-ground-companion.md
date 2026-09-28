# ADR 007: Arin als sichtbarer Bodenbegleiter

Status: angenommen. Datum: 2026-09-28.

## Anlass

Das Handgelenkmenü bot Gespräche außerhalb des Flugmodus an, während die Serverprüfung sie still verwarf. Gleichzeitig verschwand Arins Modell nach der Landung. Der Begleiter soll in der Inselwelt sichtbar und in allen Modi ansprechbar sein.

## Entscheidung

Den vorhandenen Three.js-`AnimationMixer` und die bereits geprüften CC0-Clips weiterverwenden. Keine zusätzliche Animationsbibliothek oder Engine. `DragonAnimation` mischt `idle`/`walk`, stellt vor jeder Mischung zusätzliche Gelenkdrehungen zurück und ergänzt begrenzte Flug-, Blick- und Sprechgesten. Jeder Drache besitzt einen eigenen Mixer. `groundOffset` berücksichtigt das deformierte SkinnedMesh und die Bind-Matrix bei der Standhöhe.

`CompanionMotion` ist eine unabhängig testbare Darstellungsfunktion mit Geländeabfrage. Sie hält einen seitlichen Platz, folgt der Bewegungsrichtung mit Geschwindigkeitsgrenze und prüft eine Standfläche gegen Wasser, fehlende Chunks und starke Höhenunterschiede. Kopfbewegung allein ändert den Folgeplatz nicht. Sie ist keine neue autoritative Entität und darf keine Missionen, Kollisionen, Saves oder Kamera verändern.

Gespräche werden durch die aktive Spielphase begrenzt, nicht durch den Flugzustand. Neustart, Pause und Moduswechsel invalidieren das Gespräch; auch nach asynchroner Planung bzw. Synthese muss dessen Gültigkeit geprüft werden. MR erhält keine künstliche Fortbewegung und kein raumfüllendes Drachenmodell.

## Abgewogene Alternativen und Grenzen

Eine vollständige NPC-Navigation mit Navmesh, Hindernisvermeidung und serverseitiger Kollision braucht explizite Weltverträge und eigene Aufgaben. Sie wird nicht hinter einer rein visuellen Folgebewegung versteckt. Übergänge setzen beim Aufsteigen die vorhandene Reiterposition und beim Landen einen nahen Standplatz; dies ist noch keine produzierte Auf-/Absteigeanimation. Auf unpassierbarem Boden bleibt Arin stehen. Große Weltversetzungen setzen die sichtbare Position neu.

Der externe Ananta-Vertrag bleibt unverändert. Offline-Texte berücksichtigen den neuen Aktivitätskontext; umfangreicheres charakterbezogenes Gedächtnis und Umgebungswissen im realen Modell bleiben gesonderte Arbeiten. Sprechgesten bedeuten keine neue ASR-, TTS- oder Quest-Hardwareverifikation.

## Prüfung

CPU-Tests laden das echte GLB-Skelett samt Originalclips ohne Browser-Texturdecoder. Sie prüfen getrennte Instanzen, Drift, Mischgewichte und Standhöhe unter Elterntransformationen. Bewegungstests prüfen Abstand, Geschwindigkeitsgrenze, Kopfrotation und Klippen. Kontrollierte Dialogprovider prüfen Boden, Flug, MR, Warteschlange, Neustart und verspätete TTS.

`tools/diagnostics/check-presence.mjs` ergänzt Desktop-Gespräch, schmale Menüs, Landung und MR-Controlleranfrage. Chromium/IWER prüfen die Browserpfade; Sichtkomfort, Reichweite und Bildrate auf echter Quest bleiben `XR-DEVICE`/`TEST-HARDWARE`.
