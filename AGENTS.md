# Working on Orbit – Wilde Inseln

Read README.md, ARCHITECTURE.md and the active TODO track before changing a subsystem.
User instructions and explicitly authorized work take precedence over this guide.

## Ownership and interfaces

- `server/orbit_server`: authoritative simulation, missions, persistence and provider adapters.
- `client/webxr/src`: presentation, XR input and local movement prediction. Never grant mission rewards here.
- `shared/schemas/v1` and `shared/protocol`: versioned contracts; coordinate changes with both ends.
- `content`: declarative packages only. No Python, JavaScript, expressions, remote schema resolution or shell commands.
- `tools`: reproducible validation, diagnostics and packaging; no production policy decisions.
- Ananta's external hub orchestrates AI. `AnantaOracle` is a game character; `AnantaAdapter` is a service adapter. Keep these distinct.

Use small modules, dependency injection, typed Python interfaces and documented JavaScript contracts. Keep pure simulation independent of HTTP, devices and models. Prefer established libraries; record substantial choices in `docs/architecture/adr`. Do not introduce an engine rewrite to solve an isolated feature.

## Workflow

1. Inspect `git status` and relevant source/tests. Preserve other people's edits.
2. Update the relevant task in `todos/active/todo.orbit-core-foundation.json`; declare dependencies, affected files, acceptance criteria and tests. Status is evidence of completion, not intent.
3. Implement within the authorized scope. Keep runtime data out of source control.
4. Run focused tests, then the documented foundation checks. Hardware checks must be labeled as physical hardware or emulation; do not substitute one for the other.
5. Refresh TODO summaries with `python tools/validate_todos.py --refresh`; validate without `--refresh` before committing.
6. Inspect the diff and stage explicit paths. Use specific conventional commit messages. Never bypass hooks, invent test results or amend a published commit without authorization.

## Invariants

- The laptop owns game events. Clients send bounded intentions; model output never executes arbitrary actions.
- Keep simulation stepping independent of speech latency. Cancel stale conversations on session changes.
- MR has no artificial locomotion. Camera tracking remains independent of the dragon's body pose.
- Save versions and content versions are distinct. Active missions pin a validated immutable package; invalid updates retain the last working catalog.
- No time limit for learning episodes. Manual difficulty and fitness choices win over recommendations.
- Local saves, microphone recordings, keys, certificates, model weights and logs belong in ignored runtime directories. Never commit secrets or personal configuration.
- Orbit source and original procedural assets are BSD-3-Clause. External components retain their licenses; inspect every asset's provenance. Do not copy Ananta/Piper source or models into this repository.
- Tests must run unattended and without Quest hardware, an LLM, microphone access or external services. Keep hardware/integration diagnostics opt-in.

## Definition of done

The behavior is executable, error paths are handled, relevant tests pass, contracts/docs agree, and the TODO track reflects actual completed and outstanding work. A stub, emulator pass or planned adapter is not a verified hardware feature. Report limitations directly; no fabricated Ananta evidence identifiers.
