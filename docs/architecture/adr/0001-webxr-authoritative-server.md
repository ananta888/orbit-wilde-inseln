# ADR 0001: WebXR-Client und autoritativer Python-Server

Status: angenommen für das Fundament.

Die bestehende Anwendung besitzt funktionsfähige Three.js/WebXR-Eingaben und eine Python-Simulation. Geprüfte Alternativen sind ein nativer OpenXR-Client, vollständiges PCVR-Videostreaming oder eine neue Engine. WebXR nutzt bereits lokale Quest-Darstellung und standardisierte Session-/Input-APIs; der Python-Server passt zu lokaler Simulation und AI-Orchestrierung. Die Entscheidung erhält die vorhandenen Spielmechaniken und macht Transport/Content zu klaren Modulen.

Wir verwenden aiohttp statt eines selbstgebauten HTTP-/WebSocket-Stacks. Native ES-Module reichen zunächst; ein zusätzlicher Bundler löst derzeit kein nötiges Laufzeitproblem. npm sperrt Three.js und Testwerkzeuge. JavaScript-Verträge und Python-Domänenports werden schrittweise typisiert; breitere Typprüfung des übernommenen Rendercodes bleibt ausdrücklich offen.

Konsequenzen: Quest-GPU rendert, Laptop-GPU beschleunigt dadurch nicht unmittelbar jeden Quest-Frame. Aufwendigere Desktopphysik/AI ergänzt Quest-Tracking und Rendering. Künftige native APIs werden hinter Capability-Adaptern ergänzt. WebXR allein verspricht keine Raum-, Body- oder Guardian-Daten.

Grundlagen: [WebXR-Spezifikation](https://www.w3.org/TR/webxr/), [Three.js WebXRManager](https://threejs.org/docs/#api/en/renderers/webxr/WebXRManager), [aiohttp-Dokumentation](https://docs.aiohttp.org/en/stable/web_advanced.html).
