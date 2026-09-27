# Designprotokoll 1

Die Werkstatt verwendet `/api/design/ws`. Der bestehende Gameplay-Vertrag 4 bleibt unverändert. Das HttpOnly-Browserprofil begrenzt Assetzugriff; Same-Origin-Prüfungen schützen schreibende HTTP-/WebSocket-Pfade. Pro Profil und Asset hält genau ein Socket die Schreibsitzung.

## Transaktion

```json
{"type":"command","command_id":"stroke_23","asset_id":"arin","base_revision":17,"operation":{"tool":"pull","regions":["head"],"samples":[[0,1.8,-1.6]],"radius":0.2,"strength":0.35}}
```

Der Server prüft zunächst gespeicherte Command-Belege: gleiche ID und gleicher Inhalt sind idempotent; gleicher Name mit anderem Inhalt ist ein Konflikt. Anschließend muss `base_revision` dem aktuellen Stand entsprechen. Der validierte Kandidat, die Revision und der Beleg werden atomar gespeichert.

Ausgabe: `document` mit Metadaten und Framezahl → null oder mehrere binäre Regionen → `committed`. Erst nach vollständigem Empfang, Prüfsummenprüfung und passender Revision wird der gesamte neue Zustand sichtbar. Ein abgebrochener Transfer ersetzt keinen gültigen Stand.

## ODG1-Frame

`ODG1` (vier ASCII-Bytes), Headerlänge als little-endian Uint32, UTF-8-JSON-Header, danach binäre Buffer. Der Header nennt Protokoll, Asset, Region, Basisrevision, Zielrevision, Topologieversion und Modus. Jeder Buffer trägt Offset, Länge, Elementzahl, `f32`/`u32` und SHA-256.

`patch` enthält Vertex-IDs und geänderte Attributwerte. `replace` überträgt eine betroffene Region einschließlich Indizes bei Initialisierung oder Topologiewechsel. Ein kleiner Sculptstrich überträgt kein ganzes Creature-Mesh. Die derzeitige Granularität ist eine Region; größere Regionen werden noch nicht in mehrere progressive Subframes zerlegt.

## Verbindungsausfall

Beendete Befehle gelangen vor dem Versand in IndexedDB. Die UI erlaubt derzeit genau einen unbestätigten Befehl. Nach Reconnect oder Browserneustart öffnet der Client das zuletzt benutzte Asset und sendet denselben Command erneut. Bereits gespeicherte Befehle erhalten einen Duplicate-Ack. Revisionen werden nie automatisch überschrieben.

Ein Konflikt bleibt sichtbar und exportierbar; ausdrücklich verworfene lokale Befehle werden aus dem Journal entfernt. Noch offene, nicht beendete Handbewegungen sind keine bestätigte Revision. Gleichzeitige Bearbeitung aus zwei Browserprofilen, Pairing und automatisches Rebase sind nicht vorhanden.

Eigene Endpunkte: `GET /api/design/catalog`, `POST /api/design/import`, `GET /api/design/assets/{id}`. Import und Geometriefehler dürfen den letzten gültigen Stand nicht verändern. Der eigene Creature-Speicher liegt neben dem Spielstand in `creatures.sqlite3`.

Die aktuelle Metadatennachricht enthält das gesamte Rig; binäres, inkrementelles Skin-Streaming bleibt eine Leistungsverbesserung. Der Nachweis für kleine Sculpt-Deltas ist deshalb kein pauschaler Nachweis für jeden späteren Rig-Workflow.

Veröffentlichung und aktive Reittierwahl haben eigene [HTTP-Verträge](publication.md); sie übertragen keine Meshdaten über den 2-KiB-Spielsteuerkanal. Der Gameplay-Vertrag erhält lediglich die additive Nachricht `mount_asset`.
