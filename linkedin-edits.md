Here's all of it, paste-ready. Two quick flags before the copy: your resume says Curri is **YC S19** but your About says W21 — I used S19, confirm which is right. And only keep **Security+** in skills if you actually hold it (verify). Now the copy.

## About section

> Senior full-stack engineer with 9 years shipping production web applications — deep in React + TypeScript, with hard-won experience in enterprise integrations and AI systems.
>
> Most recently I built BuildOS solo: an AI-first project platform running a multi-LLM routing layer, agentic Calendar/MCP integrations, and a custom Supabase-native job queue. Before that, at Curri (YC S19), I rebuilt the live operations console and owned the integration layer connecting the delivery network to Lyft, Uber, and DoorDash.
>
> I also spent three years delivering on DoD and federal programs — a Marine Corps military justice case system, a US Air Force intelligence knowledge-graph platform, and the US Census Bureau's public data search (live on data.census.gov). US citizen; held a Secret clearance through 2021, eligible for reinstatement with sponsorship.
>
> Before tech, I served as a US Marine Corps Scout Sniper Team Leader. That background shows up in how I work: precision, ownership, and calm under pressure on small teams where the outcome lands on you.
>
> I've been called a "product-minded engineer" — I care how it feels to use what I build, and I ship tools that are warm, human, and useful.
>
> Open to senior full-stack, AI/LLM, or platform engineering roles — full-time or contract, remote or in the DC/Baltimore area.
>
> Tech: TypeScript · React · Next.js · SvelteKit · Node.js · PostgreSQL · Supabase · LLM/agent integration (OpenAI, Anthropic, MCP, tool calling) · REST · webhooks · OAuth

That leads with hireable, uses the founder work as proof instead of a competing identity, and surfaces the clearance/federal/veteran moat that your current About completely buries.

## Job descriptions

**Founder & Engineer — BuildOS (Feb 2025 – Present)**
> AI-first project platform where people and their AI agents work from one shared source of truth. Built and shipped solo.
> • Designed and shipped the entire platform solo — SvelteKit web app (Vercel), Node.js worker service (Railway), Turborepo monorepo, Supabase Postgres with row-level security.
> • Built a multi-LLM routing layer that scores each request by complexity, latency, and cost and routes across providers (OpenRouter, OpenAI, Anthropic) with automatic fallback — streaming, tool calling, and JSON mode.
> • Built an agentic chat that reads and writes Google Calendar and executes project actions via tool use, with an MCP-style surface so external agents can drive the app on a user's behalf.
> • Designed a Redis-free job queue on Supabase using FOR UPDATE SKIP LOCKED for atomic job claims — powering daily briefs, brain-dump processing, transcription, OCR, and SMS workflows.
> • Integrated Twilio, Google OAuth, and three direct LLM provider SDKs.

**Software Engineer — Curri (YC S19) (Jan 2022 – Feb 2025)**
> B2B same-day construction-materials delivery platform. React + TypeScript across three web frontends, a React Native driver app, and a Node worker service.
> • Rebuilt the service-ops console into a real-time, event-driven triage system used daily by the whole ops team — replaced a static dashboard with a prioritized alert queue surfacing exceptions (driver-search timeouts, cancellations, ETA overruns) with the resolving action inline.
> • Built and owned the third-party delivery integration layer — connected seven providers (Lyft, Uber, DoorDash, Dispatch, Pronto, Material Drop, Superior) into the driver-search algorithm so deliveries could fail over to an external network when no in-network driver was available.
> • Reverse-engineered each partner's API by hand (docs were incomplete or missing) and designed a hybrid webhook + polling reconciliation pattern to hold ground-truth delivery state across partners with inconsistent event coverage.
> • Built the OAuth and credential-exchange flows and pre-fetched pricing quotes so any open delivery could be dispatched on demand — turning deliveries Curri would have lost into profitable ones and opening new markets.
> • Built an interactive sales/leadership map of geographic delivery activity and regional metrics.

**Software Engineer — C4 Planning Solutions (Mar 2021 – Dec 2021)**
> Department of Defense client — Marine Corps military justice case management system used by military lawyers across the DoD.
> • Owned the migration of the full legacy case archive — hundreds of thousands of historical records — into the production system; built reusable tooling to format, validate, and load incoming data.
> • Shipped features and fixes in an Agile environment on a system in active DoD use. Stack: Vue, jQuery, SharePoint.

**Software Engineer — Webworld Technologies (WTI) (Aug 2019 – Mar 2021)**
> Dewey Knowledge Portal — proof-of-concept knowledge platform for US Air Force intelligence analysts, exposing intel reports through a graph data model across people, places, events, and source documents.
> • Designed and built a nested AND/OR query-builder UI that compiled visual queries to SPARQL and ran them against the knowledge graph — letting analysts express connection-driven searches without writing graph queries by hand.
> • Built supporting analyst tooling: classification/citation flows, change-management dashboards, and a templating system returning custom "Wikipedia-style" result pages.
> • Improved frontend performance in an Angular + NgRx app via store-effect memoization and data-layer caching, cutting redundant API calls and re-renders.

**Software Engineer — MetroStar Systems (Apr 2018 – Aug 2019)**
> US Census Bureau (CEDSCI) — a single-search interface across the Bureau's multidimensional public datasets, shipped into data.census.gov.
> • Re-architected an aging AngularJS application into Vue as part of a joint contract team delivering a unified search interface across the Census Bureau's public datasets.
> • Built the central search-bar component — the product's primary interface, live on data.census.gov — engineered for responsiveness, keyboard navigation, and Section 508 / WCAG accessibility including JAWS screen-reader support.
> • Owned frontend state management in VueX for multi-dimension faceted search and filtering.
> • Led stakeholder demos with 100–200 government stakeholders and SMEs.

**Full Stack Developer — Sabio (Apr 2017 – Jan 2018)**
> Hired by the Sabio bootcamp on graduation to build internal tools and client work.
> • Built a real-time student-management app (AngularJS + C# + SQL + SignalR) managing an instructor/student help queue with one-on-one routing.
> • Led the "Intro to Web Development" community meetup, teaching attendees to build a working blog from scratch.

One thing to fix while you're in there: your LinkedIn currently shows WTI ending Nov 2020, but your resume says Mar 2021 — make them match (Mar 2021 also closes the gap before C4). Use whichever is actually true.

The federal roles lead with the agency on purpose — that's what a recruiter scanning for cleared talent locks onto. Once these are in, your profile finally tells the story your resume already tells. Want me to do the headline options and the cleaned-up skills list next?