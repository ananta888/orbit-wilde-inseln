"""Local schemas only. Content cannot introduce schemas or network references."""
from functools import lru_cache
import json
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator
from orbit_server.paths import ROOT


class ContentError(ValueError):
    pass


def read_json(path: Path) -> Any:
    def unique(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, value in pairs:
            if key in result:
                raise ContentError(f"Duplicate JSON key: {key}")
            result[key] = value
        return result

    def invalid(value: str) -> None:
        raise ContentError(f"Non-finite JSON value: {value}")

    try:
        return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=unique, parse_constant=invalid)
    except (ValueError, OSError, RecursionError) as exc:
        raise ContentError(f"{path.name}: invalid JSON ({exc})") from exc


@lru_cache(maxsize=16)
def validator(name: str) -> Draft202012Validator:
    if name not in {"manifest", "mission", "world", "objectives", "learning", "dialogue", "encounters", "save", "ai-response", "client-message", "assets"}:
        raise ContentError("Unknown schema")
    schema = read_json(ROOT / "shared" / "schemas" / "v1" / f"{name}.schema.json")
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def validate(name: str, data: Any) -> None:
    # JSON Schema's numeric type does not by itself exclude Python's NaN/Infinity.
    try:
        json.dumps(data, allow_nan=False)
    except (ValueError, TypeError) as exc:
        raise ContentError("Non-JSON value") from exc
    error = next(validator(name).iter_errors(data), None)
    if error:
        location = ".".join(map(str, error.absolute_path)) or "<root>"
        raise ContentError(f"{name}.{location}: {error.message[:240]}")
