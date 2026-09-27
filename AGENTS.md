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

## Creature Designer

The separate track `todos/active/todo.vr-ai-creature-designer.json` owns design-mode work. Update this track for editor changes; leave unrelated foundation tasks intact. Refresh a single track by passing its path to `tools/validate_todos.py --refresh`.

- Read `docs/design-mode/overview.md` and the two `design-*` ADRs before editing the designer.
- Canonical metres and revisioned region buffers belong to the laptop. Browser preview never becomes authoritative by itself.
- Every new mutation needs schema validation, mask/lock handling, resource limits, reversible history, and a test of its failure path.
- Changes to ODG1 must update both decoders and the Python-generated cross-language fixture in `examples/design/odg1-triangle.json`.
- Do not silently remove unknown UV/skin/morph/layer data during import. Extend the format with tests, or reject the unsupported input.
- The original creature, AI candidate, accepted revision and runtime asset are separate objects. No editor command writes gameplay rewards or missions.
- Runtime references pin asset ID, revision and SHA-256. A test flight must never write the ordinary gameplay save. Do not mutate cached shared geometry; skeletons and animation state belong to each instance.
- Preserve sparse layers until an explicit reversible bake. Topology changes need either a proved attribute/skin transfer or a visible rejection/invalidation; never discard protected data silently.
- Optimization uses the pinned local meshoptimizer worker, with input/time/output budgets. Do not execute paths or programs supplied by content or AI.
- Ananta's design endpoint returns bounded proposals or template parameters. Live-service diagnostics are opt-in; generated audio does not count as a Quest microphone test.
- Hardware-free validation uses `pytest`, `npm test`, `npm run test:design` and `npm run test:design:xr` against a dedicated local test server. Record IWER results as emulation. Do not invent Quest, Whisper, GPU or Ananta integration results.

## Completion evidence

The behavior is executable, error paths are handled, relevant tests pass, contracts/docs agree, and the TODO track reflects actual completed and outstanding work. A stub, emulator pass or planned adapter is not a verified hardware feature. Report limitations directly; no fabricated Ananta evidence identifiers.
