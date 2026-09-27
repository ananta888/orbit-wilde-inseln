# Integrationsgrenzen

| Vorhandenes Subsystem | Designer-Verbindung | Abgrenzung |
|---|---|---|
| `networking/http.py` | Optionale Registrierung eigener Designrouten | `/ws` und Gameplay-Protokoll 4 behalten ihre Budgets |
| `networking/session.py` | Kein Import in die Geometriedomäne | Missionen, Flug, Belohnungen und Gameplay-Save bleiben separat |
| `rendering/dragon.js` | `assets.js::existingArin` erstellt eine neue DragonMount-Instanz | Geometrie wird kopiert; nur Ressourcen dieser Instanz werden freigegeben |
| `audio/recording.js` | `VoiceCapture` liefert transkribierten Text | Mikrofonfreigabe durch Nutzereingabe; keine implizite Aufnahme |
| `ai/dragon.py` | Keine ungeprüfte Wiederverwendung von Dialogantworten als Geometrie | Design-Provider besitzt eigenen strukturierten Vertrag |
| `persistence/store.py` | Getrennte `creatures.sqlite3` neben dem Spielstand | Assetrevision und Lernfortschritt werden nicht vermischt |
| Content-Katalog | Noch kein Runtime-Publishing | Geänderte Creature-Assets ersetzen keine Mission automatisch |

Ein Test in `tests/design/test_protocol.py` hält eine Gameplay-Sitzung während Vorschau, Annahme und Undo aktiv. Game-Ping und Spielphase müssen danach erhalten bleiben. Die komplette Foundation-Suite ergänzt diesen Regressionstest. Die globale Spielwelt wird bei einem Editor-Roundtrip nicht neu initialisiert.

Der Wechsel über den Link zurück zur Spielseite ist ein Seitenwechsel mit dem bestehenden Save-/Resume-Verfahren. Eine nahtlose gemeinsame XR-Sitzung mit isoliertem Testflug ist ein eigener Task. Die derzeitige Sitzansicht ist ausdrücklich keine Flugabnahme.
