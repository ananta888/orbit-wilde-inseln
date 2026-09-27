# Task tracks

`todo.track.schema.json` defines the strict Orbit task-track format; `todo.schema.json` is its public entry point. The structure uses the same concepts as Ananta: `owner`, `track`, scales, milestones, tasks and derived status summaries. It is an original Orbit implementation with additional required dependencies, affected files, tests and Definition of Done.

`active/todo.orbit-core-foundation.json` is the authoritative development track. Completed foundations and unfinished game features are separate tasks. Move a fully closed track to `archive/`, retaining its schema version.

```sh
python tools/validate_todos.py --refresh
python tools/validate_todos.py
```

The refresh command recalculates summaries and milestone status. It does not mark tasks done. The validator checks exact membership, dependency references/cycles, completion percentages, relative paths and summary consistency. Marking a task done while a dependency is unfinished is invalid. Do not invent runtime evidence identifiers; record real local test commands or actual CI links.
