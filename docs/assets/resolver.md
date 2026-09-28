# Open Asset Resolver

Die Assetbibliothek unter `/library/index.html` verbindet Remote-Suche, lokale Importe, Analyse, GLB-Vorschau, Optimierung und servergespeicherte Spielobjekte. Am eigenen Server ist die Adresse `https://localhost:8443/library/index.html`. Ohne Headset funktioniert derselbe Ablauf am Laptop.

## Start und Bedienung

```sh
python -m pip install -c requirements-dev.lock -e '.[dev,design]'
npm ci
python -m orbit_server --http --data-dir .local
```

1. Einen Begriff oder eine Beschreibung eingeben, etwa `dragon`, `animated flying dragon` oder `Ich brauche einen mittelalterlichen Brunnen`.
2. Quellen und Lizenzfilter wählen. Anbieterangaben sind bis zur Analyse ungeprüft. „Quest-Budget geprüft“ zeigt nur lokal analysierte Ergebnisse innerhalb des Budgets. Unbekannte Geometrie-/Texturwerte erfüllen strenge Messwertfilter nicht.
3. „Import & Vorschau“ lädt ein zulässiges Asset, prüft es und legt Quelle, GLB und Optimierung getrennt ab. Die Bibliothek zeigt Dreiecke, Clips, Bones, Größen und Herkunft. Originalclips lassen sich in der Vorschau abspielen. Die VR-/MR-Vorschau zeigt dasselbe Modell; die Suche erfolgt auf der Browserseite.
4. Ein Zielprofil wählen oder drei LOD-Varianten erzeugen. Ein Profilname allein garantiert nicht, dass das Ergebnis sein Budget einhält. Geschützte Topologie bleibt erhalten; eine Überschreitung wird sichtbar gemeldet.
5. Eine Position und Größe wählen und „In die Spielwelt übernehmen“. Die laufende Welt lädt neue Platzierungen binnen ungefähr 15 Sekunden. Die Objekte sind dekorative Weltobjekte mit ihren Clips; sie verleihen keine Missionsfortschritte und sind keine neuen serverseitigen Kollisionskörper. Entfernen ist im selben Panel möglich. Positionen beziehen sich in MR auf den bestehenden lokalen Spielursprung; es findet keine künstliche MR-Fortbewegung statt.
6. Unterstützte Geometrie kann als unabhängige Kopie in die bestehende Werkstatt wechseln. Herkunft und Lizenz bleiben im Creature-Dokument, dessen Revisionen, JSON-/GLB-Exporten und Runtime-Artefakt. Formen, Masken, KI-Vorschläge und Undo benutzen die vorhandenen Editorbefehle. Der allgemeine texturierte Skin-/Morph-Import des Editors bleibt eine ausdrücklich sichtbare Grenze.

Eigene Dateien werden mit Urheber, konkreter Lizenzversion, Quell-/Lizenznachweis und optionalem Urhebervermerk importiert. glTF-Dateien mit separaten Ressourcen gehören gemeinsam in ein ZIP. Ein ZIP mit mehreren Modellen verlangt einen eindeutigen Einstiegspunkt über `import_asset.entry`. Quellen unbekannter oder gesperrter Lizenz landen in Quarantäne und erhalten keine Vorschau- oder Spielreferenz.

## Providerfähigkeiten

| Provider | Suche | Automatischer Download | Unterstützter Weg |
|---|---|---|---|
| Local | lokaler Katalog, offline | wiederverwendete Hash-Blobs | Eigene Importe und alle Ableitungen |
| Bundled | vorhandenes Orbit-Inventar | nur feste, geprüfte lokale Dateien | Bestehender CC0-Arin als unabhängige Quelle |
| Poly Haven | offizielle natürliche Suche | glTF mit Manifestressourcen, PBR-Karten | Öffentliche API, identifizierender User-Agent, sichtbare Quellenangabe |
| ambientCG | offizielle v2-Suche | 1K-JPG-Materialpakete | Materialkarten als wiederverwendbares GLB mit Beispielgeometrie |
| Sketchfab | offizielle v3-Suche und Lizenzmetadaten | nur mit Betreiber-Token und angebotenen glTF-/GLB-Dateien | Ohne Token Quellseite und manueller Import |
| Quaternius | Paketübersicht als Link | manuell | Kein HTML-Scraper; Lizenz des konkreten Pakets angeben |
| Kenney | Suchlink | manuell | Assetdatei mit Lizenznachweis importieren |
| OpenGameArt | Suchlink | manuell | Lizenz je Upload prüfen; kein pauschales Plattformrecht |

API-Endpunkte, Grenzen und Bedingungen wurden anhand der offiziellen Quellen geprüft: [Poly Haven API](https://polyhaven.com/llms.txt), [API-Bedingungen](https://github.com/Poly-Haven/Public-API/blob/master/ToS.md), [ambientCG API](https://docs.ambientcg.com/api/), [Sketchfab Download API](https://sketchfab.com/developers/download-api), [Quaternius FAQ](https://quaternius.com/faq.html), [Kenney Support](https://kenney.nl/support), [OpenGameArt FAQ](https://opengameart.org/content/faq). Die externen Dienste geben keine Orbit-Verfügbarkeitsgarantie. Ein fehlgeschlagener Provider bleibt ein einzelner Fehler im Suchergebnis; die lokale Library funktioniert weiter.

Die Suche lädt nur begrenzte Metadaten, keine kompletten Bibliotheken. Leere Suchanfragen bleiben lokal. API-Metadaten werden kurz zwischengespeichert (höchstens 128 Antworten beziehungsweise 32 MiB serialisierte Daten pro Provider). Ein erneuter Import derselben Remotequelle verwendet den Downloadcache. `download_asset` mit `refresh: true` prüft einen neuen Quellenstand; bereits veröffentlichte Referenzen ändern sich dadurch nicht.

## Konfiguration und Plugins

`ORBIT_ASSET_CONFIG` kann auf eine lokale JSON-Datei zeigen. Sie wird beim Serverstart gelesen und gegen `shared/schemas/assets/v1/config.schema.json` geprüft. Keine Schlüssel in diese Datei schreiben; für Sketchfab nur den Namen einer Umgebungsvariablen hinterlegen.

```json
{
  "providers": {
    "polyhaven": {"enabled": true},
    "ambientcg": {"enabled": true},
    "sketchfab": {"enabled": false, "token_env": "ORBIT_SKETCHFAB_TOKEN"},
    "opengameart": {"enabled": true}
  },
  "plugins": [],
  "commercial": true,
  "allowed_licenses": ["CC0", "Public Domain", "CC-BY"],
  "custom_evidence": [],
  "quota_bytes": 2147483648
}
```

Ein Plugin implementiert `AssetProvider` aus `assets/contracts.py` und registriert eine Factory in der Python-Entry-Point-Gruppe `orbit.asset_providers`. Die Factory erhält den begrenzten Transport und ihre Konfiguration. Unter `settings` kann ein Plugin bis zu 32 eigene skalare Einstellungen auswerten; deren Bedeutung und Validierung verantwortet das Plugin. Deaktivierte Plugins werden nicht geladen. Die Provider-ID muss eindeutig sein. Nur ausdrücklich in `plugins` genannte, bereits installierte Pakete werden geladen. Ein Provider deklariert seine HTTPS-Hosts und liefert Downloadmanifeste; Provider- oder Downloadadressen kommen niemals direkt aus einer Modellantwort. Tests können den Transport austauschen und offizielle API-Antworten als Fixtures liefern. Kein Core- oder Spielcode muss für ein zusätzliches Plugin geändert werden.

## Lizenzmodell

Die Metadaten führen Lizenzfamilie **und Version**, Lizenzlink, Urheber, Quelle, Quell-ID, Quell-URL, Nachweis-URL, Notice, Downloadzeit und Änderungen. Unterstützt sind CC0, Public Domain, CC BY, SA-, NC- und ND-Kombinationen, Custom und Unknown.

Standardmäßig sind CC0/Public Domain und CC BY freigegeben. Andere Familien müssen vom Betreiber ausdrücklich erlaubt werden. NC bleibt bei kommerziell nutzbaren Builds gesperrt; ND bleibt in der verändernden Pipeline gesperrt. Custom benötigt zusätzlich eine freigegebene Nachweis-URL. CC BY benötigt Urheber und konkreten Lizenzlink. Diese Regeln sind eine technische Veröffentlichungsrichtlinie; sie ersetzen nicht die Prüfung, ob der Upload tatsächlich berechtigt ist.

Lizenzmetadaten bleiben bei Konvertierung, Optimierung und Animationstransfer sowohl im Katalog als auch in glTF-Extras erhalten. Eingebettete frühere Lizenznachweise werden erneut geprüft und in Credits übernommen. Ein abweichender neuer Metadatensatz entfernt keine frühere Lizenzpflicht. Ein Build folgt exakten Assetreferenzen und Abhängigkeiten; er enthält `ASSET-CREDITS.md`, `manifest.json` und die referenzierten GLBs. Das Assetpaket ist unabhängig von den deklarativen Missionsarchiven.

## Import und Analyse

```text
Provider oder Upload → Lizenzrichtlinie → unveränderte SHA-256-Quelldateien
→ begrenztes Entpacken → isolierter Datenprozess → glTF-Validierung
→ explizite Einheiten/Achsen → kanonisches GLB → erneute Validierung
→ Analyse/Katalog → optionale Profilableitung → Preview/Spiel/Build
```

GLB/glTF bleiben der Master für allgemeine Assets. Direkte Leser existieren für einfaches OBJ und STL. Ein OBJ mit MTL wird in dieser Version zurückgewiesen, damit Materialdaten nicht stillschweigend verschwinden. FBX/Blend benötigen einen manuellen Export nach GLB; eingebettetes Blender-Python wird nicht ausgeführt. glTF-Ressourcen müssen im Paket liegen; externe Ressourcen, Daten-URIs und unkonfigurierte Kompressionsdecoder sind gesperrt. Unbekannte Erweiterungen werden zurückgewiesen. Ein falscher optionaler `skin.skeleton`-Hinweis kann entfernt werden; die Warnung bleibt im Report, Joints, Bind-Matrizen und Clips bleiben erhalten, und das Ergebnis muss erneut fehlerfrei validieren.

Materialpakete verwenden Color, OpenGL-Normalen, Ambient Occlusion sowie Roughness/Metallic, soweit vorhanden. Displacement, DirectX-Normalen und weitere nicht verwendete Karten bleiben in der Originalquelle; der Report nennt sie ausdrücklich. USD-, MaterialX-, Godot- und Blender-Begleitdateien werden nur als unveränderte Quelldaten aufbewahrt, nicht interpretiert.

glTF ist Y-up in Metern. Für andere Daten werden Einheitenskala und Y-/Z-Up explizit angegeben; die Pipeline errät keine reale Größe. Normalisierung verwendet gemeinsame Elterntransformationen und verändert nicht heimlich Bind-Matrizen.

Die Analyse erfasst Geometrie und instanzierte Dreiecke, Primitive/Draw Calls, Restpose-Bounds, Materialien/Alpha-Modi, Texturformate/-auflösungen, Speicherabschätzungen, Dateigröße, Skinning, Bones samt Resttransformationen, Morph Targets, Clips mit Dauer, Zielknoten und Tags. Animationsressourcen erhalten einen Inhaltsfingerabdruck ihrer Kanäle. `find_animations` katalogisiert diese unabhängig vom Suchbegriff des Figurenmodells. Auch GLBs mit ausschließlich Animationskanälen lassen sich katalogisieren und übertragen; ihre Vorschau benötigt ein Zielmodell. Die Suche berücksichtigt Clipnamen und Tags und liefert maximal 50 eindeutige Clips. `rig_family` bleibt die gewünschte Zielanatomie; das Ergebnis meldet `unclassified`, solange keine bestätigte Zuordnung vorliegt. Kompatibilität muss beim Retargeting explizit geprüft werden.

Das Dragon-Profil enthält Namenshinweise für Kopf, Hals, Wirbelsäule, Schwanz, Flügel, Beine, Füße, Kiefer und Augen. Ein Reitersitz wird nicht aus einer beliebigen Meshform erfunden. Namen und Animations-Tags sind Vorschläge, keine verifizierte Anatomie. Der bestehende Creature-Creator bleibt für bestätigte Mountpunkte zuständig.

## Profile und Laufzeit

| Profil | Dreiecke pro Asset | Texturkante | Draw Calls | Geschätzter Texturspeicher | GLB |
|---|---:|---:|---:|---:|---:|
| desktop-high | 250.000 | 4.096 | 80 | 256 MiB | 64 MiB |
| desktop-medium | 100.000 | 2.048 | 48 | 128 MiB | 32 MiB |
| quest3-high | 60.000 | 2.048 | 24 | 64 MiB | 24 MiB |
| quest3-balanced | 30.000 | 1.024 | 16 | 32 MiB | 16 MiB |
| quest3-performance | 12.000 | 512 | 8 | 16 MiB | 8 MiB |

Doppelte Ressourcen und kompatible statische Primitive können zusammengefasst, statische Meshes mit Fehlergrenze vereinfacht und Texturen verkleinert werden. Skin, Morphs, Animationen und eigene Attribute schützen vor dieser Topologievereinfachung. Kompressionscodecs, allgemeines Texturbaking und anatomisches Universal-Retargeting werden nicht als verfügbare Funktionen ausgewiesen. Die atomare Aktualisierung im Browser darf kurzzeitig zwei begrenzte Platzierungssätze halten; danach werden ungenutzte Meshes, Texturen, Materialien und Instanzskelette freigegeben.

LOD-Erzeugung liefert separate pinbare GLBs. Die aktuelle Spielplatzierung verwendet die gewählte feste Ableitung; sie schaltet diese LOD-Kette noch nicht automatisch nach Entfernung um. Bis zu 24 zusätzliche Weltobjekte sind zulässig; zusätzlich gelten gemeinsame Budgets von 180.000 Dreiecken, 64 Draw Calls und 128 MiB geschätztem Texturspeicher. Diese Budgets sind keine Messung der Quest-Framerate.

## Sicherheit und Betrieb

- HTTPS, feste Provider-Hosts und DNS-Prüfung am tatsächlichen Verbindungsaufbau. Private/reservierte IPs sind gesperrt; fremde Redirect-Hosts erhalten keine Tokens. Downloads haben Zeit-, Byte- und Parallelitätsgrenzen.
- Maximal 128 MiB je Quelldatei, 256 MiB je entpacktem Paket, 512 Dateien, keine Traversalpfade, Links, Spezialdateien, verschlüsselten Archive oder ausführbaren Typen. glTF-Referenzen bleiben lokal.
- Maximal zwei Konvertierungsjobs, jeweils 90 Sekunden und begrenzter JS-Heap; zusätzliche Geometrie-/Textur-/Outputlimits. Unter Linux mit `bwrap` werden Netzwerk, PID- und Mount-Namensräume isoliert. Ohne `bwrap` gilt Nodes Permission Model für Datei-/Prozesszugriff; Node 24 sperrt damit keinen Netzwerkzugriff. Der feste Worker akzeptiert weiterhin keine externen Ressourcen. Dies ist keine vollständige OS-Isolation nativer Bilddecoder oder möglicher Decoderfehler. Der tatsächliche Modus ist über Capabilities sichtbar. Fehler aktivieren keinen ungeprüften Fallback.
- Code und npm-Pakete werden nur aus festen lokalen Pfaden ausgeführt. Eingabedaten können keine Befehle, Skripte, Programme oder Modellharnesses auswählen. Das ist keine Behauptung eines Antivirus-Scans.
- HTTP-Mutationen benötigen dieselbe Origin und verwenden den bestehenden lokalen Browserprofil-Cookie. Lizenzeinstellungen und Provider-Credentials sind keine Clientparameter. Katalog und Platzierungen sind pro Profil getrennt; Hash-Blobs dürfen Bytes deduplizieren.
- Der Speicher besitzt ein explizites Quotenlimit; Katalogmetadaten sind zusätzlich auf 64 MiB pro Profil begrenzt. SQLite-Transaktionen schützen Hashablage, Quoten und Platzierungsrevisionen auch bei parallelem CLI-/Serverzugriff. Beschädigte Cacheeinträge werden erkannt. Quelle und abgeleitete Assets bleiben bei fehlgeschlagenen Verarbeitungsschritten erhalten. Laufzeitdaten, heruntergeladene Assets und Tokens gehören nicht ins Git-Repository.

## API, KI-Harnesses und CLI

`GET /api/assets/tools` liefert die formalen Toolargumente. `POST /api/assets/tools/<name>` führt denselben Dienst wie die UI aus. Unterstützt werden `search_assets`, `inspect_asset`, `get_license`, `get_provenance`, `download_asset`, `import_asset`, `optimize_asset`, `preview_asset`, `find_animations`, `retarget_animation`, `place_asset`, `remove_placement` und `export_credits`. Upload: `POST /api/assets/upload`; Buildexport: `POST /api/assets/build`; Platzierungen: `GET /api/assets/placements`.

Beispielargumente für `search_assets`:

```json
{"query":"medieval well","licenses":["CC0","CC-BY"],"providers":["local","polyhaven","sketchfab"],"target":"quest3-balanced","limit":3}
```

`target` beschreibt die gewünschte Zielplattform; die Freigabe erfolgt anhand der tatsächlichen Analyse. `quest_compatible: true` fordert bereits bestätigte Budgetwerte. Ein Harness kann zuerst drei Vorschläge zeigen, danach den gewählten Treffer importieren, optimieren und über `preview_asset` anzeigen. Platzierung bleibt eine getrennte Mutation. Ananta oder andere Harnesses können diesen Vertrag verwenden, ohne dass der Resolver ein LLM installiert oder importiert.

```sh
python -m orbit_server.assets.cli capabilities
printf '%s' '{"query":"dragon","providers":["local"]}' | \
  python -m orbit_server.assets.cli tool search_assets
python -m orbit_server.assets.cli upload ./model.glb --metadata ./license-metadata.json
```

Die CLI verwendet standardmäßig den lokalen Namensraum `cli`; `--owner` wählt einen anderen. HTTP-Harnesses müssen ihren Profil-Cookie beibehalten. Ein Toolfehler enthält einen stabilen Fehlercode und aktiviert weder Ersatzmodelle noch unbestätigte Spielaktionen.

## Prüfungen

```sh
python -m pytest tests/assets
npm test
ORBIT_URL=http://127.0.0.1:8765 npm run test:assets
```

Der Browserlauf benötigt einen separaten Testserver und installiertes Playwright-Chromium. Er prüft Upload, Analyse, Cache, Optimierung, echte GLB-Vorschau, IWER-VR, Werkstatt mit Quellenbindung/Sculpt/Undo und die tatsächliche Spielinstanz. Externe Antworten sind in automatisierten Tests Fixtures. `python tools/diagnostics/check-assets-live.py` ist ein ausdrücklich optionaler echter Poly-Haven-Such-/Importlauf. Mit `--asset ambientcg:Bricks105 --query bricks` prüft dieselbe Diagnose den tatsächlichen Materialpfad. Physische Quest-Abnahme ist separat.
