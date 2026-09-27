# ADR: Bestehende HTTPS-Adresse unter Windows und WSL

Status: angenommen.

Der alte Prototyp lief nativ unter Windows auf HTTPS 8443, der aktuelle Checkout in WSL auf einem anderen HTTP-Port. Ein neuer Git-Stand ersetzt keinen bereits laufenden Prozess. Der Startpfad muss deshalb ausdrücklich zum aktuellen Repository führen.

Ein nativer Windows-Spielserver mit Quellcode über `\\wsl.localhost` wurde geprüft. Werkstattbefehle benötigten unter Browserlast mehrere Sekunden; parallele Prüfungen liefen in Timeouts. Die bestehende Linux-Umgebung enthält bereits die nativen Geometriebibliotheken, Modelleinstellungen und Spielstände. Eine zweite Laufzeit mit Datenmigration wäre für diese Installation unnötig.

Gewählt: aktueller HTTPS-Spielserver in WSL plus eine begrenzte TCP-Weiterleitung auf Windows. Python `asyncio` reicht für diesen lokalen Transport; eine zusätzliche HTTP-Proxy-Konfiguration ist nicht erforderlich. Die Weiterleitung terminiert TLS nicht und verändert weder Host/Origin, Cookies noch WebSocket-Daten. Der Backend-Server bindet Loopback; externe Erreichbarkeit wird am Windows-Listener ausdrücklich freigegeben.

Der WSL-Starter verwendet `.venv`, `.local/runtime.json` und `.local`-Daten. Nur ein nach PID, vollständigem Befehl und HTTPS-Antwort identifizierter eigener Prozess wird wiederverwendet. Belegte fremde Ports werden abgelehnt. Windows prüft die Erreichbarkeit und das Zertifikat des Backends vor seinem Start. Verbindungen, Puffer und Leerlaufzeiten der Weiterleitung sind begrenzt; Halb-Schließen und Shutdown haben Socket-Tests.

Grenzen: Windows muss WSL über localhost erreichen können. Zwei eigene Prozesse gehören zu einem vollständigen Neustart. Ein rein nativer Windows-Checkout kann weiterhin direkt über den dokumentierten Python-HTTPS-Start laufen; dieser WSL-Starter ersetzt keine allgemeine Installationsverwaltung. Hardwareabnahme auf der Quest bleibt separat.
