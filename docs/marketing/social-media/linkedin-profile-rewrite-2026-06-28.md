<!-- docs/marketing/social-media/linkedin-profile-rewrite-2026-06-28.md -->
<!-- docs/marketing/social-media/linkedin-profile-rewrite-2026-06-28.md — paste-ready LinkedIn copy. Verified + rewritten 2026-06-28. -->

# LinkedIn rewrite — paste-ready

Each section below sits in its own code block. Copy the block, paste straight into LinkedIn. (LinkedIn ignores markdown, so the bullets paste as real "•" characters and line breaks survive.)

## Read this first (facts to lock before you paste)

- **Curri is YC S19** — confirmed against the Y Combinator directory. Your resume is right; your current About says "W21," which is wrong. Fixed everywhere below.
- **BuildOS start date:** your resume says **Mar 2025**, the old draft said Feb 2025. I used **Mar 2025**. If Feb is the truth, change it in one place.
- **Webworld (WTI) end date:** your LinkedIn currently shows Nov 2020; your resume says **Mar 2021**. Mar 2021 also closes the gap before C4, so use it if it's true. I used Mar 2021 below.
- **Security+:** only list it in Skills if you actually hold it. Verify before pasting.
- **Email in the About** is intentional — recruiters look for it there.

---

## About section

**Above-the-fold note:** LinkedIn shows only the first ~2 lines (~220 characters, fewer on mobile) before "…see more." So the first line has to carry the whole pitch on its own. This version front-loads the scannable identity, then lets the narrative run underneath — even if a recruiter reads nothing past line one, they got it.

### Recommended version (leads hireable, founder work as proof)

```
Senior full-stack engineer, nine years in — I build production software end to end, across startups, AI systems, and federal programs.

Deep in React and TypeScript, with real scar tissue in the two areas most engineers steer around: messy enterprise integrations, and AI systems that have to hold up in production, not just in a demo.

Most recently I built BuildOS solo — an AI-first project platform running a multi-LLM routing layer, agentic Calendar and MCP integrations, and a custom Supabase-native job queue. Before that, at Curri (YC S19), I rebuilt the live operations console the whole ops team ran on, and I owned the integration layer that wired our delivery network into Lyft, Uber, and DoorDash.

Earlier I spent three years on DoD and federal programs — a Marine Corps military-justice case system, an Air Force intelligence knowledge-graph platform, and the search bar behind the US Census Bureau's public data, live today on data.census.gov. US citizen; held a Secret clearance through 2021, eligible for reinstatement with sponsorship.

Before any of it, I was a US Marine Corps Scout Sniper Team Leader. That still shows up in how I work: precision, ownership, and a level head when the outcome lands on me.

I've been called a "product-minded engineer," and I'll take it — I care how it feels to use what I build, and I ship tools that are warm, human, and genuinely useful.

Open to senior full-stack, AI/LLM, or platform engineering roles — full-time or contract, remote or around DC/Baltimore. Reach me at djwayne35@gmail.com.

Tech: TypeScript · React · Next.js · SvelteKit · Node.js · PostgreSQL · Supabase · LLM/agent integration (OpenAI, Anthropic, MCP, tool calling) · REST · webhooks · OAuth
```

**Why it works (Sugarman lens):** the first line is short, scannable, and earns the second. It builds trust with an honest, slightly self-deprecating truth ("the work most engineers steer around") instead of bragging — the honesty trigger. It's specific where it counts (data.census.gov, named partners, S19), humanizes you (first person, the Marine line), and it actually asks for the order with a clear CTA and email. No "passionate," no "results-driven," no slop.

### If you want a harder "open to work" first line

Swap just the first line for this, keep the rest the same:

```
Senior full-stack engineer looking for my next team — I build production software end to end, and I've done it across startups, AI systems, and federal programs.
```

### If you ever want the founder-forward version back

Keep this for when you're _not_ job hunting — lead with "USMC veteran turned engineer and founder," then BuildOS and 9takes up top. Don't run it now; it reads as "happy where I am" to a recruiter.

---

## Headline options (pick one — 220 char max)

I'd run #1 — it front-loads the keywords recruiters search, keeps the veteran + YC signal, and says "open to work" without the desperate energy.

```
Senior Full-Stack Engineer · React + TypeScript · AI/LLM systems & hard integrations · USMC veteran · ex-Curri (YC S19) · open to work
```

```
Senior Full-Stack Engineer — I ship AI products end to end · React / TS · Node · Supabase · LLM + agent integration · open to senior & contract roles
```

```
Senior Full-Stack & AI Systems Engineer · built BuildOS solo · ex-Curri (YC S19) · Marine vet · React, TypeScript, Node, Supabase
```

---

## Job descriptions

### Founder & Engineer — BuildOS (Mar 2025 – Present)

```
AI-first project platform where people and their AI agents work from one shared source of truth. Designed, built, and shipped solo.

• Shipped the entire platform end to end — SvelteKit web app (Vercel), Node.js worker service (Railway), Turborepo monorepo, Supabase Postgres with row-level security.
• Built a multi-LLM routing layer that scores each request by complexity, latency, and cost, then routes across providers (OpenRouter, OpenAI, Anthropic) with automatic fallback — streaming, tool calling, and JSON mode.
• Built an agentic chat that reads and writes Google Calendar and runs project actions through tool use, with an MCP-style surface so outside agents can drive the app on a user's behalf.
• Designed a Redis-free job queue on Supabase using FOR UPDATE SKIP LOCKED for atomic job claims — powering daily briefs, brain-dump processing, voice transcription, OCR, and SMS workflows.
• Integrated Twilio, Google OAuth, and three direct LLM provider SDKs.
```

### Software Engineer — Curri (YC S19) (Jan 2022 – Feb 2025)

```
B2B same-day construction-materials delivery platform. React + TypeScript across three web frontends, a React Native driver app, and a Node worker service running the driver-search algorithm.

• Rebuilt the service-ops console into a real-time, event-driven triage system the whole ops team ran on daily — replaced a static dashboard with a prioritized alert queue that surfaced exceptions (driver-search timeouts, cancellations, ETA overruns) and exposed the resolving action inline.
• Built and owned the third-party delivery integration layer — connected seven providers (Lyft, Uber, DoorDash, Dispatch, Pronto, Material Drop, Superior) into the driver-search algorithm so deliveries could fail over to an outside network when no in-network driver was free.
• Reverse-engineered each partner's API by hand — the docs were incomplete or missing — and designed a hybrid webhook + polling reconciliation pattern to hold ground-truth delivery state across partners with patchy event coverage.
• Built the OAuth and credential-exchange flows and pre-fetched pricing quotes so any open delivery could be dispatched on demand — turning deliveries Curri would have lost into profitable ones and opening new markets.
• Built an interactive sales and leadership map of geographic delivery activity and regional metrics.
```

### Software Engineer — C4 Planning Solutions (Mar 2021 – Dec 2021)

```
Department of Defense client — a Marine Corps military-justice case management system used by military lawyers across the DoD.

• Owned the migration of the full legacy case archive — hundreds of thousands of historical records — into the production system, and built reusable tooling to format, validate, and load incoming data.
• Shipped features and fixes in an Agile environment on a system in active DoD use. Stack: Vue, jQuery, SharePoint.
```

### Software Engineer — Webworld Technologies (WTI) (Aug 2019 – Mar 2021)

```
Dewey Knowledge Portal — a knowledge platform for US Air Force intelligence analysts that exposed intel reports through a graph data model spanning people, places, events, and source documents.

• Designed and built a nested AND/OR query-builder UI that compiled visual queries to SPARQL and ran them against the knowledge graph — letting analysts express connection-driven searches without writing graph queries by hand.
• Built supporting analyst tooling: classification and citation flows, change-management dashboards, and a templating system that returned custom "Wikipedia-style" result pages.
• Improved frontend performance in an Angular + NgRx app with store-effect memoization and data-layer caching, cutting redundant API calls and re-renders.
```

### Software Engineer — MetroStar Systems (Apr 2018 – Aug 2019)

```
US Census Bureau (CEDSCI) — a single-search interface across the Bureau's multidimensional public datasets, shipped into data.census.gov.

• Re-architected an aging AngularJS application into Vue as part of a joint contract team delivering a unified search interface across the Census Bureau's public datasets.
• Built the central search-bar component — the product's primary interface, live on data.census.gov — engineered for responsiveness, keyboard navigation, and Section 508 / WCAG accessibility, including JAWS screen-reader support.
• Owned frontend state management in VueX for multi-dimension faceted search and filtering.
• Led stakeholder demos for 100–200 government stakeholders and SMEs.
```

### Full Stack Developer — Sabio (Apr 2017 – Jan 2018)

```
Hired out of the Sabio bootcamp on graduation to build internal tools and client work.

• Built a real-time student-management app (AngularJS + C# + SQL + SignalR) that ran an instructor/student help queue with one-on-one routing.
• Led the "Intro to Web Development" community meetup, teaching attendees to build a working blog from scratch.
```

The federal roles lead with the agency on purpose — that's the first thing a recruiter scanning for cleared talent locks onto.

---

## Skills (clean list)

Pin these **top 3** (LinkedIn shows them first and weights them in search): **TypeScript**, **React**, **AI / LLM Integration**.

Full list to add (drop any you don't want to be asked about in an interview):

```
TypeScript · JavaScript · React · Next.js · Svelte / SvelteKit · Vue.js · Node.js · Express · REST APIs · Webhooks · OAuth · PostgreSQL · Supabase · LLM / agent integration · OpenAI API · Anthropic API · Model Context Protocol (MCP) · Prompt engineering · Tailwind CSS · System integration · Real-time systems (SSE / WebSockets) · Software architecture · Full-stack development
```

Only add **Security+** if you currently hold it. Don't list a lapsed cert as current.
