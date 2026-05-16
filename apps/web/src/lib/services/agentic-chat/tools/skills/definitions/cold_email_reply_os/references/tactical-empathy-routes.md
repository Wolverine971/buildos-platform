---
doc_type: skill-reference
skill: cold_email_reply_os
reference: tactical-empathy-routes
visibility: internal
publish: false
created: 2026-05-16
purpose: Reply route patterns that combine low-friction forks, objection handling, and tactical empathy.
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_reply_os/references/tactical-empathy-routes.md
---

# Tactical Empathy Routes

Use this when a reply is skeptical, tense, ambiguous, negative, or likely to stall.

## Governing Source Cards

- Close/Steli: numbered reply forks and silence revival.
- Gong: objection categories and response discipline.
- Black Swan Group: labels, summaries, mirrors, calibrated questions.

## Response Shape

Default pattern:

```text
[Label the concern in one sentence.]
[Answer only what needs answering or honor the original promise.]
[Ask one calibrated question or offer one next step.]
```

Good labels:

- "Sounds like timing is the blocker."
- "Seems like the concern is switching cost, not interest."
- "Totally fair if this is already handled."
- "Sounds like I may have the wrong owner."

Good calibrated questions:

- "What would need to be true for this to be worth revisiting?"
- "How are you handling that today?"
- "What would be the right way to route this?"
- "What should I send so you can decide whether this is redundant?"

## Route Table

| Reply Class      | Response Move                                             | Example Next Step                                                    |
| ---------------- | --------------------------------------------------------- | -------------------------------------------------------------------- |
| Yes / interested | Keep promise first, then offer next step.                 | Send artifact; optionally include 2 times.                           |
| Send info        | Send the artifact, not a brochure.                        | "Here is the snapshot I promised."                                   |
| Not now          | Label timing; ask permission for a specific future touch. | "Would July be the wrong time to send the benchmark?"                |
| Already solved   | Label current solution; ask if the gap is still relevant. | "Sounds like coverage is handled. Is [specific gap] still annoying?" |
| Skeptical        | Label skepticism; give one proof point or artifact.       | "Fair to be skeptical. Want the example and you can judge?"          |
| Wrong person     | Label routing; ask for the right owner.                   | "Who owns this now?"                                                 |
| Angry / opt-out  | Apologize, confirm stop, no defense.                      | "Understood. I will not follow up."                                  |
| Silent           | Use one numbered fork after meaningful time.              | Four options max, dignified close-loop option.                       |

## Numbered Fork

```text
I may be off here, but guessing one of these is true:

1. This is active now.
2. It matters, but not this quarter.
3. You solved it another way.
4. Wrong person / close the loop.

Reply with the number and I will take the right next step.
```

## Guardrails

- Do not debate an angry reply.
- Do not use fake empathy or therapy language.
- Do not mirror awkwardly in writing.
- Do not turn every response into a meeting ask.
- Do not keep following up after an opt-out.
