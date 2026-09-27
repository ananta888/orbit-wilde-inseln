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
6. Rig-Vorschlag erstellen, posieren und die Figur belebt ansehen. Die erste Rigging-Stufe benutzt starre Gewichte pro Region.
7. Als Creature-JSON oder GLB exportieren. Jeder bestätigte Befehl ist bereits lokal gespeichert.

## Stand und Ausbau

Die Basis ist ausführbar und automatisiert prüfbar. Sie ist noch kein vollständig abgenommener Creature Creator. Freie generative 3D-Modelle, ein SDF-Master, echte Ebenen, UV-Texturmalerei, organisches Auto-Rigging/IK, allgemeiner Skin-/Morph-Import und die Veröffentlichung in der Spielwelt sind weitere Milestones. Eine Figur im Editor zu laden ist noch keine Übernahme als Gameplay-Asset.

Die vorhandene Sitz-/Flugansicht ist eine begrenzte Größen- und Sichtvorschau. Sie ersetzt keinen Test gegen die Flugphysik des Spiels. Handtracking, echte Passthrough-Darstellung, Komfort und Bildrate müssen auf einer physischen Quest separat geprüft werden. Der Nutzer hat die weitere Arbeit ohne angeschlossenes Headset gewünscht; Geräteabnahmen bleiben daher offen.

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
