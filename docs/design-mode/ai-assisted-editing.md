# KI-gestützte Bearbeitung

Ananta in der Werkstatt ist die sichtbare Assistentenfigur. Der vorhandene Ananta-`game-dragon`-Dialogvertrag ist kein Geometrie-Editor. Eine Design-Anbindung verwendet einen eigenen, geschlossenen Planungsvertrag.

## Provider

`ORBIT_DESIGN_AI_URL` bezeichnet einen vom Betreiber konfigurierten HTTP-Endpunkt. Bevorzugt zeigt `ORBIT_DESIGN_AI_TOKEN_FILE` auf eine private Tokendatei; alternativ existiert `ORBIT_DESIGN_AI_TOKEN`. Keine Tokens oder Endpunkte kommen aus Kreaturendateien. Es gibt keine obligatorische Cloud.

```json
{
  "schema_version": "1.0",
  "context": {"asset_id": "arin", "base_revision": 17, "name": "Arin", "selected_parts": [{"id":"head","locked":false,"protected_fraction":0,"bounds":[[-0.4,1.4,-2],[0.4,2,-1.2]]}], "allowed_tools": ["smooth"]},
  "instruction": "Glätte den ausgewählten Übergang"
}
```

Der Kontext enthält nur ausgewählte Teile mit Begrenzungsboxen, Sperre und Maskenanteil. Vollständige Weltzustände, Audio, Dateipfade, Secrets oder freie ausführbare Programme werden nicht übertragen. Die Antwort hat maximal 32 KiB, vier Operationen und 1000 Zeichen Erklärung. Redirects sind ausgeschaltet; das Zeitbudget beträgt 45 Sekunden.

```json
{
  "speech": "Hier ist mein Vorschlag für den Übergang.",
  "operations": [{"tool": "smooth", "regions": ["head"], "samples": [[0, 1.8, -1.6]], "radius": 0.3, "strength": 0.3}]
}
```

`shared/schemas/design/v1/ai-edit.schema.json`, die Werkzeug-Allowlist, Auswahlprüfung und Geometrievalidierung gelten hintereinander. Masken und gesperrte Teile gelten auch für KI. Ein Materialwechsel über eine geschützte Fläche wird abgelehnt.

## Vorschau

Die Berechnung erzeugt einen Kandidaten auf der aktuellen Basisrevision. Original/Vorschlag kann umgeschaltet werden. Bei stabiler Vertexzuordnung und unveränderten diskreten Materialien lässt sich der Anteil von 0–100 % verändern; der Server berechnet beim Annehmen denselben Anteil erneut. Diskrete Material-/Topologieänderungen deaktivieren den Regler. „Neuer Vorschlag“ wiederholt die Planung gegen die unveränderte Basis. Ablehnen ändert keine Geometrie; Annehmen schreibt genau einen Historyeintrag. Eine inzwischen geänderte Revision macht den Vorschlag ungültig.

Ohne konfigurierten Dienst steht ein ausdrücklich gekennzeichneter lokaler Befehlsparser für Glätten, Größenänderung und wenige Oberflächenbegriffe zur Verfügung. Das ist kein generatives Modell und versteht keine beliebigen anatomischen Wünsche. Prozentangaben betreffen den Werkzeugparameter, nicht garantierte Endmaße jedes maskierten Vertex.

Die Mikrofonaufnahme nutzt Orbits bestehende `VoiceCapture`-/Transkriptionsroute. Ein realer Whisper-/Ananta-Aufruf setzt die in [Speech](../ai/speech.md) beschriebenen Dienste voraus. Automatisierte Tests verwenden keine echte Mikrofonfreigabe. Die konkrete Ananta-Anbindung liegt im separaten Ananta-Repository: `/api/game-dragon/design` delegiert die begrenzte Entscheidung an den lokalen Jev-Dienst. Editmodus erlaubt Formen, Materialwahl und kontrolliertes Anfügen eines Horns/Flügels an ausgewählte ungeschützte Teile. Der Server übernimmt nie Modellcode oder frei wählbare Ziele.

„Neue Kreatur aus Beschreibung · Vorschau“ sendet `mode: "generate"`. Das Modell wählt aus acht prozeduralen Vorlagen und begrenzten Parametern für Körper, Hals, Flügel, Schwanz und Hörner. Die erzeugte Geometrie bleibt Kandidat und ist nach Annahme vollständig Undo-fähig. Bestehende Sperren/Masken verhindern das Ersetzen; dafür eine neue Kreatur öffnen. Freie neuronale Meshgenerierung und mehrere räumliche Varianten sind weiterhin offen.

## Lokal starten und prüfen

Der zugehörige Ananta-Adapter ist als separater [PR #154](https://github.com/ananta888/ananta/pull/154) veröffentlicht. Seine Route muss in der verwendeten Hub-Installation registriert und mit eigenen Game-Credentials aktiviert sein. Der Orbit-Code setzt keine anderen parallelen Änderungen aus dem lokalen Ananta-Checkout voraus.

```sh
export ORBIT_DESIGN_AI_URL=http://127.0.0.1:5000/api/game-dragon/design
export ORBIT_DESIGN_AI_TOKEN_FILE=/absolute/private/path/game-token
python -m orbit_server --http
```

`tools/run-local.py` lädt alternativ eine ausdrücklich angelegte, ignorierte `.local/runtime.json` mit diesen Umgebungsvariablen. Normale Tests lesen diese Datei nicht. `python tools/diagnostics/check-services.py --run-live` prüft die konfigurierten echten Dienste, einschließlich eines erzeugten Audio-Beispiels. Die Diagnose braucht keinen Zugriff auf ein Mikrofon und speichert weder Token noch Rohaufnahmen im Ergebnis.
