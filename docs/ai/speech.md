# Lokale Sprache und Hardware-Verteilung

Der Standardpfad ist Quest-Mikrofon → Orbit → Ananta → Whisper → Dialogmodell → TTS → Quest. Aufnahme und Wiedergabe passieren im Browser; Erkennung und Sprachsynthese auf dem Laptop. Alle Dienste sind optional. Ohne Sprachdienste bleiben Texteingabe, Auswahlfelder, Missionen und Flug nutzbar.

## Ananta anbinden

Die vorhandene Ananta-Integration stellt `POST /api/game-dragon/decide`, `/transcribe` und `/speak` bereit. Orbit nutzt einen eigenen Bearer-Token, ausschließlich auf dem Server. Er erscheint weder im Browser noch in diesem Repository.

```sh
export ORBIT_ANANTA_URL=http://127.0.0.1:5000
export ORBIT_ANANTA_TOKEN_FILE=/absolute/private/path/game-token
python -m orbit_server --http
```

Alternativ kann eine ignorierte `.local/dragon.json` mit `hub_url` und `token_file` verwendet werden. Umgebungsvariablen haben Vorrang. Unter Windows PowerShell entspricht das `$env:ORBIT_ANANTA_URL=...`. Der Ananta-Hub muss seine eigenen ASR-/LLM-/TTS-Dienste bereits eingerichtet haben; Orbit installiert oder verändert ihn nicht.

Der Adapter übersetzt den bereits verwendeten Jev-Vertrag mit Stimmung/Geste/Sprache in `CharacterResponse`. Die aktuelle Hub-Route erhält Höhe, Geschwindigkeit, Region, höchstens drei Tierarten und sechs Dialogeinträge. Missionen und Erinnerungen sind im internen Kontextmodell vorbereitet; der bestehende enge Jev-Endpunkt überträgt diese Erweiterungen noch nicht. Ein neuer Hub-Vertrag muss explizit versioniert und getestet werden.

## Whisper.cpp auf der Radeon 780M

[Whisper.cpp](https://github.com/ggml-org/whisper.cpp) unterstützt Vulkan und CPU. Bei einer eigenen Installation kann der Build mit `-DGGML_VULKAN=1` erfolgen. Das tatsächlich gewählte Gerät muss über die Startup-Ausgabe identifiziert werden. Ein Vulkan-Index ist zwischen Rechnern/Starts nicht zuverlässig gleich; nach integriertem AMD-Gerät suchen und die Gerätesicht vor dem Prozessstart begrenzen. Nicht pauschal „GPU 0“ als 780M voraussetzen.

Die gewünschte Aufteilung ist **ASR auf der integrierten 780M**, optionales größeres LLM auf der eGPU, Piper auf CPU. Ein separat gestarteter Whisper-Prozess ohne GPU kann als Fallback dienen. `FallbackRecognizer` wechselt bei Dienstfehler/Timeout auf diesen explizit konfigurierten CPU-Endpunkt und kennzeichnet den Rückfall. Orbit behauptet ohne Hardware-Nachweis nicht, welches Gerät ein fremder Dienst tatsächlich verwendet.

`WhisperCppHTTP` spricht `/inference` und erwartet PCM-WAV; Browser liefern meist Opus/WebM. Im bevorzugten Ananta-Pfad übernimmt dessen Sprachbridge die Konvertierung. Der direkte Adapter ist für WAV-Quellen beziehungsweise einen separat eingesetzten Konverter gedacht. `ORBIT_WHISPER_URL` aktiviert den direkten WAV-Endpunkt, `ORBIT_WHISPER_CPU_URL` optional dessen CPU-Fallback; `ORBIT_PIPER_URL` ersetzt den TTS-Endpunkt. Für Quest-WebM die Whisper-Variablen leer lassen und die konvertierende Ananta-Bridge verwenden. Modelle werden separat beschafft und nicht eingecheckt. Ein Vulkan-Softwaretest ist kein Nachweis auf einer realen 780M.

## TTS und Austauschbarkeit

`PiperHTTP` spricht einen lokalen POST-Endpunkt mit `{"text": "..."}`, der WAV zurückgibt. Alternativ leitet `AnantaSpeech` TTS durch den Hub. Piper-Binärdateien, Python-Paket und Stimmen sind nicht Bestandteil von Orbit. Die aktuelle Piper-Linie hat eine eigene GPL-Lizenz; Stimmen haben individuelle Modellkarten. Sie werden nicht als BSD-Assets weitergegeben.

Eigene Adapter implementieren `SpeechRecognizer.transcribe → Transcript`, `SpeechSynthesizer.synthesize → bytes` oder `DialogueProvider.reply → CharacterResponse`. Dienste können dadurch ausgetauscht werden, ohne Missionslogik, Rendering oder Eingabecode anzupassen. Die HTTP-Verträge werden mit Fake-Diensten getestet, nicht mit Pflichtdownloads großer Modelle.

## Aufnahme und Grenzen

„Mikrofon aktivieren“ fragt die Browserfreigabe nach einer Nutzeraktion an. B im Drachenflug oder das Feld „Frei antworten“ startet eine begrenzte Aufnahme; im Missionsdialog erneut wählen sendet sie. Desktop-Text funktioniert unabhängig vom Mikrofon. Maximal 20 Sekunden und 2 MiB; Nichtaufnahme deaktiviert die Tracks. Fokusverlust, Pause und Missionswechsel verwerfen laufende Aufnahmen. Freie Antworten werden nicht als Rohtext in Spielständen gespeichert.

Anfragen und Antworten haben Größen-/Zeitlimits; TTS wird erst nach dem Text abgespielt. Ein Serial verhindert verspätete Antworten aus alten Gesprächen. Fehlschläge werden angezeigt, während die Welt weiterläuft. Logs sollen weder Tokens noch Audio oder freie Spielertexte enthalten.
