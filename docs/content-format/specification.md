# Content Package v1.0.0

Diese Spezifikation beschreibt das **tatsächlich implementierte** Format. Normative Struktur und Grenzen stehen in `shared/schemas/v1/`. Alle Dateien sind UTF-8-JSON ohne doppelte Schlüssel, NaN oder Infinity. Unbekannte Felder werden abgelehnt. `$id`-URLs der Schemas sind Identifikatoren; der Loader lädt keine Schemas aus dem Netz.

## Layout und Identität

```text
content/
  assets/catalog.json
  core/world.json
  missions/<directory>/
    manifest.json
    mission.json
    world.json
    objectives.json
    learning.json
    dialogue.json
    encounters.json
```

Ein Verzeichnis enthält genau diese sieben Dateien. Keine Symlinks, Geräte, Unterverzeichnisse, eingebetteten Skripte oder zusätzlichen Dateien. In v1 liegen Assets ausschließlich im zentralen Katalog; deshalb braucht ein Paket keinen eigenen `assets/`-Ordner. Alle derzeit unterstützten Assets sind eigene prozedurale Generatoren. Ein späterer Medienimport bekommt ein eigenes, versioniertes Format mit Hash, Typ, Herkunft, Lizenz und Größenbudget.

IDs erfüllen `[a-z][a-z0-9_.-]{0,63}`. `schema_version` ist in jedem Paketdokument exakt `1.0.0`. `version` im Manifest ist die unabhängige semantische Paketversion `MAJOR.MINOR.PATCH`. Jede Änderung am Inhalt benötigt eine neue Paketversion. `capabilities` sind separat versionierte Mechanikverträge wie `bow.v1`; sie sind keine Paketversionen.

## manifest.json

| Feld | Bedeutung |
|---|---|
| `id`, `version`, `title`, `summary` | Stabile Episode, Version und sichtbare Beschreibung |
| `license` | V1-Beispielpakete: BSD-3-Clause; Erweiterung um andere Assetlizenzen ist eine separate Formatentscheidung |
| `duration_minutes` | `min`, `target`, `max`, jeweils 1–120; min ≤ target ≤ max. Designziel, kein Countdown |
| `capabilities` | Eindeutige, vollständig deklarierte Mechanikanforderungen |
| `assets` | Eindeutige IDs aus dem zentralen Katalog; Objektverweise müssen hier aufgeführt sein |
| `dependencies` | Exakte `{id, version}`-Paketabhängigkeiten; fehlende Versionen und Zyklen sind Fehler |
| `files` | Feste Zuordnung der sechs übrigen JSON-Dateien; keine benutzerdefinierten Pfade |
| `difficulty` | Inhaltsmetadatum 1–5; überschreibt keine persönliche Einstellung |
| `prerequisites` | Bereits abgeschlossene Missionen; IDs müssen existieren, Voraussetzungsketten dürfen nicht zyklisch sein |

Aktuelle Capabilities: `interaction.v1`, `dialogue.v1`, `bow.v1`, `wind.v1`, `inventory.v1`, `branching.v1`. Der Loader prüft sowohl unbekannte als auch fehlende notwendige Deklarationen. Zukünftige Pakete mit unbekannter Mechanik werden abgelehnt, statt scheinbar erfolgreich geladen zu werden.

## mission.json

`id` muss dem Manifest entsprechen. `stages` ist eine geordnete Liste von 1–16 Stufen. Jede Stufe besitzt `id`, `title`, `phase`, `objectives`, `completion` und `narration`. Phasen sind `discover`, `movement`, `learning`, `finale`. `completion: all` verlangt alle Ziele, `any` mindestens eine Alternative. `narration` referenziert eine Dialogzeile. Jedes Ziel gehört genau einer Stufe an; Ziele späterer Stufen zählen noch nicht.

`solutions` beschreibt benannte Lösungswege mit Ziel-IDs. Am Ende werden tatsächlich erfüllte Wege im Spielstand vermerkt. `rewards` enthält `memories` und `discoveries`, `next_missions` explizite Verweise. Belohnungen werden serverseitig vergeben; eine Wiederholung darf Erinnerungen und Beziehung nicht unkontrolliert vervielfachen.

## world.json

`wind` ist ein Vektor in m/s, jede Komponente −15 bis +15. Er beeinflusst relative Luftdämpfung, nicht die Kopfpose. `objects` enthält 1–64 Einträge mit eindeutiger `id`, `kind`, `asset`, `position`, `mr_position`, `label`, `verbs`, `material` und gegebenenfalls `motion`.

Koordinaten verwenden Meter, +Y nach oben, −Z initial vor dem Spieler. Im VR-/Desktopmodus ist Y ein Offset zur lokalen Bodenhöhe; `mr_position` ist relativ zum platzierten Raumursprung. Ziele erhalten zusätzlich eine Mitte in 1,2 m Höhe. Bewegte Ziele haben `motion: {axis: x|z, amplitude: 0..3, speed: 0.1..3}`; die deterministische Auslenkung ist `sin(elapsed * speed) * amplitude`. Der Server liefert ihre aktuelle Position und Kollisionsgröße.

Arten: `wind_marker`, `target`, `moving_target`, `plank`, `bridge`, `boar`, `oracle`, `ruin`, `bait`, `route`. Materialien: `wood`, `stone`, `organic`, `energy`. Materialbezeichnungen werden im Trefferereignis transportiert; differenzierte Penetration und Abpraller sind noch nicht implementiert. Objekte referenzieren passende zentrale Generatoren. Der Client erhält nur erlaubte Daten und erzeugt Geometrien mit vertrauenswürdigem Engine-Code.

## objectives.json

Jedes Ziel besitzt `id`, `description`, `event`, `target`, `count`, `requires_items`, `consumes_items`, `learning_goals`. `count` liegt zwischen 1 und 20; portable Gegenstände werden genau einmal gesammelt. Verbrauchte Gegenstände müssen auch vorausgesetzt werden. Referenzen auf Zielobjekte, Inventar und Lernziele werden geprüft.

Erlaubte Ereignisse:

| Ereignis | Serverseitige Bedeutung |
|---|---|
| `observe` | Spieler fordert eine Beobachtung in Reichweite an; kein behauptetes Eye Tracking |
| `collect` | Tragbares Objekt wird nach Prüfung in das Inventar aufgenommen |
| `use` | Aktuelle Stufe und Inventar erlauben die Anwendung am Zielobjekt |
| `speak` | Eine nichtleere freie Antwort wird abgegeben; kein automatischer Sprachniveau-Nachweis |
| `reach` | Spieler erreicht einen gültigen Interaktionsort |
| `hit` | Pfeil-Solver bestätigt eine Kollision; vom Client nicht direkt auslösbar |
| `distract` | Deklarierte Ablenkung mit geprüften Gegenständen |
| `sneak` | Gewählter geschützter Weg in Reichweite; noch keine volle Sicht-/Geräuschsimulation |

`GameSession` prüft Objektverb, Entfernung, Stufe, Pause, Inventar und Rate-Limit. Die Runtime bekommt danach ein `GameEvent`, keinen ungeprüften WebSocket-Payload. Beobachten/Schleichen sind zunächst diskrete Spielinteraktionen. Kontinuierliche Greif-, Seh- und Schleichsimulation kann später hinter demselben Ereignisvertrag ergänzt werden.

## learning.json

`domain` ist eine offene ID, z. B. `physics`, `language`, `logic`, `biology`. `framework` und `level` sind Metadaten; CEFR/GER ist optional. `goals` enthält ID, Beschreibung, Achsenliste aus `body`, `skill`, `mind` und eine Beschreibung des beobachtbaren Nachweises. Ein Ziel wird über zugeordnete erfüllte Spielziele erfasst. Das ist noch kein Beleg für dauerhaftes Wissen oder Fitness.

`adaptation` benennt erlaubte Signale (`attempts`, `time`, `accuracy`, `hints`, `application`, `language`, `repetitions`), `enabled` und verpflichtend `manual_override: true`. Die Runtime überschreibt aktuell keine Schwierigkeit automatisch. Das Format ermöglicht spätere nachvollziehbare Vorschläge.

## dialogue.json und encounters.json

Dialogzeilen haben eindeutige ID, `character` (`arin`, `ananta`, `guide`), Sprache und Text. Die Hinweise enthalten exakt je einen Eintrag für Level 1–4. Level 4 benötigt zusätzlich die explizite Anfrage `full_help: true`. Inhalt darf keine ausführbaren Ausdrücke enthalten; Texte werden mit Canvas/textContent dargestellt, nie als HTML interpretiert.

NPCs besitzen ID, Charakter, referenziertes Objekt und feste Verhaltensrolle (`companion`, `oracle`, `instructor`, `territorial`). Die Metadaten bereiten weitere Simulation vor; heute verwenden die Beispiele Ortsfiguren und diskrete Interaktionen. `events` enthält ausschließlich `{id, on_objective, action, target}` mit `action: reveal|hide`. Andere Spielaktionen sind in v1 nicht erlaubt. Sichtbarkeitsänderungen werden aus erfüllten Zielen abgeleitet, nicht als Code ausgeführt.

## Grenzen, Integrität und Deduplizierung

Maximal 1 MiB Quelldaten pro Paket und 128 Pakete pro Katalog; Einzelgrenzen stehen zusätzlich im Schema. IDs innerhalb einer Kategorie sind eindeutig. JSON wird vor der Aktivierung vollständig validiert. Kanonisch sortierte Dokumente bestimmen SHA-256. Das unveränderliche Paket liefert pro Verbraucher eine eigene Datenkopie.

Zentrale Generator-IDs werden von mehreren Paketen referenziert, nie kopiert. V1 hat deshalb keine mehrfach eingebetteten Binärassets. Der Builder schreibt reproduzierbare ZIPs und einen Report mit Quellgröße, Archivgröße, Paket-/Archiv-SHA-256 und referenzierten Assets. Prüfsummen liefern Integrität, keine Signatur oder Vertrauensgarantie.

## Hot-load, Pinning und Fehler

1. Autor bearbeitet ein installiertes Paket und erhöht dessen Version.
2. Der Watcher prüft den gesamten Kandidatenkatalog außerhalb der Simulationsarbeit.
3. Nur ein vollständig gültiger Kandidat wird im Eventloop atomar ersetzt.
4. Laufende Missionen behalten ihre alte `Package`-Instanz; neue Starts verwenden den neuen Stand.
5. Fehler werden über `/health` gemeldet; der letzte gültige Stand läuft weiter.

Ein Save pinnt ID, Version und Inhalts-Hash. Fehlt nach Neustart genau dieses Paket, bleibt der Save erhalten und die Oberfläche erklärt den fehlenden Stand. Der Spieler kann bewusst eine neue Episode starten. Gleichzeitige Installation mehrerer Versionen und automatischer sicherer ZIP-Import sind noch Roadmap; Pakete werden heute als lokale geprüfte Verzeichnisse bereitgestellt. Niemals fremde Archive ungeprüft in den Content-Pfad entpacken.

## Neue Episode erstellen

Ein Beispielverzeichnis kopieren, neue IDs und Verweise setzen, Capabilities und Lernziele deklarieren, MR-Positionen kompakt wählen und alle Lösungswege über echte GameEvents testen. Danach:

```sh
python -m orbit_server.missions.cli validate
python -m orbit_server.missions.cli build
python -m pytest tests/test_content_packages.py tests/test_mission_runtime.py
```

Das Format bewusst erweitern, falls eine Mechanik fehlt: Schema-Version/Capability, Domänenhandler, Netzwerk-/Clientdarstellung, Reject-Tests und Dokumentation gehören zusammen. Ein beliebiges `script`-Feld ist kein Erweiterungspunkt.
