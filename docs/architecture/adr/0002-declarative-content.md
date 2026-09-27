# ADR 0002: Geschlossenes JSON-Contentformat

Status: angenommen.

Zur Auswahl standen ausführbare Python-/JavaScript-Plugins, eine freie Ausdruckssprache oder deklarative JSON-Pakete. Das Fundament benötigt nachladbare kleine Episoden, gute Fehlermeldungen und Tests ohne Codeausführung. Wir verwenden JSON Schema Draft 2020-12 mit der etablierten Python-Bibliothek `jsonschema` und ergänzen eine kleine semantische Prüfung für Referenzen, Abhängigkeiten und Mechaniken.

Eine allgemeine Regel-/Scripting-Engine wäre größer als die aktuellen Aufgaben und würde die Content-Vertrauensgrenze unnötig öffnen. Die Runtime verarbeitet deshalb eine feste Ereignisliste und all/any-Ziele. Ein Paket kann keinen beliebigen Ausdruck auswerten. Neue Mechaniken erfordern einen expliziten Engine-/Schema-Vertrag.

Kandidatenkataloge werden vollständig validiert, aktive Missionen pinnen immutable Paketbytes. Das ist einfacher nachprüfbar als Live-Mutation laufender Zustandsmaschinen. V1 erlaubt ausschließlich zentrale prozedurale Assets. Medienimport und versionsübergreifender Installer werden separat entwickelt.

Grundlagen: [Draft 2020-12](https://json-schema.org/draft/2020-12), [jsonschema](https://python-jsonschema.readthedocs.io/en/stable/), [kontrollierte Referenzauflösung](https://python-jsonschema.readthedocs.io/en/stable/referencing/).
