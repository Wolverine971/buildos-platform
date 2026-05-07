<!-- docs/founder/resumes/yc_work_at_a_startup_answers.md -->

# YC Work at a Startup — Application Answers

_Last updated: 2026-05-06_

Companion to [David_Wayne_Resume.md](./David_Wayne_Resume.md).

---

## Q1 — Describe yourself in a short phrase

**Long version:**

> Senior full-stack + AI engineer (8 yrs). Shipped the integration layer at Curri (YC S19) connecting Lyft/Uber/DoorDash and four regional carriers. Currently founding BuildOS, an AI-native productivity platform with 80+ beta users. Former USMC Scout Sniper Team Leader.

**Short version:**

> Full-stack + AI engineer. Ex-Curri (YC S19) integrations, now founding BuildOS. Former USMC Scout Sniper.

---

## Q2 — What are you looking for in your next role? What would you like to avoid?

> Looking for: an early-stage team where I can ship to customers weekly, own real surface area end-to-end (frontend through infra), and use what I've learned about LLM routing, tool calling, and agent harness design in production. I want to talk to customers directly and partner closely with Sales, Marketing, and PM — at Curri I worked daily with PM and design rebuilding the ops console, and as a founder I do my own user research.
>
> Avoiding: large-org process, narrow IC roles with no customer or product access, and AI-as-buzzword teams that haven't actually shipped agentic features.

---

## Q3 — Project you're proud of

> At Curri (YC S19) I built and owned the third-party delivery integration layer — the system that let any open delivery dynamically fail over to an external network when no in-network driver was available. I integrated seven partners (Lyft, Uber, DoorDash, Dispatch, Pronto, Material Drop, Superior) into the driver-search algorithm, reverse-engineered every partner's API by hand because public docs were incomplete, and designed a hybrid webhook + polling reconciliation pattern to maintain ground-truth delivery state across partners with inconsistent event coverage. I built the OAuth/credential-exchange flows, pre-fetched pricing quotes so any delivery could be dispatched on demand, and shipped partner-specific contracts for each integration. At scale it routed an estimated 100–200+ deliveries per day per partner, recovering deliveries that would otherwise have lost money on small/unprofitable jobs or left customers stranded — including high-margin specialty equipment (box trucks, stake beds, flatbeds) the in-network fleet couldn't service.
>
> More recently, I've been building BuildOS solo — an AI-native productivity platform with a multi-LLM routing layer (OpenRouter primary, OpenAI/Anthropic/Moonshot fallbacks, scored by complexity/latency/cost), agentic chat that reads/writes Google Calendar via tool use, and a Redis-free Supabase job queue using `FOR UPDATE SKIP LOCKED`. 80+ beta users. The interesting work is context engineering — picking the right tools, schemas, and context so LLM tool calls behave reliably in production.

---

## Why these answers (assessment notes)

**What was wrong with the previous answers:**

1. **BuildOS was missing.** The most current, impressive work — solo-built AI-native platform, 80+ beta users, multi-LLM routing, agentic chat — wasn't mentioned. For YC WAAS, founder + AI experience is exactly what YC startups want.
2. **AI/LLM expertise was hidden.** Every YC startup hiring in 2026 cares about this. Real depth in context engineering, agent harnesses, and MCP-style integration was invisible.
3. **Curri story was too generic.** Old answer said "delivery service providers." Reality: 7 named partners, reverse-engineered APIs, 100–200+ deliveries/day per partner. Concrete > generic.
4. **Typo in Q2** ("word directly" → "work directly").
5. **Marine Corps / Scout Sniper Team Leader** is a differentiator for YC founders and worth a one-liner.

**Why lead Q3 with Curri instead of BuildOS:**

Curri is completed, measurable, and at a YC company — the exact pattern YC founders pattern-match on. BuildOS gets the second paragraph to show current AI depth and founder energy.
