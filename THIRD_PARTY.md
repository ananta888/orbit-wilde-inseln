# Herkunft und externe Komponenten

Orbit-Code, Texte der Beispielmissionen, SVG-Symbol und prozedural erzeugte Geometrien stammen aus diesem Projekt von Peter Stuiber und stehen unter BSD-3-Clause. Das Fundament übernimmt und modularisiert den vorherigen lokalen Orbit-Prototyp. Es enthält keine heruntergeladenen Tier-, Drachen-, Landschaftsmodelle, Texturen oder Stimmen.

| Komponente | Verwendung | Lizenz / Quelle |
|---|---|---|
| Three.js | Browser-Rendering; `npm ci` kopiert lokale Module samt LICENSE in das ignorierte Vendor-Verzeichnis | [MIT](https://github.com/mrdoob/three/blob/dev/LICENSE) |
| aiohttp | HTTP und WebSockets auf dem Laptop | [Apache-2.0](https://github.com/aio-libs/aiohttp/blob/master/LICENSE.txt) |
| jsonschema / referencing | Lokale Schema- und Referenzprüfung | [MIT](https://github.com/python-jsonschema/jsonschema/blob/main/COPYING), [MIT](https://github.com/python-jsonschema/referencing/blob/main/COPYING) |
| Playwright | Browserprüfungen, nur Entwicklung | [Apache-2.0](https://github.com/microsoft/playwright/blob/main/LICENSE) |
| IWER | WebXR-Emulation, nur Entwicklung | [MIT](https://github.com/meta-quest/immersive-web-emulation-runtime/blob/main/LICENSE) |
| Whisper.cpp | Optionaler externer ASR-Dienst | [MIT](https://github.com/ggml-org/whisper.cpp/blob/master/LICENSE) |
| Piper, aktuelle OHF-Voice-Linie | Optionaler externer TTS-Dienst; kein Import oder Bündeln des Piper-Codes | [GPL-3.0](https://github.com/OHF-Voice/piper1-gpl/blob/main/LICENSE.md) |
| Piper-Stimmen | Nicht enthalten; Lizenz je Stimme prüfen | [Voice-Dokumentation](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/VOICES.md) |
| Ananta | Externer Orchestrator über HTTP; kein Ananta-Code kopiert | Die Lizenz der jeweiligen Ananta-Installation gilt; das referenzierte Projekt verwendet AGPL-3.0-or-later |

Die BSD-Lizenz dieses Repositories ändert keine Lizenz externer Komponenten. Modellgewichte und Stimmen haben eigene Bedingungen und müssen getrennt beschafft werden. Bei späteren Distributionen jedes tatsächlich mitgelieferte Asset und jede Abhängigkeit einzeln inventarisieren. Das zentrale Asset-Verzeichnis enthält derzeit ausschließlich Verweise auf eigene prozedurale Generatoren.
