# Charakterkontext und erlaubte Ausgaben

`ai/context.py` projiziert gezielt Spieleraktivität, gerundete Position, Umgebung, wenige nahe Tiere und die aktuelle Missionsstufe. Arin darf zusätzlich höchstens acht freigegebene Erinnerungs-IDs sehen. Ananta bekommt das aktuelle Lerngebiet, keine private Arin-Gesprächshistorie. Gesperrte Stufen, vollständige Lösungen, die SQLite-Datei und der komplette Weltzustand werden nicht serialisiert.

```json
{
  "player": {"position": [0, 2, -3], "current_activity": "exploring", "recent_actions": []},
  "environment": {"region": "jungle", "height": 2, "speed": 0, "weather": "trade_winds", "nearby_entities": [{"species": "deer"}]},
  "mission": {"id": "physics_001_projectile", "stage": "Lies den Wind", "objectives": ["Vergleiche deine Pfeilbahn mit der Windrichtung."]}
}
```

`recent_actions` ist als begrenzter Erweiterungspunkt vorgesehen und derzeit leer. Der Ananta-Jev-Kompatibilitätsadapter reduziert das interne Modell weiter auf die Felder der vorhandenen Hub-API. Kein Modell erhält implizit mehr Daten, nur weil die Engine sie speichert.

Die normative Antwort ist `shared/schemas/v1/ai-response.schema.json`:

```json
{
  "speech": "Beobachte die Fahne, bevor du den nächsten Pfeil löst.",
  "emotion": "curious",
  "animation": "head_tilt",
  "hint_level": 1,
  "requested_action": null,
  "options": ["Ein genauerer Hinweis, bitte."]
}
```

Emotionen: calm/curious/encouraging/concerned. Animationen: glide/head_tilt/look_around. Text, Antwortauswahl und Hinweistiefe sind begrenzt. `requested_action` ist in dieser Version ausschließlich `null`. Das Spiel akzeptiert keine LLM-Flugbefehle, Belohnungen, Skripte, URLs oder Dateipfade. Wenn später konkrete KI-Aktionsvorschläge hinzukommen, brauchen sie ein neues Schema und eine separate serverseitige Policy mit Vorbedingungen und Ablehnungstests.

Der Charakter Ananta gibt authored hints aus dem Paket aus. Level 4 ist nur auf ausdrücklichen Wunsch erlaubt. Spielertext und Contenttexte bleiben Daten; sie dürfen Rollen, Provider-Endpunkte oder erlaubte Aktionen nicht verändern. Der lokale Modellbetrieb allein ersetzt diese Grenzen nicht.
