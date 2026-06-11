---
doc_type: skill-reference
skill: cold_email_reply_os
reference: objection-route-table
visibility: internal
publish: false
created: 2026-06-10
purpose: Seven-objection route table with labels and calibrated questions, Gong's seven-step objection process adapted to async email, and the objection-bank template structure.
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_reply_os/references/objection-route-table.md
---

# Objection Route Table

Load this when the reply is an objection (class 6), skepticism (class 7), already-solved/competitor (class 5), or a send-info brushoff. Classify the objection before routing — a route without a taxonomy class is not a route.

## Governing Sources

- Black Swan Group (Chris Voss org): response shape — label, one answer or artifact, one calibrated question.
- Gong: seven-step objection process and the data that objections are positive signals (skeptical buyers are serious buyers; pricing handled late, not first).
- Connor Murray: objection bank and acknowledge-and-redirect.
- Close/Steli Efti: Hail Mary objection-discovery move.

Adaptation caveat: Black Swan and Gong are call-era sources. The async email adaptations below are our derivation, not sourced fact — flagged as a known weak spot until a real corpus of email objection threads exists. Gong's exact magic phrases were images in the original post and are absent from the source card; the adapted phrasing here is reconstructed — treat as adaptation, not quotation.

## Gong's Seven Steps, Adapted to Email

1. Don't fire back instantly — the email equivalent of the pause.
2. Clarify with a question before answering. Mirroring works; **never ask "why"** — it puts the buyer on defense.
3. Validate before answering: summarize until they'd feel understood.
4. Isolate: "is anything else stopping this?" — smoke-screen check.
5. Get permission to share a different view.
6. Reframe.
7. Close with an unbiased resolution question — never "does that resolve your concern?" which begs a false yes.

Context data (Gong): objections are positive signals — negative sentiment increases toward purchase. Handle pricing late, not first.

## Objection-Bank Template Structure

Every objection response follows one shape:

1. Acknowledge the objection.
2. Label the valid reason behind it.
3. Add one specific contrast, proof, or artifact.
4. Ask the smallest calibrated question.

Example:

```text
Totally fair on already having a tool.

The gap I usually see is not coverage; it is whether reps can see [specific signal] before the account goes quiet.

I can send the 3-signal snapshot and you can decide if it is redundant. Worth sending?
```

Tactical empathy pattern (for skeptical, tense, or ambiguous replies):

```text
Sounds like [concern] is the blocker.

[One short answer or the promised artifact.]

What would need to be true for this to be worth revisiting?
```

Do not overuse "sounds like" if it would feel scripted.

## Route Table (7 objections)

| Objection                | Label (first line)                                           | Move                                                                                                                                                                                                       | Calibrated question                                                                                     |
| ------------------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| No budget                | "Totally fair — sounds like budget's locked for now."        | Acknowledge-and-redirect (Murray objection bank): offer the artifact anyway so they're ready when priorities shift                                                                                         | "When does planning for next [quarter/FY] start?"                                                       |
| Already have a solution  | "Sounds like coverage is handled."                           | Contrast the _specific gap only if true_ ("the gap I usually see is whether reps can see [signal] before the account goes quiet — I can send the 3-signal snapshot and you can decide if it's redundant.") | "Is [specific gap] still annoying?" / "What should I send so you can decide whether this is redundant?" |
| Not a priority           | "Makes sense — sounds like this isn't this quarter's fight." | Timeline-tag (Moesta), route to nurture; permission ask for specific future touch                                                                                                                          | "Would [month] be the wrong time to send the benchmark?"                                                |
| Switching cost / risk    | "Seems like the concern is switching cost, not interest."    | One proof point matched to the exact risk, or a risk-map artifact                                                                                                                                          | "What would need to be true for this to be worth revisiting?"                                           |
| Skepticism about claim   | "Fair to be skeptical."                                      | One verifiable example; let them judge                                                                                                                                                                     | "Want the example and you can judge?"                                                                   |
| Send-me-info-as-brushoff | (No label needed)                                            | Send the real artifact + one-line fork: active vs. polite-no                                                                                                                                               | "Should I close the loop after this, or is [pain] still live?"                                          |
| Competitor chosen        | "Congrats on getting that sorted."                           | Hail Mary learning move: ask one genuine learning question; do not counter-pitch                                                                                                                           | "What tipped it for [competitor]?" (Close case: second-exchange questions surfaced the real objection)  |

## Boundary Rules (Black Swan "should not enter")

- No manipulative negotiation tactics.
- No long psychological analysis in email.
- No scripted-sounding mirrors.
- Labels stay short: "Sounds like timing is the blocker."
- Calibrated questions: what/how only — never "why."
- Angry replies get "Understood. I will not follow up." — no defense, no explanation, no final question.
