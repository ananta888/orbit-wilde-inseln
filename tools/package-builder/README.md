```sh
python -m orbit_server.missions.cli build --output dist/packages
```

Archives have stable ordering, normalized JSON and fixed ZIP metadata. Sidecar reports contain source/archive sizes and SHA-256 hashes. Shared procedural assets are referenced once in the central catalog and are never copied into each package. Installation currently uses inspected source directories; there is no automatic ZIP extraction or downloaded code execution.
