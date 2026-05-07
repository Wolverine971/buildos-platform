<!-- docs/founder/job-applications/cold-outreach-rules.md -->

# Cold Outreach Rules — Engineering Roles

Voice and structure for DJ's cold outreach to founders / hiring managers about engineering roles.

Reference draft: 2026-05-06 message to Constantin at GoGo.

## Why this exists

DJ's natural voice in these messages is concise, specific, slightly informal, and not over-polished. It reads like a human, not a recruiter template. Same thread as the LinkedIn and Instagram comment voice rules: short, organic, no founder-influencer wrapper.

## Skeleton

When drafting outreach to a specific person about a specific role, follow this skeleton:

1. **One-line opener** — names the role, why reaching out. No "I came across..." / "I was excited to see..." cliches.

2. **Real connection — NOT a mission affirmation.** The connection has to be a concrete, factual overlap (past work, current work, or lived experience), not an emotional or aspirational statement about the mission. Examples of _real_ connections:
    - "I'm building AI-first project management software too" (BuildOS → Clad)
    - "I've done government contracting in the past" (DJ → GovEagle)
    - "the integration layer pattern is very close to what I shipped at Curri" (Curri → GoGo)

    If there is no honest factual overlap, **skip this beat entirely** and let the credential paragraph carry the bridge.

3. **Concrete relevant credential** — a past role with specific companies, tech, and what was owned. Always lead with the most directly transferable work, not the resume-prestige work. For DJ this is usually the Curri integrations layer (Lyft / Uber / DoorDash / regional carriers) when relevant, or BuildOS agent harness when AI/agent-relevant.

4. **Explicit bridge sentence** — explicitly draws the line from past work → their problem. Pattern: _"So when I read that [their thing], that felt really close to what I worked on previously."_ This is the most important sentence — it's the "why me" that the rest of the message is justifying.

5. **Current work** — one line on BuildOS, framed for the audience (agent harness / context engineering for AI shops; Supabase/SvelteKit/full-stack solo for product shops). Do **not** prefix this with "A bit about me:" or "Some context:" — go straight into the credential conversationally.

6. **Honest gap disclosure** — if their stack has something DJ is rusty on, name it casually. ("I used to work with Vue and GraphQL alot but it's been a minute.") Builds trust, signals the stack was actually read.

7. **What he wants in a role** — short, plain. "High ownership, close collaboration with others in the org and with end users." Don't embellish.

8. **Soft CTA** — "Would love to chat if you think I would be a good fit." Gives them an out. Never pushy, never "looking forward to your response."

9. **Signoff** — "Thanks / DJ". First-name only.

## Voice rules

- Short paragraphs, often 1–2 sentences each. Whitespace does the work.
- Casual phrasing is allowed and _welcome_ ("alot", "it's been a minute", "a bit about me is that..."). Do not over-polish — typos in casual register read as human, not careless.
- No exclamation points. No "passionate." No "rockstar." No "I'd love the opportunity to..."
- No bulleted lists in the body. Prose only.
- No restatement of the resume — pull the _one_ most relevant thread.
- Never claim more than the credential supports. The bridge does the selling, not adjectives.
- Sign with "DJ" not "David" or "David Wayne."

## Anti-patterns (these will get rejected)

- Recruiter-template openers ("I hope this finds you well", "I came across your posting and was thrilled")
- **Generic mission-affirmation sentences** like "The mission lands for me," "this is the kind of product I'd be proud to work on," "the mission resonates," etc. Flagged as inauthentic / AI-coded. The connection must be a concrete factual overlap, not an emotional statement. If you can't name the overlap concretely, skip the beat.
- **Templated transition phrases** like "A bit about me:" / "Some context:" / "Quick context —" before the credential paragraph. Just go in conversationally.
- Long credential dumps. One specific story beats a list.
- Asking for "any opportunity" or "to learn more about the company"
- Over-formatted messages (bullets, bold, headers) for a 1:1 cold email
- Selling without a bridge — the bridge sentence is non-negotiable
- Closing with high-pressure CTAs ("looking forward to hearing from you")
- **Reverting to old patterns mid-conversation.** Once a voice rule is established in a conversation, do not slip back into older templated structures on subsequent drafts. Re-read the latest established draft (e.g. the GoGo v2) before drafting the next one.

## When to use vs. delegate

For a quick draft, write directly in this voice. If the task requires deeper research on the target (their hiring patterns, recent posts, specific pain), delegate to the `cold-outreach-strategist` agent and tell it to match this voice.

## Reference: the GoGo message

> Hi Constantin,
>
> I saw the Backend Engineer role and wanted to reach out.
>
> The mission is awesome and is the kind of product I'd be proud to work on.
>
> A bit about me is that I spent three years at Curri (YC S19) building and owning the third-party delivery integration layer with Lyft, Uber, DoorDash, and four regional carriers. I reverse-engineered each partner's API by hand and connected it into our driver search algorithm.
>
> So when I read that GoGo is tailoring existing on-demand apps to the needs of older adults that felt really close to what I worked on previously.
>
> I'm currently building BuildOS, an AI-native productivity tool which is all about crafting a decent agentic harness with good context engineering.
>
> I used to work with Vue and GraphQL alot but it's been a minute.
>
> I am targeting a role with high ownership, close collaboration with others in the org and with end users.
>
> Would love to chat if you think I would be a good fit.
>
> Thanks
> DJ

Note: this draft uses the "mission affirmation" line ("The mission is awesome...") and the "A bit about me is that..." opener that the rules above now flag as anti-patterns. The rules are the _evolved_ version; treat the message as the seed, not the spec.
