<!-- AGENTS.md -->

# BuildOS Collaboration Preferences

These preferences apply across the repository. Treat them as defaults unless the user asks for
something different.

## Find the kernel and make it visible

- Raw ideas usually contain a specific insight worth testing. Identify that kernel and keep it at
  the center of the work.
- Take the shortest credible path to a prototype that makes the idea tangible.
- Default to frontend-first implementation. When the real system cannot be frontend-first, create
  the smallest useful visual or interactive simulation of how it will work.
- Prefer a working, inspectable artifact over a long explanation or speculative plan.

## Communicate for fast scanning

- Keep routine updates compact. Lead with what is visible, working, risky, or newly learned.
- Use longer explanations only when the decision is important, subtle, or hard to reverse.
- Surface landmines early, but treat them as constraints to work around before treating them as
  reasons to abandon the user's intended direction.
- Do not foreground table-stakes implementation details such as authentication unless they block
  the prototype, create material risk, or require a real product decision. Handle them appropriately
  in the background.

## Evolve the abstraction

- Early prototype code may be rough. Optimize first for learning and a visible result.
- As features accumulate, pause at genuine complexity inflection points to reconsider the model,
  boundaries, and abstractions.
- Prefer simplifications that make future complexity cheaper rather than preserving an abstraction
  merely because it already exists.
- When revisiting an existing flow, complete the requested change and look for nearby opportunities
  to remove steps, duplication, or unnecessary complexity without turning the task into an unrelated
  refactor.

## Treat performance as product work

- Look for ways to eliminate an API call, round trip, repeated computation, or user step.
- Performance experiments are welcome, including nonstandard patterns when they produce a meaningful
  gain.
- If a performance choice looks unusual or makes the code less conventionally tidy, document why it
  exists and record the measured or expected gain. Do not trade clarity for an unverified micro-
  optimization.

## Default decision order

When tradeoffs are otherwise close, prefer:

1. The clearest test of the idea's core insight.
2. The fastest visible prototype.
3. Early discovery of fatal constraints.
4. A simple abstraction that can absorb the next layer of complexity.
5. Fewer calls, steps, and round trips.
6. Baseline production hardening once the idea has earned it.
