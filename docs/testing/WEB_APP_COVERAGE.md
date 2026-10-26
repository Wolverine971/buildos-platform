<!-- docs/testing/WEB_APP_COVERAGE.md -->

# Web testing evidence

- **Last updated:** 2026-10-26
- **Status:** Active

The previous module-by-module percentage estimates and retired-service inventory were not
measured coverage. Use the [behavior risk matrix](./COVERAGE_MATRIX.md) for current priorities,
[runner guide](./README.md) for execution ownership, and `pnpm test:inventory` for current scripts.
CI uploads the actual web coverage report from its single coverage-enabled workspace run.

For a new web change, use focused Vitest tests for domain/route behavior and rendered Svelte
tests for interactions. The experimental browser smoke is paused and incomplete; built-app
navigation and persistence remain a gap. SQL access and atomicity guarantees require the
database lanes; scripted browser or Supabase mocks do not prove them.
