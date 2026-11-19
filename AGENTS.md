# AGENTS.md

Instructions for AI coding agents (Codex, Claude Code, …) working in this repo.

## Read first
1. `docs/HANDOFF.md` — project status, what is in progress, next steps (start here).
2. `CONTEXT.md` — domain glossary. Use these terms in code, UI and docs (Reading, Link, Baseline, Observed, Site…).
3. `docs/plans/live-link.md` — the plan for the feature currently being built.

## Commands
```bash
pnpm install
pnpm dev         # http://localhost:5173 (needs macOS for real RSSI; otherwise fake readings)
pnpm typecheck
pnpm test        # vitest
pnpm build
pnpm e2e         # Playwright
```

## Rules
- **Do not start, stop or kill a dev server on port 5173** — the owner usually has one running (often shared through an ngrok tunnel). Use another port for your own server or E2E.
- Git flow: `main` ← `dev` ← `feature/*`. Work on a feature branch cut from `dev`; merge back into `dev`, then `dev` into `main`. Commit/push only when the owner asks. Conventional-commit style subjects (`feat(live): …`, `fix: …`).
- TypeScript strict with `noUncheckedIndexedAccess`. Pure logic lives in `src/core` (no React/DOM/three) and gets vitest unit tests; UI in `src/ui`.
- UI text is Thai. Keep the "Observed vs Simulated" distinction visible: anything from real sensors is labelled ของจริง, never passed off as simulation or vice versa.
- Never claim more than the sensor can do: say "ไม่มีการเคลื่อนไหว", never "ห้องว่าง"; never count people or identify who.
- Tests must assert exact values and be checked by mutating the source (break one rule, confirm a test fails, restore).
- Determinism: simulation uses seeded RNG and serialization is byte-identical — no `Math.random()` in core.
- Talk to the owner in Thai; agree on design before coding new features; offer choices with a recommendation.
