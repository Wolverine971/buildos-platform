<!-- docs/founder/resumes/yc_work_at_a_startup_answers_v2.md -->

# YC Work at a Startup — Application Answers (v2)

_Last updated: 2026-05-06_

Iteration 2. Companion to [David_Wayne_Resume.md](./David_Wayne_Resume.md). For v1, see [yc_work_at_a_startup_answers.md](./yc_work_at_a_startup_answers.md).

**Changes from v1:**

- Q2: dropped infra mention, removed the "as a founder I do my own user research" line, softened the overall tone.
- Q3: reframed as "two projects I'm proud of" — leads with BuildOS, follows with a tighter Curri paragraph.

---

## Q1 — Describe yourself in a short phrase

**Long version:**

> Senior full-stack + AI engineer (8 yrs). Shipped the integration layer at Curri (YC S19) connecting Lyft/Uber/DoorDash and four regional carriers. Currently founding BuildOS, an AI-first project management platform that users and their agents connect to so they work from one shared source of truth. 80+ beta users. Former USMC Scout Sniper Team Leader.

**Short version:**

> Full-stack + AI engineer. Ex-Curri (YC S19) integrations, now founding BuildOS. Former USMC Scout Sniper.

---

## Q2 — What are you looking for in your next role? What would you like to avoid?

> Looking for: an early-stage team where I can ship to customers weekly, work across the full product surface (frontend, backend, AI features), and put what I've learned about LLM routing, tool calling, and agent harness design to good use. I really enjoy talking to customers and partnering closely with PM, design, sales, and marketing — at Curri some of the best work I did was sitting with PM and design every day rebuilding the ops console, and I'd love to do more of that kind of cross-functional work.
>
> Avoiding: large-org process, narrow IC roles with no customer or product access, and AI projects that aren't actually shipping to users.

---

## Q3 — Project you're proud of

> I'm actually proud of two projects.
>
> Most recently, **BuildOS**, an AI-first project management platform that users and their agents connect to so they work from one shared source of truth. I've been building this solo. Users do stream-of-consciousness "brain dumps" and the system extracts structured projects and tasks. It runs on a multi-LLM routing layer (OpenRouter primary, with OpenAI / Anthropic / Moonshot as fallbacks) that scores requests by complexity, latency, and cost. I built an agentic chat that reads and writes Google Calendar via tool use, daily-brief email generation, and a Redis-free Supabase job queue that powers the long-running LLM jobs. 80+ beta users so far. The most interesting work has been context engineering — figuring out the right tools, schemas, and context so LLM tool calls behave reliably in production.
>
> Previously at **Curri (YC S19)**, I built and owned the third-party delivery integration layer — connecting seven partners (Lyft, Uber, DoorDash, Dispatch, Pronto, Material Drop, Superior) into the driver-search algorithm so any open delivery could fail over to an external network when no in-network driver was available. I reverse-engineered every partner's API by hand (public docs were typically incomplete), built the OAuth and credential-exchange flows, and designed a hybrid webhook + polling reconciliation pattern to maintain ground-truth state across partners with inconsistent event coverage. At scale it routed an estimated 100–200+ deliveries per day per partner.
