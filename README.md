# new-card-game

A 2D worldmap card-and-combat game built with **Phaser 3**, **Vite**, and **TypeScript**. Planning, decisions (ADRs), and feature specs live in the hotseat `new-card-game` workspace.

## Architecture (ADR-002)

Game logic and rendering are deliberately separated so every game rule is unit-testable without a browser or Phaser:

- **`src/core/`** — pure, engine-agnostic game logic (ECS: entities, components, systems). **Never imports `phaser` or touches the DOM.** Enforced by a Vitest core-purity guard test.
- **`src/scenes/`** — Phaser `Scene` adapters: translate input into commands and render component state.
- **`src/render/`** — helpers that sync ECS state onto Phaser display objects.
- **`src/main.ts`** — boots `Phaser.Game`.

Import aliases: `@core/*`, `@scenes/*`, `@render/*`.

## Assets (ADR-004)

Reference every texture by a logical key (e.g. `enemy.melee.idle`), never a raw path. Real art lives at `assets/<key-path>.png` (served from the site root by Vite's `publicDir`); `assets/placeholder/` holds optional placeholder pngs. Each asset is described in the hotseat "Asset Placeholders" plan for later generation.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | typecheck (`tsc --noEmit`) then `vite build` |
| `npm run preview` | preview the production build |
| `npm test` | run the Vitest unit suite once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run typecheck` | `tsc --noEmit` |

## Conventions & deferred tooling

- The `src/core` → `phaser` boundary is enforced by `src/core/corePurity.test.ts` (a standalone Vitest guard test).
- ESLint, Prettier, and CI are intentionally **deferred** (see the Scaffolding feature decisions) and can be added in a later tooling pass.
