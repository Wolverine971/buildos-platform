<!-- apps/web/AGENTS.md -->

# BuildOS Web Agent Instructions

These instructions apply to work under `apps/web`.

## Svelte workflow

- After Svelte edits, run `pnpm --filter @buildos/web check` from the repository root.
  This runs `svelte-kit sync && svelte-check`.
- The Svelte team's official skills live in `.claude/skills/` (`svelte-core-bestpractices`,
  `svelte-code-writer`). Follow them, and run the official autofixer on components you
  write or change: `npx @sveltejs/mcp svelte-autofixer <file> --svelte-version 5.57.1`
  (free, local). Treat its `$effect` suggestions as prompts to think, its `issues` as errors.
- `eslint-plugin-svelte`'s recommended rules are on (they were silently off until
  2026-10-31). Violations that predate that are grandfathered in
  `apps/web/eslint-suppressions.json`. Don't add to it to dodge a rule; fix new code. When
  you fix a grandfathered violation, ESLint reports the stale entry: run
  `pnpm --filter @buildos/web exec eslint . --prune-suppressions` and commit the smaller file.
- Keyed `{#each}` needs a key that is unique in that list (a DB id, never the index).
  Duplicate keys break rendering, so leave a list unkeyed with an eslint-disable comment
  saying why when uniqueness isn't guaranteed.
- Element behavior goes in attachments (`{@attach ...}`, see `src/lib/attachments/`), not
  `use:` actions. `use:enhance` is SvelteKit's API and stays.
- Wrap surfaces that render records or model output (a message, a card, an embed) in
  `ErrorBoundary` (`$lib/components/ui/ErrorBoundary.svelte`) so one bad record shows a
  quiet "This part didn't load" card instead of breaking the page. It catches browser-side
  render and effect errors; server-render errors still go to `+error.svelte`.

## Project constraints

- Use Svelte 5 runes for new and modified reactive code. Prefer `$derived` or `$derived.by`
  for computed state; reserve `$effect` for synchronization with external systems or other
  genuine side effects, and include cleanup where required.
- Treat props as changing inputs. Values computed from props should remain reactive.
- Do not opportunistically migrate unrelated legacy syntax, class directives, stores, or
  component APIs. Keep refactors within the requested scope.
- Prefer modern Svelte 5 patterns in new code, but preserve established BuildOS abstractions
  when replacing them would expand the task or alter behavior.
- Experimental async Svelte is not enabled in `svelte.config.js`. Do not introduce async
  template expressions or other experimental async features without an explicit config and
  product decision. Note: compiling even one component with `await` imports
  `svelte/internal/flags/async`, which switches the whole runtime into async scheduling,
  so a "one-page pilot" is an app-wide change.
- Keep existing project validation, formatting, accessibility, Inkprint design-system, and
  `$lib/icons/lucide` conventions intact.
