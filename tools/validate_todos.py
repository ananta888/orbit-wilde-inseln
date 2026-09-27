"""Original Orbit validator for Ananta-style task tracks plus semantic invariants."""
import argparse
from collections import Counter
import json
from pathlib import Path

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

ROOT = Path(__file__).resolve().parents[1]
STATUSES = ("todo", "in_progress", "partial", "blocked", "done")


def summarize(data):
    tasks = data["tasks"]
    task_map = {task["id"]: task for task in tasks}
    for milestone in data["milestones"]:
        states = [task_map[ident]["status"] for ident in milestone["task_ids"]]
        milestone["status"] = "done" if all(s == "done" for s in states) else "todo" if all(s == "todo" for s in states) else "blocked" if all(s == "blocked" for s in states) else "in_progress"
    critical = [task_map[key] for key in data["critical_path_tasks"]]
    done = sum(task["status"] == "done" for task in tasks)
    counts = Counter(task["status"] for task in tasks)
    priorities = Counter(task["priority"] for task in tasks)
    risks = Counter(task["risk"] for task in tasks)
    milestones = Counter(item["status"] for item in data["milestones"])
    critical_done = sum(task["status"] == "done" for task in critical)
    return {"total": len(tasks), "by_status": {key: counts[key] for key in STATUSES},
            "progress_percent_done": round(done / len(tasks) * 100, 2),
            "by_priority": {key: priorities[key] for key in ("P0", "P1", "P2", "P3")},
            "by_risk": {key: risks[key] for key in ("low", "medium", "high")},
            "critical_path": {"total": len(critical), "done": critical_done, "remaining": len(critical) - critical_done},
            "milestones": {"total": len(data["milestones"]), **{key: milestones[key] for key in STATUSES}}}


def validate_track(data):
    schema = json.loads((ROOT / "todos/todo.track.schema.json").read_text())
    alias = json.loads((ROOT / "todos/todo.schema.json").read_text())
    registry = Registry().with_resource(schema["$id"], Resource.from_contents(schema))
    errors = [error.message for error in Draft202012Validator(alias, registry=registry).iter_errors(data)]
    if errors: return errors
    tasks = {task["id"]: task for task in data["tasks"]}
    milestones = {item["id"]: item for item in data["milestones"]}
    if len(tasks) != len(data["tasks"]): errors.append("Duplicate task ID")
    if len(milestones) != len(data["milestones"]): errors.append("Duplicate milestone ID")
    assigned = []
    for milestone in milestones.values():
        for ident in milestone["task_ids"]:
            assigned.append(ident)
            if ident not in tasks or tasks[ident]["milestone_id"] != milestone["id"]: errors.append("Invalid milestone membership: " + ident)
    if Counter(assigned) != Counter(tasks.keys()): errors.append("Each task must belong to exactly one milestone")
    visiting, visited = set(), set()

    def visit(ident):
        if ident in visiting: errors.append("Dependency cycle: " + ident); return
        if ident in visited: return
        if ident not in tasks: errors.append("Unknown dependency: " + ident); return
        visiting.add(ident)
        task = tasks[ident]
        for dependency in task["dependencies"]:
            visit(dependency)
            if task["status"] == "done" and dependency in tasks and tasks[dependency]["status"] != "done":
                errors.append("Done task has incomplete dependency: " + ident)
        visiting.remove(ident); visited.add(ident)

    for ident, task in tasks.items():
        visit(ident)
        if (task["status"] == "done") != (task["progress_percent"] == 100): errors.append("Invalid completion percent: " + ident)
        for path in task["affected_files"]:
            candidate = Path(path)
            if candidate.is_absolute() or ".." in candidate.parts: errors.append("Affected file must be relative: " + path)
    if not set(data["critical_path_tasks"]) <= set(tasks): errors.append("Unknown critical path task")
    if errors: return errors
    previous = [item["status"] for item in data["milestones"]]
    expected = summarize(data)
    if previous != [item["status"] for item in data["milestones"]]: errors.append("Stale milestone status")
    if expected != data["tasks_status_summary"]: errors.append("Stale task summary; run --refresh")
    return errors


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("paths", type=Path, nargs="*")
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    failed = False
    for path in args.paths or sorted((ROOT / "todos/active").glob("todo.*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if args.refresh:
                data["tasks_status_summary"] = summarize(data)
                path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
            errors = validate_track(data)
        except (ValueError, KeyError, OSError) as exc: errors = [str(exc)]
        if errors:
            failed = True
            print(path.name + ": INVALID\n" + "\n".join(errors))
        else: print(f"{path.name}: valid ({len(data['tasks'])} tasks)")
    return int(failed)


if __name__ == "__main__": raise SystemExit(main())
