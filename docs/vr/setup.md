# Quest und Laptop verbinden

Orbit läuft im Quest-Browser als echtes stereoskopisches WebXR-Spiel. Der Laptop simuliert die Welt; die Quest rendert sie mit ihrer eigenen GPU und verarbeitet Tracking lokal. USB-C ist für diesen Netzwerkpfad nicht erforderlich.

## Desktop

Nach dem [Schnellstart](../../README.md) ist `http://localhost:8443` für Maus-/Tastaturtests verfügbar. Der Server bindet standardmäßig nur an Loopback. Auf einem anderen Gerät bedeutet `localhost` dieses andere Gerät und führt deshalb nicht zum Laptop.

## Quest über WLAN

Quest und Laptop brauchen einen tatsächlich erreichbaren Netzwerkpfad. Gast- oder Freifunk-Netze können Geräte voneinander isolieren, auch wenn beide denselben WLAN-Namen anzeigen. Ein Laptop-Hotspot oder eigener Router ist für den Test oft übersichtlicher. Die Quest muss die **aktuelle LAN-IP des laufenden Servers** verwenden.

WebXR benötigt einen sicheren Kontext. Erzeuge lokal ein Zertifikat mit passender IP/DNS im SAN, zum Beispiel mit einem bereits eingerichteten `mkcert` oder OpenSSL. Schlüssel bleiben in `.local/` und werden nie veröffentlicht. Beispiel für ein kurzlebiges selbstsigniertes Testzertifikat; die IP ersetzen:

```sh
mkdir -p .local
openssl req -x509 -newkey rsa:2048 -nodes -days 30 \
  -keyout .local/key.pem -out .local/cert.pem \
  -subj '/CN=orbit.local' \
  -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:192.168.1.50'
python -m orbit_server --host 0.0.0.0 --port 8443 \
  --cert .local/cert.pem --key .local/key.pem \
  --url https://192.168.1.50:8443
```

Öffne zuerst `/health` auf der Quest, danach `/`. Ein selbstsigniertes Zertifikat braucht eine Browser-Ausnahme beziehungsweise eine vertrauenswürdige lokale CA. Prüfe `window.isSecureContext` und die sichtbare WebXR-Verfügbarkeitsanzeige; wenn ein Browser die Ausnahme nicht als sicheren Kontext akzeptiert, ist ein vertrauenswürdiges Zertifikat nötig. `http://LAN-IP` genügt dafür nicht.

Unter Windows nur den benötigten Port im privaten Netzwerk freigeben. Bei WSL läuft der Dienst zunächst in einem eigenen Netzwerkraum: native Windows-Python-Ausführung aus demselben Checkout oder ein bewusst konfigurierter WSL-LAN-Zugang ist nötig. Die Windows-Hotspot-Adresse ist nicht automatisch die Adresse eines darin lauschenden WSL-Dienstes. Bei Verbindungsfehlern zuerst Schema http/https, Listener, Port, Zertifikat und Geräteisolierung prüfen. Ein USB-Kabel allein richtet diesen Webserver-Pfad nicht ein.

## Bedienung

Desktop: WASD gehen/fliegen, F starten/landen, Leertaste steigen, Shift sinken, Q/E drehen, rechte Maustaste umsehen, linke Maustaste Bogen spannen/lösen, Esc Pause. Episode und Fitnessprofil vorab wählen oder im Spiel eine Episode beginnen. Aufgabenfelder erfordern Nähe zum jeweiligen Objekt. Freie Antworten können getippt werden.

Quest VR: linker Stick Bewegung, rechter Stick Snap-Turn, A Flug/Landung, rechter Stick vor/zurück Höhe. Bogen links halten, rechts Sehne mit Trigger greifen/ziehen/lösen; Bogenhand umstellbar. X am linken Controller öffnet oder schließt die Missionsfelder. Arins Antworten und Missionsfelder mit Controllerstrahl/Trigger oder direktem Finger-Pinch auswählen. Handtracking ist hier für UI-Auswahl umgesetzt; ein vollständiger handgetrackter Bogen ist noch kein zugesicherter Mechanikpfad.

Quest MR: `immersive-ar` mit transparentem Hintergrund. Raum bleibt sichtbar, künstliche Fortbewegung ist gesperrt. Griff an der Bogenhand platziert die Szene neu. Missionen benutzen kompakte eigene MR-Koordinaten. Es gibt derzeit keine Wand-/Möbelkollisionen, persistente Anchors oder Zugriff auf Guardian-Grenzen.

Für Sprache vor dem XR-Start „Mikrofon aktivieren“ wählen. B im Drachenflug halten oder freie Missionsantwort auswählen. Modell-/ASR-Dienste müssen separat eingerichtet sein. Technische Grenzen und Datenschutz: [Sprache](../ai/speech.md).
