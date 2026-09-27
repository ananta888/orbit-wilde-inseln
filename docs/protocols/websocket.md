# WebSocket-Protokoll 4

Transport: gleiche HTTPS-Origin, `/ws`, JSON-Text, Meter/Sekunden, +Y oben, −Z vorwärts. Der Server beginnt mit `hello` und `protocol: 4`. Der Client meldet Inkompatibilität. Es gibt keine Aushandlung mit älteren Prototypversionen. Normative Clientstruktur: `shared/schemas/v1/client-message.schema.json`; Flugparameter: `shared/protocol/flight-config.json`.

| Richtung | Typ | Zweck |
|---|---|---|
| C→S | `enter {mode}` | desktop, vr oder mr; setzt Bewegung zurück |
| C→S | `start`, `restart`, `pause`, `resume` | Erkundung starten/fortsetzen; keine Episoden-Zeitbegrenzung |
| C→S | `move {direction,dt,seq,flight}` | Richtung (2D oder 3D), Schritt ≤ 0,12 s, wachsende Sequenz |
| C→S | `loose {origin,direction,draw,seq}` | Bogenabsicht; Server prüft Ursprung, Auszug 0,08–0,65 m und Schussrate |
| C→S | `mission_start {id}`, `mission_leave` | Episode bewusst starten oder verlassen |
| C→S | `interact {target,verb,text?}` | Begrenzte Interaktionsabsicht; `hit` darf keinen Fortschritt erzeugen |
| C→S | `hint {level,full_help?}` | Hinweis 1–4, für 4 explizit full_help true |
| C→S | `settings {fitness,difficulty,adaptive}` | Manuelle Profileinstellungen; adaptive ist noch keine automatische Anpassung |
| C→S | `dragon {message}` | Kommentar/freier Dialog im Flug |
| C→S | `ping {time}` | Monotone Clientzeit für RTT |
| S→C | `hello` | Version, Physik-/Snapshotrate, installierte Missions-IDs |
| S→C | `mount_asset` | Nach hello: optionale gepinnte Kreaturenreferenz `{hash,asset_id,revision,url,...}` und `test_flight`; null verwendet den ursprünglichen Arin, ein gesetztes `error` behält das bisherige Modell |
| S→C | `state` | tick/time/phase, Spielerposition/velocity/moveAck, Flugdaten, Tiere, Pfeile, Treffer und Strecke |
| S→C | `environment` | Chunk-upsert/remove, Revision, Regeln, optional Planet |
| S→C | `mission` | Katalogrevision, aktive Phase/Ziele/Inventar, Weltobjekte, Einstellungen, Abschlussliste |
| S→C | `released`, `ignored`, `hit`, `miss` | Bestätigte Schuss- und Kollisionsereignisse; `hit.target` ist optional eine Missionsobjekt-ID |
| S→C | `oracle` | Validierte Hint-Antwort; keine ausführbare Aktion |
| S→C | `dragon`, `dragon_audio` | Thinking/ready/offline und kurzlebige lokale Audio-URL mit Serial |
| S→C | `error`, `pong` | Begrenzte Fehlermeldung bzw. Echo der Pingzeit |

Zustandssnapshots ersetzen ältere Zustände. Terrainupdates benutzen monotone Sitzungsrevisionen und Content-Hashes. Bei Reconnect werden Darstellung/Vorhersage zurückgesetzt, aktuelle Chunks vollständig übertragen und der lokale Spielstand geladen. Es gibt keine Wiederholung ungeprüfter Interaktionen aus einer unterbrochenen Sitzung.

Der Client sagt lokale Fortbewegung voraus; Kopftracking und Controllerdarstellung bleiben lokal. `moveAck` bestätigt Serververarbeitung. Der Server besitzt ein Zeitguthaben gegen Paket-Spam, normiert Eingaben und sperrt künstliche Fortbewegung im MR-Modus. Ein Client kann keine Ereignisliste oder Lernbelohnung einsenden.

Maximal 2 KiB je Nachricht, 60 pro Sekunde und vier parallele Profile. Ein Profil hat nur eine aktive Verbindung. Langsame Sender/Empfänger werden begrenzt. Diese lokale Vertrauensgrenze ist keine fertige Internet-Multiplayer-Authentifizierung. Server bindet standardmäßig an Loopback; LAN-Freigabe ist eine ausdrückliche Startoption.

Audio läuft getrennt: `POST /api/dragon/transcribe` mit WebM/WAV/Ogg/MP4 zum konfigurierten Bridge-Dienst; maximal 2 MiB, höchstens zwei gleichzeitige Anfragen. `GET /api/dragon/audio/{id}` liefert WAV aus einem kleinen, kurzlebigen Cache. Mikrofon- oder Tokeninhalte werden nicht über Zustandsnachrichten verteilt.
