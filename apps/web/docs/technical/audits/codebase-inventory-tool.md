<!-- apps/web/docs/technical/audits/codebase-inventory-tool.md -->

# TypeScript Codebase Inventory Tool

The codebase inventory turns the web project's authored TypeScript into two complementary views:

- a complete file/function/import index for orientation;
- a ranked list of functions that may implement overlapping behavior.

It is intentionally a discovery tool. A similarity result is a reason to inspect two implementations, not an instruction to merge them.

## Run it

From the repository root:

```bash
pnpm --filter @buildos/web analyze:codebase
```

The command writes disposable output to `apps/web/.codebase-inventory/`:

- `inventory.json` is the machine-readable source of truth;
- `inventory.md` contains the complete directory, file, and function hierarchy;
- `duplicate-candidates.md` contains clone families, diverse ranked pairs, repeated names, density hotspots, and high-fan-in modules.

## Default scope

The default roots are `src/lib` and `scripts`. This keeps the first review focused on authored TypeScript while avoiding Svelte components and SvelteKit route plumbing.

Tests are indexed and labeled, but their functions are not duplication candidates. Generated files receive the same treatment. Declaration files, dependencies, build output, coverage, `.svelte.ts` modules, and SvelteKit's generated output are excluded.

Use the CLI flags when a wider pass is useful:

```bash
# Add authored route handlers and load functions.
pnpm --filter @buildos/web analyze:codebase -- --include-routes

# Replace the default roots (repeat --root as needed).
pnpm --filter @buildos/web analyze:codebase -- --root src/lib/services --root src/lib/utils

# Lower the candidate threshold and retain more pairs.
pnpm --filter @buildos/web analyze:codebase -- --min-score 0.55 --max-candidates 250
```

Run `pnpm --filter @buildos/web analyze:codebase -- --help` for the full option list.

## What gets indexed

Each file record includes its path, category, size, content hash, imports, exports, incoming imports from the indexed TypeScript scope, parse diagnostics, and functions. Function records cover declarations, arrow functions, function expressions, class/object methods, accessors, constructors, and nested or anonymous callbacks.

Each function includes:

- name, qualified name, kind, signature, parameters, and explicit return type;
- source lines, nesting depth, approximate cyclomatic complexity, and called functions;
- exact token-body and normalized structural hashes;
- a compact structural sketch used to discover near matches.

The tool does not call an export “unused.” Because `.svelte` files are outside the index, an export with no incoming TypeScript import may still be used by a component.

## Candidate scoring

Candidate pairs are discovered through shared name tokens, call names, exact structural hashes, and structural sketches. Scoring then combines:

| Signal                    | Weight | Purpose                                         |
| ------------------------- | -----: | ----------------------------------------------- |
| Normalized body structure |    55% | Finds copied or lightly rewritten control flow  |
| Function-name similarity  |    25% | Finds overlapping stated responsibilities       |
| Called-function overlap   |    12% | Adds dependency and behavior context            |
| Signature compatibility   |     8% | Compares parameter count/types and return types |

Identifiers and literals are normalized for structural comparison. This is useful for finding renamed clones, but it can make small wrappers look more alike than they are. Functions must clear minimum body-size and line-count gates, and exact normalized structures receive a confidence floor rather than an automatic verdict.

Exact and normalized clones are grouped into families so one widely repeated helper cannot consume the entire pairwise ranking. Those families are omitted from the ranked pair list, leaving that queue for less obvious near matches. The queue also limits repeated name families and repeated appearances by one function, keeping the review varied.

## Suggested review loop

1. Start with high-confidence exact-body matches.
2. Review high-scoring pairs that cross directory or service boundaries.
3. Use repeated-name clusters to locate parallel utilities and adapters.
4. Inspect function-density hotspots for mixed responsibilities.
5. Record one of: consolidate, extract shared primitive, keep separate with rationale, or investigate later.

Re-run the report after focused cleanup. A falling candidate count is useful, but clarity of ownership is the real success measure.
