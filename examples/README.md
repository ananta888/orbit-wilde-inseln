# Beispiele

`python examples/mission-events.py` führt die Tempelgeschichte ohne Rendering mit bereits geprüften Domänenereignissen aus. Diese Ereignisse sind kein Client-API: Im Spiel prüft `GameSession` Eingaben, Nähe und Inventar, bevor die Runtime sie erhält.

Die vollständigen editierbaren Beispielpakete liegen in `content/missions`. Zum Entwickeln eines neuen Pakets eine Kopie mit neuen IDs anlegen und die [Spezifikation](../docs/content-format/specification.md) beachten. `tests/test_mission_runtime.py` zeigt zusätzlich reale Pfeilphysik, unterschiedliche Lösungswege und Save/Resume.
