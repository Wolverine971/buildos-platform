---
doc_type: skill-reference
skill: cold_email_icp_signal_design
reference: segment-examples
visibility: internal
publish: false
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_icp_signal_design/references/segment-examples.md
---

# Segment Examples

Use when grading a candidate segment definition, comparing alternatives, or showing the user what good and bad segments look like.

Three examples below, each labeled as weak, acceptable, or strong. Each illustrates a different layer of the segment definition — fit, signal, committee shape, MVS check.

The binary disqualifier kill-list lives inline in the shell (`## Disqualifier Kill-List`) — run it there; these examples show what passing and failing segments look like in full.

## Weak segment

```yaml
segment_name: 'B2B SaaS founders'
persona: 'Founder or CEO'
company_filters: 'B2B SaaS, US-based'
signal: 'Builds SaaS products'
why_now: 'They might need our product'
buying_committee:
    roles: [Founder]
mvs_check:
    common_needs: fail
    dominability: fail
    viability: fail
signal_scorecard:
    primary_type: firmographic
    freshness: 0
    reliability: 0
    pain_likelihood: 0
    testability: 0
    total: 0
verdict: do_not_send
```

Why this fails:

- Title-match treated as timing. "Builds SaaS products" is a filter on top of a list, not a signal.
- Firmographic-only relevance. No trigger, no technographic, no demographic refinement.
- Mixed-persona inevitability. "B2B SaaS founders" covers a 4-person studio founder and a 300-person Series C CEO. Reply data will be uninterpretable.
- Fails all three MVS tests. No common need, not dominable, not viable for any single product.
- Committee map missing. Solo "founder" assumption fails on any account above 50 employees.

## Acceptable segment

```yaml
segment_name: 'New CTOs at Series A B2B SaaS companies, last 30-60 days'
persona: 'CTO, hired in the last 30-60 days'
company_filters:
    - 'Series A funded in last 12 months'
    - 'B2B SaaS'
    - '30-150 employees'
    - 'Uses [specific tech stack]'
signal: 'CTO joined the company within last 30-60 days'
signal_source: 'LinkedIn job-change notification + press release'
why_now: |
    New-in-role exec window (Florin Tatulea data: 70% of budget spent in first 100 days).
    They are auditing the engineering stack and have political mandate to change tooling.
    Window closes by day 100.
buying_committee:
    expected_size: 6-10
    roles:
        - role: champion
          typical_title: CTO
          mcmahon_test_required: true
        - role: economic_buyer
          typical_title: CEO
        - role: user
          typical_title: Senior Engineer / Eng Manager
        - role: blocker
          typical_function: security or procurement
    golden_path: top_down
    first_outreach_target: champion
mvs_check:
    common_needs: pass (engineering tooling audit)
    dominability: pass (small enough to dominate)
    viability: pass (product serves this use case today)
signal_scorecard:
    primary_type: trigger_based
    trigger_sub_type: bridgebound
    trigger_family: C_change
    switching_trigger_type: change_in_circumstance
    freshness: 2
    reliability: 2
    pain_likelihood: 1
    testability: 1
    total: 6
verdict: volume_approved
```

Why this works:

- Single persona, single trigger, single window.
- Trigger is publicly observable and verifiable from two sources.
- MVS passes all three checks.
- Committee map includes the Blocker explicitly.
- Signal scorecard total of 6 sits in the volume-approved band.

What is still soft:

- Pain likelihood is acceptable (1), not strong (2). The pain is plausible but not confirmed by buyer language. A follow-up customer-research conversation would strengthen this.
- Testability is acceptable (1). The segment is large enough that the first 25-50 replies should be readable.

## Strong segment

```yaml
segment_name: 'New CTOs at Series A B2B SaaS companies who have publicly stated they are replatforming'
persona: 'CTO, hired in the last 60 days, with public statement about engineering rebuild'
company_filters:
    - 'Series A funded in last 12 months'
    - 'B2B SaaS, 30-150 employees'
    - 'Currently uses [legacy stack we replace]'
signal: |
    Compound trigger: new CTO + public LinkedIn or blog post about
    re-architecting the engineering stack + technographic match to legacy.
signal_source: |
    Three verifications: LinkedIn job change, public LinkedIn post or
    engineering blog post by the CTO mentioning replatforming, BuiltWith
    or technographic data confirming the legacy stack.
why_now: |
    Buyer has publicly committed to a change. New-in-role window means they
    have political mandate. Technographic confirms the migration target.
    Window: open for 90-120 days from public statement.
buying_committee:
    expected_size: 6-10
    roles:
        - role: champion
          typical_title: CTO
          mcmahon_test_required: true
          mobilizer_probability: high (new in role + public commitment)
        - role: economic_buyer
          typical_title: CEO
        - role: user
          typical_title: Senior Engineer
        - role: blocker
          typical_function: security
          framing: 'Most CTOs underestimate the security review window'
    golden_path: top_down
    first_outreach_target: CTO
mvs_check:
    common_needs: pass (replatforming pain)
    dominability: pass (estimated 50-150 accounts globally per quarter)
    viability: pass
signal_scorecard:
    primary_type: trigger_based
    trigger_sub_type: bridgebound
    trigger_family: C_change
    switching_trigger_type: change_in_circumstance
    freshness: 2
    reliability: 2
    pain_likelihood: 2
    testability: 2
    total: 8
verdict: high_conviction
```

Why this is strong:

- Three independent verifications of the trigger.
- Pain is confirmed by the buyer's own public statement (highest reliability).
- Compound relevance: trigger-based + technographic + demographic.
- Segment is small (50-150 accounts globally per quarter) but addressable - the Underscore VC MVS "smallest dominable" criterion.
- Recommends Mafia-Offer-quality manual outreach per account, not volume automation.

## Reading These Against the Kill-List

- The weak segment fails shell kill-list questions 7-14 at minimum (MVS + every signal question) before fit is even assessable.
- The acceptable segment passes all 19 hard kills; its soft spots (pain likelihood 1, testability 1) show up as scorecard points, not kill-list fails.
- The strong segment passes everything with a scorecard of 8 — the profile that earns manual, per-account outreach instead of volume automation.
