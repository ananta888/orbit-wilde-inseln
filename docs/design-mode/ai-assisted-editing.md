# KI-gestützte Bearbeitung

Ananta in der Werkstatt ist die sichtbare Assistentenfigur. Der vorhandene Ananta-`game-dragon`-Dialogvertrag ist kein Geometrie-Editor. Eine Design-Anbindung verwendet einen eigenen, geschlossenen Planungsvertrag.

## Provider

`ORBIT_DESIGN_AI_URL` bezeichnet einen vom Betreiber konfigurierten HTTP-Endpunkt. Optional steht ein Bearer-Token in `ORBIT_DESIGN_AI_TOKEN`. Keine Tokens oder Endpunkte kommen aus Kreaturendateien. Es gibt keine obligatorische Cloud.

```json
{
  "schema_version": "1.0",
  "context": {"asset_id": "arin", "base_revision": 17, "name": "Arin", "selected_parts": [], "allowed_tools": ["smooth"]},
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

Die Mikrofonaufnahme nutzt Orbits bestehende `VoiceCapture`-/Transkriptionsroute. Ein realer Whisper-/Ananta-Aufruf setzt die in [Speech](../ai/speech.md) beschriebenen Dienste voraus. Automatisierte Tests verwenden keine echte Mikrofonfreigabe. Freie Text-to-3D-Generierung, mehrere räumliche Varianten, lokale generative Ergänzungen und konkrete Ananta/Jev-Designintegration bleiben eigene Tasks.
