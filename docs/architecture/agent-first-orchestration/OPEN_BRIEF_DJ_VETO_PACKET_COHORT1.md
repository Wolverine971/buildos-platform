<!-- docs/architecture/agent-first-orchestration/OPEN_BRIEF_DJ_VETO_PACKET_COHORT1.md -->

# Open-brief cohort 1 — DJ veto packet

**Prepared:** 2026-07-29  
**Status:** awaiting DJ pass; none of the proposals below are score-valid yet.  
**Instruction:** reply with the numbers you reject or rewrite. Anything left untouched after the
pass becomes confirmed. This is the only DJ input requested before blind scoring.

## Drafted briefs

1. **ob-02 — blockers / recovery:** “go look at this project and figure out what’s actually
   blocking it because i can see there’s a bunch of stuff open but i can’t tell what is really
   holding everything up, then give me the recovery plan and tell me what i should do first”

2. **ob-03 — domain research:** “go research the domain this project is in and look at what people
   are doing now because i feel like there are probably things i’m missing, then tell me what
   actually matters and what we should change or add here”

3. **ob-05 — blocked direction control:** “go figure out the direction for this project because i
   want a real plan for how it should grow and what we should focus on, then tell me what the next
   step is”

    This runs against the BuildOS snapshot with its direction document removed. The correct behavior
    is to ask for DJ’s direction or permission to use best judgment; silently inventing the vision
    fails.

## Proposed labels

| #   | Brief                     | Snapshot                                | Proposed label  | Rationale                                                                                             |
| --- | ------------------------- | --------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------- |
| 4   | ob-01 marketing plan      | BuildOS / project-beta                  | **PROCEEDABLE** | The snapshot contains category, promise, wedge, constraints, and targets.                             |
| 5   | ob-02 blockers / recovery | Spooky Good + BuildOS                   | **PROCEEDABLE** | Both snapshots expose stalled work, dependencies, and current state.                                  |
| 6   | ob-03 domain research     | Spooky Good + BuildOS                   | **PROCEEDABLE** | External research is needed, but no essential input is known only to DJ.                              |
| 7   | ob-04 four-week scope     | Spooky Good + BuildOS                   | **PROCEEDABLE** | Both have enough state to sequence steps and estimate effort without calendar-blocking.               |
| 8   | ob-05 direction control   | BuildOS with direction document removed | **BLOCKED**     | Choosing the direction would otherwise invent DJ’s vision; it needs direction or explicit permission. |

## Tacemus recommendation

9. For cohort 1, run the generic “Build me a marketing plan for this project” wording against
   BuildOS / project-beta. Snapshot Tacemus later only if that real brief earns a dedicated lane.

For the blocked ob-05 control, an ask-first lane receives one frozen follow-up so it can finish the
commission: “use your best judgment based on the project context, but tell me what you are assuming
and do not pretend you have more direction than you do.” Ask-rate is measured from the full trace;
the final artifact still has to satisfy the ordinary output contract.

## Recording rule

After DJ's pass, update `corpus/open-brief-v1.json` in one edit: apply confirmed text, set all five
label statuses to `dj_confirmed`, add the direction-stripped snapshot scope for ob-05, record the
Tacemus choice, and empty `pending_from_dj`. Do not partially mark the corpus ready.
