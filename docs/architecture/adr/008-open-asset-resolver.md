# ADR 008: Gemeinsamer Open Asset Resolver

Status: implementierte Architektur; Mess- und Testnachweise separat in `docs/testing.md`.

## Entscheidung

`server/orbit_server/assets` übernimmt Beschaffung, Lizenzen, Analyse, Ableitungen und den lokalen Katalog. Spielsimulation und Missionslaufzeit kennen keine Provider. Der bestehende aiohttp-Prozess stellt die API bereit; intensive Verarbeitung findet außerhalb des Eventloops in begrenzten Prozessen statt. Der Client erhält nur geprüfte GLB-Referenzen mit Asset-ID, Revision und SHA-256.

Der vorhandene Creature-Editor bleibt der autoritative, reversible Geometrieeditor. Der Resolver ersetzt weder seine Befehle noch seine Masken, Ebenen, Sitzpunkte oder Veröffentlichung als Reittier. Neue allgemeine Weltobjekte werden als eigenständige, deklarative Platzierungen gespeichert. Sie besitzen keine Skripte, Missionsbelohnungen oder behauptete Kollisionen.

## Geprüfte Alternativen

- **Three.js allein:** bleibt Renderer und OBJ-/STL-Leser. Ein selbstgeschriebener allgemeiner glTF-Umschreiber würde unnötige Risiken für Attribute, Skinning und Animationen schaffen.
- **glTF Transform:** gewählte, MIT-lizenzierte SDK mit Graphmodell, Analyse- und Transformationsfunktionen. Version 4.5.0 und alle transitiven Pakete sind im npm-Lockfile gebunden. [Dokumentation](https://gltf-transform.dev/).
- **Khronos glTF Validator:** strukturelle Prüfung vor und nach Konvertierung; Apache-2.0, gepinnter WASM/JS-Build. [Primärquelle](https://github.com/KhronosGroup/glTF-Validator).
- **meshoptimizer:** vorhandene, gepinnte Version 1.3.0 wiederverwendet. Topologievereinfachung bleibt für Skin-, Morph-, Animations- und benutzerdefinierte Vertexdaten konservativ ausgeschaltet. Texturen und doppelte Ressourcen können dennoch optimiert werden.
- **Sharp/libvips:** lokale Bildanalyse und begrenzte Größenanpassung; Sharp 0.35.5, Apache-2.0. Native Bibliotheken behalten ihre mitgelieferten Lizenzen. [Primärquelle](https://sharp.pixelplumbing.com/).
- **Blender als Pflichtdienst:** verworfen. Kein Bestandteil des benötigten Laufzeitstacks. FBX/Blend müssen in dieser Version kontrolliert nach GLB exportiert werden; der Resolver behauptet keinen verfügbaren Blender-Konverter und öffnet keine eingebetteten Skripte.

## Speicher und Reproduzierbarkeit

SHA-256-Blobs deduplizieren Bytes. SQLite speichert davon getrennt profilgebundene Katalogeinträge, Lizenzen, Provenienz und Platzierungen. Gleiche Bytes unterschiedlicher Quellen verlieren dadurch ihre getrennten Lizenznachweise nicht. Ein Download, ein normalisiertes GLB und jede Optimierung sind getrennte, unveränderliche Einträge. IDs der Ableitungen berücksichtigen Eingabe, Parameter, Worker und npm-Lockfile. Quellen werden nicht überschrieben.

Credits werden aus exakten Buildreferenzen einschließlich ihrer Abhängigkeiten und eingebetteten Quelllizenzen erzeugt. Das Buildarchiv enthält GLBs, Herkunftsmanifest und Credits zusammen. Eine aktive oder wiederaufgenommene Spielplatzierung pinnt dieselben Bytes.

## Schnittstellen und Grenzen

Die HTTP-Tool-API nutzt geschlossene JSON-Schemas ohne LLM-Abhängigkeit. Provider werden injiziert; zusätzliche installierte Python-Entry-Points benötigen eine explizite Betreiberkonfiguration. Es gibt keine Codeinstallation oder Programmpfade aus Content oder KI-Antworten.

Ein glTF kann mehr Daten enthalten, als der aktuelle Creature-Editor bearbeiten kann. Die Bibliothek behält diese Daten, rendert sie und importiert sie in die Welt. Der Editor übernimmt nur seine verlustfrei unterstützten Dokumente. UV-, fremde Skin-/Morph-/Animations- oder unbekannte Vertexdaten werden sichtbar zurückgewiesen. Damit wird kein Textur-/Rig-Transfer vorgetäuscht.

Rig-Semantik anhand von Namen sind unverifizierte Hinweise. Retargeting ist auf explizite, kompatible Rotationszuordnungen begrenzt. Unterschiedliche Restorientierungen, Translation-/Morphclips und komplexe Anatomie verlangen einen zusätzlichen Rigadapter.
