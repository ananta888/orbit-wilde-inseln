# Kreaturenwerkstatt

Die Werkstatt ist eine eigene Three.js/WebXR-Szene unter `/designer/index.html`. Sie verwendet den bestehenden Orbit-Server, hat aber eine eigene Sitzung, eigene Geometrieprozesse und einen eigenen Creature-Speicher. Der reguläre Spielstand wird durch Bearbeitung nicht verändert.

## Start

```sh
python -m pip install -c requirements-dev.lock -e '.[dev,design]'
npm ci
python -m orbit_server --http
```

Am Laptop `http://localhost:8443/designer/index.html` öffnen. Für eine Quest gelten die HTTPS-Anforderungen aus [XR-Setup](../vr/setup.md). Ohne die optionale Python-Erweiterung bleibt das Spiel nutzbar; die Werkstatt meldet die fehlende Erweiterung.

## Ausführbarer Arbeitsablauf

1. Vorlage wählen oder „Arin aus Orbit laden“. Letzteres übernimmt die vorhandene prozedurale Spielfigur als unabhängige Kopie.
2. Einen Bereich berühren: am Laptop mit der linken Maustaste, in XR mit Trigger oder Pinch. Rechts ziehen dreht die Laptopansicht.
3. Herausziehen/Eindrücken wählen, Radius und Stärke einstellen und einen Strich beenden. Die Quest zeigt eine lokale Vorschau; der Laptop bestätigt die Geometrie und speichert die Revision.
4. Undo/Redo, Malen, Schutzmaske, neue Primitive und Volumenoperationen verwenden. Vereinigung/Subtraktion benötigen zwei geschlossene, ungeschützte Regionen.
5. Eine Region auswählen, etwa „20 Prozent größer“ eingeben und Original/Vorschlag vergleichen. Erst „Übernehmen“ schreibt den Vorschlag in die History.
6. Eine Sculpt-/Paint-Ebene anlegen, Sichtbarkeit/Stärke vergleichen und bei Bedarf zusammenfassen. Vor Topologieoperationen müssen Ebenen explizit zusammengefasst werden.
7. Rig erstellen: hierarchische Gelenke mit weichen Gewichten. Gewichte malen, IK-Ziel setzen und Gelenkgrenzen verwenden. Unter „Pose & Vorschau“ Posen an unterschiedlichen Zeiten aufnehmen, als Clip speichern und abspielen.
8. „Für Quest optimieren“ berechnet eine separate Vorschau mit erhaltenem Skin/Rig. Übernehmen und Undo sind möglich; eine automatische FPS-Garantie ist das nicht.
9. „Flug vorbereiten“ ergänzt fehlendes Rig, Sitz und Körperbox. „Im Spiel testen“ öffnet die echte Flugsimulation mit der unveränderlichen Revision, ohne den regulären Spielstand zu schreiben. Der Rückkehr-Link führt zum gespeicherten Editorstand.
10. „Als Arin übernehmen“ aktiviert die Figur für die nächste reguläre Spielsitzung; „Original-Arin“ setzt die Auswahl zurück. Creature-JSON und GLB bleiben unabhängige Exportwege. Jeder bestätigte Befehl wird bereits lokal gespeichert.

## Stand und Ausbau

Die Basis ist ausführbar und automatisiert prüfbar. Sie ist noch kein vollständig abgenommener Creature Creator. Freie neuronale 3D-Modelle, ein SDF-Master, UV-Texturmalerei, anatomisch universelles Auto-Rigging, mehrstufige LOD-/Bake-Pipelines und allgemeiner Skin-/Morph-Import bleiben weitere Milestones. Die neue KI-Generierung wählt parametrisierte Originalvorlagen. Das Rig ist ein nachvollziehbares semantisches Verfahren, kein universeller Anatomie-Erkenner.

Die Sitzansicht bleibt eine Größen-/Sichtvorschau; der zusätzliche Probeflug benutzt die echte Spielsimulation. Editierbare Collider werden bisher als Metadaten geprüft, noch nicht für detaillierte Körperkollisionen im Terrain verwendet. Die ursprüngliche einfache Flugkollision bleibt maßgeblich. Handtracking, echte Passthrough-Darstellung, Komfort und Bildrate müssen auf einer physischen Quest separat geprüft werden. Der Nutzer hat die weitere Arbeit ohne angeschlossenes Headset gewünscht; Geräteabnahmen bleiben daher offen.

Der [vollständige TODO-Track](../../todos/active/todo.vr-ai-creature-designer.json) bleibt maßgeblich. Ein ausgeführter lokaler Parser wird ausdrücklich nicht als LLM ausgegeben.

## Prüfung ohne Headset

```sh
python -m pytest
npm test
# Gegen den oben gestarteten lokalen Server:
ORBIT_URL=http://127.0.0.1:8443 npm run test:design
ORBIT_URL=http://127.0.0.1:8443 npm run test:design:xr
```

Die Browserprüfungen benötigen Playwright-Chromium (`npx playwright install chromium`). Mit `CHROMIUM_PATH` lässt sich eine vorhandene kompatible Chromium-Installation angeben. Tests nutzen neue Browserprofile und einen separaten Testdatenordner; sie sollten nicht gegen eine laufende persönliche Bearbeitung ausgeführt werden.

## Offene Assetbibliothek

Über „Assetbibliothek“ lassen sich lokale Dateien und unterstützte Remotequellen suchen, prüfen, als GLB ansehen und als unabhängige Werkstattkopie öffnen. Der gemeinsame [Resolver](../assets/resolver.md) besitzt Lizenzen, Originale, Varianten und Cache. Die Werkstatt bleibt zuständig für autoritative Bearbeitungsrevisionen, Masken, Undo, KI-Vorschläge und Veröffentlichung.

Der Server bindet eine Bibliothekskopie an Asset-ID, SHA-256, vollständige Lizenz und eingebettete Quelllizenzen. JSON-/GLB-Export und Runtime-Artefakte behalten diese Herkunft. Vor Veröffentlichung, Aktivierung und Laden wird die Betreiber-Lizenzpolitik erneut geprüft; gesperrte Bibliotheksquellen werden nicht als Reittier ausgeliefert. Bearbeitungen werden im GLB-Export als Änderung an der Quelle gekennzeichnet.

Interleavte Vertexdaten werden für den vorhandenen Editor korrekt in getrennte Attribute überführt. Der allgemeine Import weist fremde UVs, Skins, Morphs, Clips, zusätzliche Attribute oder Erweiterungen weiterhin sichtbar zurück, wenn das Edit-Dokument sie nicht verlustfrei darstellen kann. Die Bibliothek kann solche Assets vollständig rendern und in der Welt platzieren; sie erzwingt keinen verlustbehafteten Sculpt-Import. Orbit-eigene GLB-Rundläufe mit Edit-Metadaten und der vorhandene prozedurale Arin-Pfad bleiben erhalten.
