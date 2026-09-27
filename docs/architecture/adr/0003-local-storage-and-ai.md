# ADR 0003: Lokale Speicherung und externe AI-Adapter

Status: angenommen.

Für Spielstände wurden JSON-Dateien, SQLite und ein eigener Datenbankdienst verglichen. SQLite bietet atomare Transaktionen ohne weiteren Prozess. Ein validierter JSON-Body pro Browserprofil hält das anfangs offene Fortschrittsmodell flexibel. Unbekannte Save-Versionen werden nicht stillschweigend umgedeutet. Es gibt noch keine echte v0→v1-Migration, weil v1 das erste öffentliche Format ist; der Migrationspunkt lehnt unbekannte Versionen ab.

Für Sprache und NPCs stehen direkte Modellimports, subprocess-Bündelung und HTTP-Dienste zur Wahl. Separate Dienste halten Modellwahl, GPU-Gerät, Lizenz und Laufzeit unabhängig vom Spiel. Ananta bleibt bevorzugter Orchestrator. Der vorhandene Jev-Vertrag wird durch einen Adapter normalisiert; direkte Speech-Ports stehen für austauschbare lokale Dienste bereit. Piper/Ananta-Code wird nicht in das BSD-Projekt kopiert.

KI-Ausgaben werden auf Text, bekannte Emotion/Animation und Hinweise begrenzt. `requested_action` bleibt null. Action-Policies kommen erst mit konkreten Mechaniken hinzu. ASR auf 780M/Vulkan und CPU-Fallback sind Backend-Konfigurationen, keine vom Browser behaupteten Fähigkeiten.

Grundlagen: [SQLite-Transaktionen](https://sqlite.org/lang_transaction.html), [Whisper.cpp](https://github.com/ggml-org/whisper.cpp), [Piper](https://github.com/OHF-Voice/piper1-gpl).
