# Freie Modelle und Animationen für Orbit

Stand der Quellenprüfung: 2026-09-28. Für ein öffentliches Repository zählen die Rechte an den **auslieferbaren Rohdateien**, nicht nur ein kostenloser Download. Orbit bevorzugt CC0; CC BY benötigt Autor, Lizenzlink und Änderungsvermerk am Asset. NC/ND werden nicht übernommen.

| Quelle | Wofür | Lizenz / Animation / Automation |
|---|---|---|
| [Quaternius](https://quaternius.com/packs/ultimateanimatedanimals.html) | Zusammenpassende Tiere und Figuren | Dieses Tierpaket: CC0, glTF/FBX/Blend, mehrere Skelettanimationen. Humanoide Animationsbibliotheken benötigen kompatibles Rig oder Retargeting; keine automatische Übertragung auf Vierbeiner. Downloadlinks und Lizenz je Paket prüfen. |
| [OpenGameArt – Cethiels Dragon 3D](https://opengameart.org/node/96662) | Arins Modell | CC0 von Drummyfish/Cethiel, rigged, vier DAE-Clips; lokal in GLB konvertiert. Auf OpenGameArt generell Lizenz **je Upload** prüfen. |
| [Kenney](https://kenney.nl/support) | Props, Baukästen, einige Charakterpakete | Asset-Seiten: CC0; Animationen hängen vom Paket ab. Kein automatisches Rig für beliebige Modelle. |
| [KayKit](https://kaylousberg.com/game-assets) | Figuren, Animationen und stilisierte Umgebungen | Freie und kostenpflichtige Angebote unterscheiden; Lizenz und enthaltene Clips auf der konkreten Produktseite prüfen. |
| [Poly Haven](https://polyhaven.com/license) | PBR-Materialien, Umgebungsmodelle, HDRIs | Assets CC0, gewöhnlich keine Charakteranimation. Öffentliche API hat eigene Nutzungsbedingungen; keine pauschale Erlaubnis zum Website-Scraping ableiten. |
| [ambientCG](https://docs.ambientcg.com/license/) | Boden-, Stein-, Holzmaterialien | CC0, auch Rohdateien verteilbar. [Dokumentierte API](https://docs.ambientcg.com/api/) zur Suche; liefert keine Tierbewegungen. |
| [Mixamo](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html) | Humanoides Rigging und Bewegungen | Adobe-Lizenz, kein CC0. Auto-Rigging unterstützt humanoide Zweibeiner; zusätzliche Drachenflügel/-schwänze sind kein geeigneter Standardfall. Eine Spielnutzung begründet nicht automatisch eine Erlaubnis zur Veröffentlichung der Rohdateien im Asset-Repository. |

Poly Pizza, Sketchfab, BlenderKit, BlendSwap und itch.io sind zusätzliche Suchorte. Ein Plattformname ersetzt keine Prüfung des konkreten Uploads, seines Urhebers und seiner Lizenz. Mengenangaben zu fremden Asset-Indizes sind nicht verifiziert und werden nicht als Projektabhängigkeit übernommen.

## Tatsächlich enthalten

`client/webxr/assets/creatures/arin-cethiel.glb`: **1.262 Dreiecke, 32 Bones, eine eingebettete Textur, vier Clips**, 784.260 Bytes. Autorentextur, keine KI-generierte Textur. Der Flug verwendet zusätzlich eine im Orbit-Code berechnete Flügel-/Halsbewegung; der Download hat **keinen** Flugclip. Quelle, Originalarchiv-Hash und Export-Hash stehen in `content/assets/third-party.json`.

Die Quest-Hand- und Controllermodelle kommen aus dem fixierten MIT-Paket `@webxr-input-profiles/assets`. `npm ci` kopiert nur ausgewählte Profile samt Lizenz und Markenhinweis auf den lokalen Server. Keine Verbindung zu einem Modell-CDN beim Spielen.

Quaternius' Reh und Hirsch wurden in der offiziellen glTF-Dateiliste gefunden. Der Download lieferte beim Importversuch eine Google-Drive-Quotenfehlermeldung, daher wurden diese Dateien **nicht** übernommen. Reh, Wildschwein und Aliens benutzen weiterhin eigene Geometrie, jetzt mit separaten Gelenken, Gangphasen und Bodenkontakt.

## Übernahmepipeline

1. Konkrete Primärquelle, Urheber und Lizenz prüfen; Quelle und Download-Hash notieren.
2. Nur Daten einlesen. Keine mitgelieferten Skripte/Add-ons ausführen. Blender bei Bedarf ohne Autoexec starten.
3. GLB mit eingebetteten Daten erzeugen. Bei Animationen Knochen, Bind-Matrizen, Skalierung, Achsen, Cliplängen und Material prüfen; OBJ allein enthält kein Skelett.
4. Physische Größe und Sitz-/Greifpunkte im Spiel ausrichten. Nur Darstellungsanimation; Treffer und Belohnungen bleiben serverseitig.
5. Dreiecke, Draw Calls, Texturspeicher und Dateigröße erfassen. LOD und Instancing zuerst nutzen; eine niedrige Dateigröße garantiert keine hohe XR-Bildrate.
6. Herkunft in `THIRD_PARTY.md` und dem Inventar ergänzen. `node tools/assets/check-assets.mjs` prüft die eingebauten GLBs offline.
7. Browser-/XR-Emulation prüfen, dann auf echter Quest Laufzeit, Materialdarstellung, Komfort und Tracking prüfen.

### Cethiel-Export reproduzieren

Das offizielle `dragon_oga.zip` nach `.local/assets-source/dragon` entpacken; keine Dateien daraus ausführen. Original-SHA-256 mit dem Inventar vergleichen. Orbit-Testserver starten und ausführen:

```sh
ORBIT_URL=http://127.0.0.1:8765 node tools/assets/convert-cethiel.mjs \
  .local/assets-source/dragon client/webxr/assets/creatures/arin-cethiel.glb
node tools/assets/check-assets.mjs
```

Der Konverter verwendet die mit `package-lock.json` gebundene Three.js-Version und Playwright, lädt lokale DAE/PNG-Daten, ordnet Animationen über Bone-Namen zu und bettet die Textur ein. Er benötigt kein Blender. Nach absichtlichen Exportänderungen das Inventar erst nach erneuter Sicht- und Lizenzprüfung aktualisieren.
