# Vom Editor zum Spiel

Der Editor-Master, eine unverbindliche Vorschau und ein veröffentlichtes Spielmodell sind getrennte Objekte. Die Veröffentlichung kopiert eine bestätigte Revision. Spätere Striche verändern weder dieses Artefakt noch eine laufende Spielsitzung.

## Bedienung

1. „Flug vorbereiten“ ergänzt fehlendes Rig, Sitz und Körperbox als normale Undo-Transaktion. Eigene Marker bleiben erhalten.
2. „Im Spiel testen“ veröffentlicht die bestätigte Revision und öffnet `/?test_asset=<hash>`. Desktop/VR starten, mit F beziehungsweise A abheben; am Desktop Leertaste/Shift zum Steigen/Sinken.
3. Der Rückkehr-Link öffnet das zuletzt gespeicherte Editor-Asset. Revision und History bleiben erhalten. Noch nicht abgeschlossene Eingaben müssen vor dem Wechsel bestätigt werden. Auswahl und UI-Werkzeuge werden bei dieser Seitennavigation bislang zurückgesetzt.
4. „Als Arin übernehmen“ wählt dieselbe veröffentlichte Revision für die nächste reguläre Spielsitzung. „Original-Arin“ löscht nur diese Auswahl; die bearbeitete Kreatur bleibt erhalten.

Eine aktive MR-Session erlaubt keinen künstlichen Probeflug. MR muss vor einem bewussten Wechsel in die volle Spielwelt beendet werden.

## Vertrag und Lebenszyklus

`POST /api/design/publish` erhält `{asset_id, revision, activate}`. Die HTTP-Origin und das lokale Browserprofil werden geprüft. Veraltete Revisionen liefern 409. Erlaubte Profile sind `friendly_dragon` (Reittier) und `static_creature`; als Arin kann nur das Reittier gewählt werden.

Das Artefakt entspricht `shared/schemas/design/v1/runtime-creature.schema.json`: Formatversion, Asset-ID, Revision, Quellhash, registriertes Verhalten, ausgewertetes Dokument und Größenbericht. SHA-256 über kanonisches UTF-8-JSON adressiert es unveränderlich. Der Master behält Masken/Layer; die Spielkopie entfernt Masken und enthält die aktuell sichtbare Oberfläche ohne Ebenenstack.

`GET /api/creatures/<hash>` ist profilgebunden. Der Browser prüft den Hash, die Größe und die exakte Revision. HTTP-Kompression verändert die geprüften entpackten Bytes nicht. Gleiche Geometrie wird im GPU-Cache geteilt, Skelett und Abspielzustand pro Instanz erzeugt. Ein fehlgeschlagener Wechsel behält das bisherige Modell. Ist eine aktive gespeicherte Referenz beschädigt, bleibt reguläres Spielen mit der vorhandenen Figur möglich; ein ausdrücklich gepinnter Probeflug wird in diesem Fall abgelehnt.

`GET /api/creatures/active` liefert die aktuelle Wahl. `POST` mit `{hash}` wählt eine bekannte eigene Revision; `{hash: null}` aktiviert den ursprünglichen Arin. Auf dem Gameplay-WebSocket folgt nach `hello` die additive Nachricht `mount_asset` mit Assetreferenz und `test_flight`. Eine Sitzung hält diese Referenz fest, bis sie neu verbunden wird.

Ein Testflug erhält einen frischen flüchtigen Spielstand. Weder periodisches Speichern noch das Speichern bei Verbindungsende schreibt dabei den regulären Fortschritt. Reguläre Sitzungen verwenden weiterhin ihren normalen Save.

## Grenzen

Pro Profil höchstens 64 veröffentlichte Versionen und 128 MiB; höchstens 60000 Dreiecke je Spielmodell. Ein voller Speicher lehnt zusätzliche Versionen ab. Automatisches Löschen veröffentlichter Versionen ist noch nicht vorgesehen. Eine veröffentlichte Figur ist zunächst Arins Darstellung, kein beliebiges missionsgesteuertes neues NPC-Verhalten.

Sitz, Rig, Gewichte und Clips werden validiert und verwendet. Collider werden validiert und aufbewahrt; detaillierte Kollisionen des editierbaren Körpers mit Terrain/Vegetation sind noch offen. Die bisherige einfache Flugphysik bleibt aktiv. Das Budget und der Softwaretest sind kein Beleg für eine bestimmte Quest-Bildrate.

Prüfung: `tests/design/test_publication.py` deckt Besitzergrenzen, CAS, Hashkorruption, Rückwahl und Testflug ohne Save ab. `check-published-creature.mjs` durchläuft die echte Browser-UI bis zum Flug und zurück und prüft gemeinsam genutzte Geometrie mit unabhängigen Skeletten.
