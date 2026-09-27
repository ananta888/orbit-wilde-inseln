# ADR: Regionen, Revisionen und lokale Speicherung

Status: angenommen für den ersten Designprotokollvertrag.

Der Editor erhält einen separaten WebSocket-Vertrag. Frameweise Mesh-Uploads über das Game-Input-Protokoll würden sowohl das 2-KiB-Steuerbudget als auch die Zuständigkeit der Spielsimulation verletzen.

Ein Befehl bezieht sich auf Asset-ID und Basisrevision. Der Server besitzt die Geometrie, der Client besitzt nur Vorschau und Eingabe. Eine bestätigte Operation ist eine SQLite-Transaktion mit Command-Beleg. Unbestätigte Befehle werden vor dem Versand in IndexedDB gesichert.

Geometrie wird regional übertragen: IDs plus Float32-Deltas bei stabiler Topologie, Regionalersatz bei Topologiewechsel. Der Client aktiviert nur vollständige Transaktionen. Komplettsynchronisation ist ein expliziter Start-/Recovery-Pfad.

SQLite speichert Creature-Revisionen getrennt von Gameplay-Profilen. SHA-256-adressierte Zahlenblöcke deduplizieren unveränderte Geometrie. Die Architektur vermeidet damit einen vollständigen Snapshot pro Tracking-Frame. History, spätere benannte Snapshots und Runtime-Pins müssen bei zukünftiger Garbage Collection als Referenzwurzeln gelten.

Bewusste Begrenzungen der ersten Version: eine schreibende Verbindung pro Asset, ein ausstehender Clientbefehl, kein Kollaborationsmerge, keine automatische Veröffentlichung in die Welt. Ein Konflikt ist sichtbar und überschreibt keine entfernte Revision.
