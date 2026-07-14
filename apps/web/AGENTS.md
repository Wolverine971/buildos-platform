<!-- apps/web/AGENTS.md -->

# BuildOS Web Agent Instructions

These instructions apply to work under `apps/web`.

## Svelte workflow

- When creating, editing, debugging, or reviewing `.svelte`, `.svelte.ts`, or `.svelte.js`
  files, load the official `svelte-code-writer` and `svelte-core-bestpractices` skills.
- Prefer the `svelte-file-editor` agent for bounded Svelte-file work when it is available.
- Use the Svelte MCP documentation tools when syntax or framework behavior is uncertain.
- Run the Svelte autofixer on every touched Svelte component or module. Resolve actionable
  issues and re-run it until the touched code is clean.
- After Svelte edits, run `pnpm --filter @buildos/web check` from the repository root.

## Project constraints

- Use Svelte 5 runes for new and modified reactive code. Prefer `$derived` or `$derived.by`
  for computed state; reserve `$effect` for synchronization with external systems or other
  genuine side effects, and include cleanup where required.
- Treat props as changing inputs. Values computed from props should remain reactive.
- Do not opportunistically migrate unrelated legacy syntax, actions, class directives,
  stores, or component APIs. Keep refactors within the requested scope.
- Prefer modern Svelte 5 patterns in new code, but preserve established BuildOS abstractions
  when replacing them would expand the task or alter behavior.
- Experimental async Svelte is not enabled in `svelte.config.js`. Do not introduce async
  template expressions or other experimental async features without an explicit config and
  product decision.
- Keep existing project validation, formatting, accessibility, Inkprint design-system, and
  `$lib/icons/lucide` conventions intact.
