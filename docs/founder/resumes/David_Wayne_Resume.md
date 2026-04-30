<!-- David_Wayne_Resume.md -->

# David Wayne

**Senior Full-Stack Engineer — React, TypeScript, AI Systems & Integrations**

djwayne35@gmail.com · (202) 869-5478 · [github.com/Wolverine971](https://github.com/Wolverine971) · [linkedin.com/in/djwayne](https://linkedin.com/in/djwayne)

---

## Summary

Senior full-stack engineer with 8+ years shipping production web applications. Deep React + TypeScript across complex, mature codebases, with hard-won experience in enterprise integrations and AI systems engineering. Founder of **BuildOS**, an AI-native productivity platform built on a multi-LLM routing layer, agentic Calendar/MCP integration, and a custom Supabase-native job queue. Previously at Curri rebuilt the React-based live operations console and owned the integration layer connecting the delivery network to Lyft, Uber, DoorDash, and four regional partners. Former US Marine Corps Scout Sniper Team Leader.

---

## Technical Skills

- **Frontend:** React, Next.js, TypeScript, Redux-pattern state management (VueX, NgRx, Svelte stores), Vue 2/3, AngularJS, Angular, Svelte / SvelteKit, Tailwind, real-time UIs (SSE, WebSockets), map UIs (Mapbox)
- **Backend:** Node.js, Express, C#, Java, REST, webhooks, OAuth / credential exchange, async job queues
- **AI / LLM:** OpenRouter, multi-provider model routing with fallback (OpenAI / Anthropic / Moonshot), prompt caching, tool calling, streaming, JSON mode, MCP-style agent integration, context engineering, agent harness design
- **Data:** PostgreSQL, Supabase (Row-Level Security, RPC), Elasticsearch, SPARQL / knowledge graphs
- **Infrastructure:** Vercel, Railway, Turborepo + pnpm workspaces, Twilio, Google OAuth, GitHub Actions

---

## Experience

### BuildOS — Founder & Engineer · Mar 2025 – Present

_AI-native productivity platform · [build-os.com](https://build-os.com) · 80+ beta users_

- Designed and shipped the full platform solo: SvelteKit web app on Vercel, Node.js worker service on Railway, Turborepo monorepo (pnpm workspaces), Supabase Postgres with row-level security.
- **Shipped the full user-facing surface to 80+ beta users** — brain-dump capture (text + voice), project and task views, a real-time streaming chat UI, daily-brief email composition, and SSE-driven progress for long-running LLM jobs.
- Built a **multi-LLM routing layer** that scores requests by task complexity, latency, and cost and routes across OpenRouter (primary) with OpenAI / Anthropic / Moonshot as direct fallbacks. Supports streaming, tool calling, and JSON mode.
- Built an **agentic chat** that reads and writes the user's Google Calendar and executes project actions via tool use. Exposes a clean integration surface so external agents (e.g. Claude Code, MCP-style harnesses) can drive BuildOS on a user's behalf.
- Designed a **Redis-free job queue** on top of Supabase using `FOR UPDATE SKIP LOCKED` for atomic job claims. Powers daily brief generation, brain-dump processing, voice transcription, OCR, ontology classification, and SMS workflows.
- Integrated Twilio (SMS), Google OAuth, and three direct LLM provider SDKs.
- Invested deeply in **context engineering and agent harness design** — the discipline of selecting the right tools, schemas, and context so LLM tool calls behave reliably in production.

### Curri (YC S19) — Software Engineer · Jan 2022 – Feb 2025

_B2B same-day construction-materials delivery platform. Monolithic React + TypeScript codebase with three web frontends — the internal admin and customer booking app both built on **Next.js**, plus a public marketing site — a React Native driver app, and a Node worker service running the driver-search algorithm and async delivery jobs._

- **Rebuilt Curri's service-ops console into a real-time, event-driven triage system.** Replaced a static delivery dashboard with a prioritized alert queue that surfaced exceptions — driver-search timeout, assigned-driver cancellation, driver stalled at pickup, ETA overrun — to ops reps the moment they needed to act, with the resolving action exposed inline. Designed the upstream signal model and coordinated cross-system changes across the worker service and the integration layer to emit the events the console consumed. The console was built around operator throughput: keep the right delivery in front of the rep, with the right control one click away. Partnered closely with PM and design.
- **Built and owned Curri's third-party delivery integration layer.** Connected seven delivery service providers — **Lyft, Uber, DoorDash, Dispatch, Pronto, Material Drop, Superior** — into Curri's driver-search algorithm so deliveries could dynamically fail over to an external network when no in-network driver was available, recovering deliveries that would otherwise have lost money on small / unprofitable jobs or left customers stranded.
    - **Reverse-engineered every partner's delivery API.** Public docs were typically incomplete or missing; pieced together the contracts by hand for Lyft, Uber, DoorDash, Dispatch, Pronto, Material Drop, and Superior.
    - Designed a hybrid **webhook + polling reconciliation pattern** to maintain ground-truth delivery state across partners with inconsistent or partial event coverage.
    - Built the **OAuth and credential-exchange flows** and partner-specific API contracts for each integration; pre-fetched pricing quotes so any open delivery could be dispatched to Uber / Lyft / DoorDash on demand.
    - At scale the layer routed an estimated 100–200+ deliveries per day per partner, including high-margin specialty equipment (box trucks, stake beds, flatbeds) the in-network fleet couldn't service.
- **Built an interactive sales / leadership map** showing geographic delivery activity, regional metrics, and customer-specific delivery patterns. Gave sales reps a fast read on where deliveries were happening and how individual accounts were spending; gave leadership a territory-level view for strategic decisions.

### C4 Planning Solutions — Software Engineer · Mar 2021 – Dec 2021

_Military Justice Case Management System (Department of Defense client) used by military lawyers to look up case and trial information across the DoD military justice system._

- Performed substantial **data migrations of legacy case data** into the production system; built reusable migration tooling to format and load incoming data.
- Tackled bug fixes and new feature work in an Agile environment. Stack: Vue, jQuery, SharePoint.

### Webworld Technologies — Software Engineer · Aug 2019 – Mar 2021

_Dewey Knowledge Portal — proof-of-concept knowledge platform for US Air Force intelligence analysts. Ingested intel reports and exposed them through a graph data model so analysts could traverse connections across people, places, events, and source documents._

- Designed and built the **nested AND/OR query-builder UI** that compiled visual queries to **SPARQL** and ran them against the underlying knowledge graph — letting analysts express complex connection-driven searches without writing graph queries by hand.
- Built supporting analyst tooling: documentation flows for classifications and citations, dashboards for moving files through change-management processes, and a templating system that returned custom "Wikipedia-style" result pages.
- **Improved frontend performance** across the application by adding memoization to NgRx store effects and caching at the data layer — reducing redundant API calls and re-renders. Worked in an Angular + NgRx codebase with heavy state-management and visualization concerns.

### MetroStar Systems — Software Engineer · Apr 2018 – Aug 2019

_US Census Bureau — Center for Enterprise Dissemination Services and Consumer Innovation (CEDSCI)_

- Re-architected an aging **AngularJS application into Vue** as part of a joint contract team (~5 frontend / 5 backend, plus data engineers and SMEs) delivering a single-search-bar interface across the Census Bureau's multidimensional public datasets.
- Built the **central search-bar component** — the product's primary interface — engineered for responsiveness, keyboard navigation, and **Section 508 / WCAG accessibility** compliance including JAWS screen-reader support.
- Owned heavy **frontend state management in VueX** for multi-dimension faceted search and filtering.
- Led stakeholder demos and participated in agile ceremonies with 100–200 government stakeholders and subject-matter experts in attendance.

### Sabio — Full Stack Developer · Apr 2017 – Jan 2018

_Hired by the Sabio bootcamp upon graduation to build internal tools and client work._

- Built a real-time **student-management application** (AngularJS + C# + SQL + SignalR) that managed an instructor/student help queue with one-on-one routing.
- Led the "Intro to Web Development" community meetup, walking attendees through building a working blog from scratch.
- Built an internal operations application for the Youth Mentoring Connection nonprofit using Agile delivery.

---

## Military Service

### US Marine Corps · 2012 – 2017

**Scout Sniper Team Leader · Infantry**

- Deployed to **Afghanistan (2013)** with an infantry line platoon supporting the retrograde of US forces from the country.
- Graduated **Marine Scout Sniper School (2015)** — qualified for the elite reconnaissance and precision-marksmanship community.
- Deployed to **Kuwait (2016) as a Scout Sniper Team Leader**, serving as the Quick Reaction Force for operations across the area of responsibility.
- **Honor Graduate, Corporal / Non-Commissioned Officer Course** — top of class in the Marine Corps' professional NCO leadership program.

---

## Education

- **Web Development Certificate** — Sabio Coding Bootcamp (partnered with Antioch University), 2017
- **Two years of community college coursework**

---

## Personal Projects

- **[9takes.com](https://9takes.com)** — Reddit-style discussion site organized around the Enneagram personality framework. Built solo on Vue + Nuxt + GraphQL + Elasticsearch + MongoDB. 15K+ monthly unique visitors, 1,500+ weekly uniques, 100+ registered users.
- **[thecadretraining.com](https://thecadretraining.com)** — Live booking site for a long-range precision rifle training company. Drives course signups for active classes.
