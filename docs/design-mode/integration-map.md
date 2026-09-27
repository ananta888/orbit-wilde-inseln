# Integrationsgrenzen

| Vorhandenes Subsystem | Designer-Verbindung | Abgrenzung |
|---|---|---|
| `networking/http.py` | Optionale Registrierung eigener Designrouten | `/ws` und Gameplay-Protokoll 4 behalten ihre Budgets |
| `networking/session.py` | Kein Import in die Geometriedomäne | Missionen, Flug, Belohnungen und Gameplay-Save bleiben separat |
| `rendering/dragon.js` | `assets.js::existingArin` erstellt eine neue DragonMount-Instanz | Geometrie wird kopiert; nur Ressourcen dieser Instanz werden freigegeben |
| `audio/recording.js` | `VoiceCapture` liefert transkribierten Text | Mikrofonfreigabe durch Nutzereingabe; keine implizite Aufnahme |
| `ai/dragon.py` | Keine ungeprüfte Wiederverwendung von Dialogantworten als Geometrie | Design-Provider besitzt eigenen strukturierten Vertrag |
| `persistence/store.py` | Getrennte `creatures.sqlite3` neben dem Spielstand | Assetrevision und Lernfortschritt werden nicht vermischt |
| Runtime-Publishing | Separate profilgebundene Asset-Registry und Reittierauswahl | Exakte Revision wird gepinnt; Missionspakete werden nicht automatisch verändert |

Ein Test in `tests/design/test_protocol.py` hält eine Gameplay-Sitzung während Vorschau, Annahme und Undo aktiv. Game-Ping und Spielphase müssen danach erhalten bleiben. Die komplette Foundation-Suite ergänzt diesen Regressionstest. Die globale Spielwelt wird bei einem Editor-Roundtrip nicht neu initialisiert.

Der normale Wechsel zurück zum Spiel verwendet Save/Resume. Der explizite Probeflug verwendet dagegen einen frischen flüchtigen Spielstand und genau die gewählte Assetrevision; Rückkehr ist ein Seitenwechsel zum gespeicherten Editorstand. Eine nahtlose gemeinsame XR-Session und vollständige Wiederherstellung der Werkzeugauswahl bleiben offen. Die Sitzansicht allein ist weiterhin keine Flugabnahme.
