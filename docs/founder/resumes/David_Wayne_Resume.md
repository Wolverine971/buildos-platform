<!-- docs/founder/resumes/David_Wayne_Resume.md -->
<!-- Tailored for: General senior full-stack roles — React/TypeScript, AI systems, integrations -->

# David Wayne

**Senior Full-Stack Engineer — React, TypeScript, AI Systems & Integrations**

Washington, DC area · djwayne35@gmail.com · (202) 869-5478 · [github.com/Wolverine971](https://github.com/Wolverine971) · [linkedin.com/in/djwayne](https://linkedin.com/in/djwayne)

---

## Summary

Senior full-stack engineer with 9 years shipping production web applications. Deep **React + TypeScript** across complex, mature codebases, with hard-won experience in **enterprise integrations and AI systems engineering**. Founder of **BuildOS**, an AI-first project management platform where people and their AI agents work from one shared source of truth — built on a multi-LLM routing layer, agentic Calendar/MCP integration, and a custom Supabase-native job queue. Previously at **Curri (YC S19)**, rebuilt the React-based live operations console and owned the integration layer connecting the delivery network to Lyft, Uber, DoorDash, and other regional partners. Three years of prior delivery on **DoD and federal programs**. Former US Marine Corps Scout Sniper Team Leader; US citizen who held a **Secret clearance** through 2021 — eligible for reinstatement with sponsorship.

---

## Technical Skills

- **Languages:** TypeScript, JavaScript, C#, Java, SQL
- **Frontend:** React, Next.js, SvelteKit / Svelte 5, Vue 2/3, Angular / AngularJS, Redux-pattern state management (VueX, NgRx, Svelte stores), Tailwind, real-time UIs (SSE, WebSockets), map UIs (Mapbox)
- **Backend:** Node.js, Express, REST, webhooks, OAuth / credential exchange, async job queues
- **AI / LLM:** Multi-provider model routing with fallback (OpenRouter / OpenAI / Anthropic), tool calling, streaming, JSON mode, prompt caching, MCP-style agent integration, agent harness design, context engineering
- **Data:** PostgreSQL, Supabase (Row-Level Security, RPC), Elasticsearch, SPARQL / knowledge graphs
- **Infrastructure:** Vercel, Railway, Turborepo + pnpm workspaces, Twilio, Google OAuth, GitHub Actions

---

## Experience

### BuildOS — Founder & Engineer · Mar 2025 – Present

_AI-first project management platform where people and their AI agents work from one shared source of truth · [build-os.com](https://build-os.com)_

- Designed and shipped the full platform solo: SvelteKit web app on Vercel, Node.js worker service on Railway, Turborepo monorepo (pnpm workspaces), Supabase Postgres with row-level security.
- Built the full user-facing surface — brain-dump capture (text + voice), project and task views, a real-time streaming chat UI, daily-brief email composition, and SSE-driven progress for long-running LLM jobs.
- Built a **multi-LLM routing layer** that scores requests by task complexity, latency, and cost and routes across OpenRouter (primary) with OpenAI / Anthropic / Moonshot as direct fallbacks. Supports streaming, tool calling, and JSON mode.
- Built an **agentic chat** that reads and writes the user's Google Calendar and executes project actions via tool use. Exposed a clean integration surface so external agents (e.g. Claude Code, MCP-style harnesses) can drive BuildOS on a user's behalf.
- Designed a **Redis-free job queue** on top of Supabase using `FOR UPDATE SKIP LOCKED` for atomic job claims. Powers daily-brief generation, brain-dump processing, voice transcription, OCR, ontology classification, and SMS workflows.
- Integrated Twilio (SMS), Google OAuth, and three direct LLM provider SDKs.
- Invested deeply in **context engineering and agent harness design** — selecting the right tools, schemas, and context so LLM tool calls behave reliably in production.

### Curri (YC S19) — Software Engineer · Jan 2022 – Feb 2025

_B2B same-day construction-materials delivery platform. React + TypeScript codebase with three web frontends, a React Native driver app, and a Node worker service running the driver-search algorithm and async delivery jobs._

- **Rebuilt Curri's service-ops console into a real-time, event-driven triage system** used daily by the entire service-ops team (~20 reps, 5–10 active at a time). Replaced a static delivery dashboard with a prioritized alert queue that surfaced exceptions — driver-search timeout, assigned-driver cancellation, driver stalled at pickup, ETA overrun — to ops reps the moment they needed to act, with the resolving action exposed inline. Designed the upstream signal model and coordinated cross-system changes across the worker service and integration layer to emit the events the console consumed. Partnered closely with PM and design.
- **Built and owned Curri's third-party delivery integration layer.** Connected seven delivery service providers — Lyft, Uber, DoorDash, Dispatch, Pronto, Material Drop, Superior — into Curri's driver-search algorithm so deliveries could dynamically fail over to an external network when no in-network driver was available. Turned deliveries Curri would otherwise have lost or run at a loss into profitable ones, and expanded coverage into new markets and flexible delivery options — including specialty equipment (box trucks, stake beds, flatbeds) the in-network fleet couldn't service.
    - **Reverse-engineered every partner's delivery API.** Public docs were typically incomplete or missing; pieced together the contracts by hand.
    - Designed a hybrid **webhook + polling reconciliation pattern** to maintain ground-truth delivery state across partners with inconsistent or partial event coverage.
    - Built the **OAuth and credential-exchange flows** and partner-specific API contracts; pre-fetched pricing quotes so any open delivery could be dispatched to Uber / Lyft / DoorDash on demand.
- Built an interactive **sales / leadership map** showing geographic delivery activity, regional metrics, and customer-specific delivery patterns — giving sales reps a fast read on account activity and leadership a territory-level view for strategic decisions.

### C4 Planning Solutions — Software Engineer · Mar 2021 – Dec 2021

_**Department of Defense client** — Marine Corps military justice case management system used by military lawyers to look up case and trial information._

- Owned the **migration of the full legacy case archive** — hundreds of thousands of historical case records — into the production system; built reusable tooling to format, validate, and load incoming data.
- Shipped features and fixes in an Agile environment on a system used by military lawyers across the DoD. Stack: Vue, jQuery, SharePoint.

### Webworld Technologies — Software Engineer · Aug 2019 – Mar 2021

_**Dewey Knowledge Portal** — proof-of-concept knowledge platform for **US Air Force intelligence analysts**. Ingested intel reports and exposed them through a graph data model so analysts could traverse connections across people, places, events, and source documents._

- Designed and built the **nested AND/OR query-builder UI** that compiled visual queries to **SPARQL** and ran them against the underlying knowledge graph — letting analysts express complex connection-driven searches without writing graph queries by hand.
- Built supporting analyst tooling: classification/citation documentation flows, change-management dashboards, and a templating system that returned custom "Wikipedia-style" result pages.
- **Improved frontend performance** in the Angular + NgRx app by adding memoization to store effects and caching at the data layer, reducing redundant API calls and re-renders.

### MetroStar Systems — Software Engineer · Apr 2018 – Aug 2019

_**US Census Bureau** — Center for Enterprise Dissemination Services and Consumer Innovation (CEDSCI)._

- Re-architected an aging **AngularJS application into Vue** as part of a joint contract team (~5 frontend / 5 backend, plus data engineers and SMEs) delivering a single-search-bar interface across the Census Bureau's multidimensional public datasets.
- Built the **central search-bar component** — the product's primary interface, shipped into the live **data.census.gov** platform — engineered for responsiveness, keyboard navigation, and **Section 508 / WCAG accessibility** compliance including JAWS screen-reader support.
- Owned heavy **frontend state management in VueX** for multi-dimension faceted search and filtering.
- Led stakeholder demos and participated in agile ceremonies with 100–200 government stakeholders and SMEs in attendance.

### Sabio — Full Stack Developer · Apr 2017 – Jan 2018

_Hired by the Sabio bootcamp upon graduation to build internal tools and client work._

- Built a real-time **student-management application** (AngularJS + C# + SQL + SignalR) that managed an instructor/student help queue with one-on-one routing.
- Led the "Intro to Web Development" community meetup, walking attendees through building a working blog from scratch.

---

## Military Service

### US Marine Corps · 2012 – 2017

**Scout Sniper Team Leader · Infantry**

- Deployed to **Afghanistan (2013)** with an infantry line platoon supporting the retrograde of US forces from the country.
- Graduated **Marine Scout Sniper School** — qualified for the elite reconnaissance and precision-marksmanship community.
- Deployed to **Kuwait (2016) as a Scout Sniper Team Leader**, serving as the Quick Reaction Force for operations across the area of responsibility.
- **Honor Graduate, Corporal / Non-Commissioned Officer Course** — top of class in the Marine Corps' professional NCO leadership program.

---

## Education

- **Web Development Certificate** — Sabio Coding Bootcamp (partnered with Antioch University), 2017
- **Two years of community college coursework**

---

## Selected Personal Projects

- **[9takes.com](https://9takes.com)** — Reddit-style discussion site organized around the Enneagram personality framework, with a "give-first" mechanic: you answer before you see anyone else's take. Originally built on Vue / Nuxt / GraphQL / MongoDB, then **rebuilt solo onto SvelteKit + Supabase Postgres + Elasticsearch**. Hundreds of published articles and personality analyses; 15K+ monthly unique visitors.
- **[thecadretraining.com](https://thecadretraining.com)** — Live booking site for a long-range precision rifle training company. Drives course signups for active classes.
