The validator is an importable, tested domain service, not a second implementation:

```sh
python -m orbit_server.missions.cli validate
python -m orbit_server.missions.cli validate --content path/to/content
```

It checks schemas, capabilities, references, versions, dependencies, file boundaries and size limits. See `server/orbit_server/missions/packages.py` and the content specification.
