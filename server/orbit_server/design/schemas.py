"""Local-only schema registry. No document-provided schema URIs are resolved."""
from functools import lru_cache
import json

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

from orbit_server.paths import ROOT
from .document import DesignError


@lru_cache(maxsize=8)
def schema(name):
    if name not in {"edit-command", "edit-document", "client-message", "ai-edit", "runtime-creature"}: raise DesignError("Unbekanntes Designschema")
    values = [json.loads(path.read_text()) for path in (ROOT / "shared/schemas/design/v1").glob("*.schema.json")]
    registry = Registry().with_resources((v["$id"], Resource.from_contents(v)) for v in values)
    value = next(v for v in values if v["$id"].endswith('/' + name + '.schema.json'))
    Draft202012Validator.check_schema(value)
    return Draft202012Validator(value, registry=registry)


def check(name, value):
    error = next(schema(name).iter_errors(value), None)
    if error: raise DesignError("Designschema verletzt: " + "/".join(map(str, error.absolute_path))[:120])
