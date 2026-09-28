# Menüs, Hände und Körper

## Bedienung

Am gewählten Bogen-Handgelenk erscheinen **Episoden** und **Arin**, sobald die Hand vor dem Körper liegt. X links öffnet/schließt ebenfalls die Episoden. Das geöffnete Panel steht etwa 60 cm vor dem Kopf, knapp unter Augenhöhe, und bleibt in dieser lokalen Raumposition. Es hat drei Optionen pro Seite, große Trefferflächen und einen Schließen-Knopf. Lange Texte lassen sich durch Antippen des Textes weiterblättern; die Pfeile blättern Optionen.

Controller: auf das Feld zeigen, Trigger drücken und **über demselben Feld loslassen**. Wegziehen verwirft die Auswahl. Hände: zeigen, Daumen und Zeigefinger zusammenführen, wieder öffnen; alternativ mit dem Zeigefinger von vorn antippen. Hervorhebung und Ring zeigen das getroffene Feld, Controller bestätigen mit kurzer Haptik. Weitere Auslösung braucht eine neue Geste. Trackingverlust verwirft die angefangene Auswahl; bei Händen ist zuerst eine offene Hand erforderlich.

Das Menü sperrt den Bogen und die Stickbewegung, bis es geschlossen wird. Kopf und Hände bleiben unmittelbar getrackt. In MR bleibt künstliche Bewegung ausgeschaltet. Metas reservierte Systemgesten werden nicht nachgebaut oder abgefangen.

Arin lässt sich zu Fuß, im Flug und in MR ansprechen. B rechts startet bei vorbereitetem Mikrofon eine Aufnahme; Loslassen sendet sie. Ohne freigegebenes Mikrofon fragt B nach der Umgebung. Im Desktop öffnet **Arin** das Text-/Sprachfenster; **Schließen** kehrt zurück. Auf schmalen Bildschirmen weichen die Episodenoptionen während des Gesprächs, damit die Bedienflächen sich nicht überdecken.

## Darstellung

Die lokal gebündelten WebXR-Profile zeigen zum verbundenen Controller passende Hardware, etwa Quest Touch Plus. Echte Hand-Eingaben steuern das Hautmodell anhand der 25 WebXR-Gelenke. Bei Controllern sind Fingerstellungen **berechnete Greifposen**, abhängig von Trigger, Griff und Bogenrolle; keine Behauptung von erfasstem Fingertracking.

Der Bogen sitzt an `gripSpace` statt am Zeigestrahl. Die Controllerhand hat einen gemeinsamen anatomischen Griffpunkt mit dem 29 mm breiten Bogengriff. Handfläche, Daumen und Finger umfassen ihn; die berechneten Fingerwinkel berücksichtigen die einzelnen Gelenklängen. Das Handgelenk wird passend versetzt, Finger werden dabei nicht gestreckt. Der Bogen bleibt innerhalb des Griffstücks gerade, damit die Wurfarme nicht durch die Finger laufen.

Bei echtem Handtracking bestimmen Handgelenk und Fingergrundgelenke die Lage vor der Handfläche sowie die Griffachse. Die angezeigten Finger folgen weiterhin unverändert den erfassten Gelenken; es wird keine künstliche Faust darübergelegt. Die Zughand verwendet Daumen-/Zeigefingerspitzen. Auszug und Zielrichtung bleiben aus zwei physischen Handpositionen bestimmt. Fehlende oder degenerierte notwendige Handgelenke blenden den Bogen aus und brechen den Auszug ohne Schuss ab.

Der VR-Körper verwendet Kopf und Handgelenke als Eingabe für Ellbogen-/Knieberechnung. Beine setzen abwechselnd auf, schwingen über den Boden und federn beim Ducken ein; Gangrichtung folgt der Bewegung. Der Reiter bleibt auf Arins Rücken ausgerichtet, während die Kamera frei dem Kopf folgt. In MR ist dieser geschätzte Ganzkörper ausgeblendet. Fuß- und Hüftpositionen sind **Animation, kein Body Tracking**; echtes Beintracking und eine Nutzerkalibrierung bleiben Erweiterungen.

Reh und Wildschwein haben Hüfte, Knie, Sprunggelenk und gespaltene Hufe. Bodenkontakt und Schwungphase sind getrennt. Gehen und schneller Trab verwenden unterschiedliche Beinphasen, Geschwindigkeit steuert die Schrittfrequenz. Aliens bewegen sich zweibeinig. Die Modelle bleiben stilisiert.

## Arin am Boden

In VR und der Desktop-Vorschau steht Arin einige Meter neben dem Spieler und folgt dessen Bewegung mit begrenzter Geschwindigkeit. Bloßes Umsehen versetzt ihn nicht. Das eingebundene CC0-Skelett verwendet seine Originalclips **idle** und **walk**; Flügel und Hals wechseln beim Flug in die berechnete Flugpose. Kurze Blick-/Nickgesten ergänzen die Clips. Die Kieferbewegung läuft nur während tatsächlich gestarteter Audioausgabe und ist eine Sprechbewegung, keine phonetische Lippensynchronisation.

Beim Landen wird die Begleiterpose eingeblendet und der Reiter ausgeblendet. Beliebige Kopfrotation bleibt unabhängig. Auf ungeladenem Terrain, im Wasser oder vor starken Höhenstufen wird kein neuer Standplatz gewählt. Das ist eine visuelle Folgebewegung ohne Wegsuche um Bäume, präzise Fuß-IK oder eigene serverseitige Drachenphysik. Größere Weltversetzungen setzen die Begleiterposition neu. Im MR-Raum wird das große Drachenmodell ausgeblendet; Gespräch, Auswahl und Audio bleiben erreichbar.

Eigene veröffentlichte Kreaturen haben Vorrang. Deren vorhandene `idle`-/`walk`-/`fly`-Clips werden genutzt; fehlende Gehclips werden nicht künstlich als vorhandene Animation ausgegeben. Ein Ladefehler beim CC0-Modell erhält die prozedurale Rückfalldarstellung.

## Grafik

Vor dem Start wählbar: Flüssig / Ausgewogen / Hoch. Das Profil steuert XR-Auflösung, Foveation, Schattenauflösung/-aktualisierung und Detailentfernung. Nahvegetation hat zusammengesetzte Palmwedel; entfernte Vegetation wird vereinfacht. Boden, Fels und Haut haben Oberflächendetails; Wasser verwendet flache/tiefe Farbe, bewegte Normalen, Himmelsreflexion, Sonnenglanz und Uferschaum. Die Himmelsreflexion enthält keine live gespiegelten Objekte.

Die Quest rendert diese Materialien selbst. Laptop und optionale eGPU übernehmen in diesem Pfad Simulation bzw. KI; sie erhöhen nicht automatisch die Quest-Grafikleistung. Das Profil „Hoch“ ist eine Auswahl, keine garantierte Quest-Bildrate. Keine dynamischen Bildschirmspiegelungen oder schwere Vollbild-Posteffekte.

## Nachweise und offene Hardwareprüfung

Automatische Prüfungen: `npm test`, `node tools/diagnostics/check-mission-xr.mjs`, `npm run test:xr` und `node tools/diagnostics/check-presence.mjs` gegen einen separaten lokalen Server. `npm run test:bow` ergänzt Nahaufnahmen der linken und rechten Greifhand von Handfläche und Handrücken; die echten Hand-GLBs werden auf Abstand zur Griffoberfläche geprüft. IWER emuliert Quest-Eingaben einschließlich Handgelenken. Screenshots und Renderstatistik aus Chromium belegen Darstellung und Funktionspfade, **keine** Quest-FPS, reale Passthrough-Bilder oder ergonomische Abnahme.

Auf echter Quest verbleiben: Textgröße aus normaler Armhaltung, Hand-/Controller-Wechsel, Fingerkuppen-Treffer, Bogen-Griffausrichtung, Trackingverlust, Haptik und GPU-/Frametime-Messungen bei dichtem Dschungel. Der Nutzer hat die Weiterentwicklung vorerst ohne Headset gewählt.

## Standards und Entscheidung

- [Meta: Hands UI Best Practices](https://developers.meta.com/horizon/design/hands-ui-best-practices/): ausreichend große Ziele, klare Rückmeldung und stabile komplexe Panels.
- [Meta: WebXR Hands](https://developers.meta.com/horizon/documentation/web/webxr-hands/): Gelenke, Zeigestrahl und reservierte Palm-Pinch-Systemgeste.
- [WebXR Device API, Eingabeereignisse](https://immersive-web.github.io/webxr/#input): abgeschlossene Auswahl und abgebrochene Eingabe unterscheiden.
- [WebXR Input Profiles](https://github.com/immersive-web/webxr-input-profiles): Controllerdarstellung und Handmodell.

Orbit verwendet Standard-WebXR mit Three.js. Metas native Interaction SDK ist keine WebXR-Bibliothek und wird hier nicht als verfügbar ausgegeben. Der Handgelenk-Dock ist Orbit-UI, kein nachgebautes Quest-Systemmenü.
