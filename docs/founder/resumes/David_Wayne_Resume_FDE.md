<!-- docs/founder/resumes/David_Wayne_Resume_FDE.md -->
<!-- Tailored for: Forward-deployed / customer-embedded engineering roles in defense and federal product orgs -->

# David Wayne

**Senior Full-Stack Engineer — Product-Minded, TypeScript / React**

djwayne35@gmail.com · (202) 869-5478 · [github.com/Wolverine971](https://github.com/Wolverine971) · [linkedin.com/in/djwayne](https://linkedin.com/in/djwayne)

---

## Summary

Senior full-stack engineer with 8+ years shipping production systems, including substantial work on **DoD and federal programs** and a track record of building new products end-to-end as the only engineer in the room. Founder of **BuildOS**, an AI-first project management platform that users and their agents connect to so they work from one shared source of truth. Built solo from scratch and shipped to 80+ beta users, with full ownership of a TypeScript distributed system on Vercel + Railway with a Postgres-backed job queue and a multi-LLM routing layer. Prior delivery against federal customers — **DoD military justice case management, US Air Force intelligence knowledge portal, US Census Bureau search platform** — including direct demos and prototype iteration with government stakeholders. At Curri (YC S19) reverse-engineered seven third-party delivery APIs and owned the integration layer end-to-end. **Former US Marine Corps Scout Sniper Team Leader** with combat deployment experience; US citizen, eligible to obtain a US security clearance with sponsorship; comfortable traveling to customer sites.

---

## Technical Skills

- **Languages:** TypeScript, JavaScript, Java, C#, SQL
- **Frontend:** React, Next.js, SvelteKit / Svelte 5, Vue 2/3, Angular / AngularJS, Tailwind, real-time UIs (SSE, WebSockets), Mapbox
- **Backend & Data:** Node.js, Express, **PostgreSQL**, Supabase (RLS, RPC), REST, webhooks, OAuth / credential exchange, async job queues, Elasticsearch, SPARQL / knowledge graphs
- **AI / LLM:** Multi-provider LLM routing (OpenRouter / OpenAI / Anthropic), tool calling, agent harness design, context engineering
- **Cloud / Infrastructure:** Vercel, Railway, Turborepo + pnpm workspaces, GitHub Actions

---

## Experience

### BuildOS — Founder & Engineer · Mar 2025 – Present

_AI-first project management platform that users and their agents connect to so they work from one shared source of truth · [build-os.com](https://build-os.com) · 80+ beta users_

- Designed and shipped the full platform solo: SvelteKit web app on Vercel, Node.js worker service on Railway, Turborepo monorepo (pnpm workspaces), Supabase Postgres with row-level security. Full ownership across product, design, and engineering.
- Shipped the user-facing surface to 80+ beta users — brain-dump capture (text + voice), project and task views, a real-time streaming chat UI, daily-brief email composition, and SSE-driven progress for long-running jobs — and iterated continuously against direct user feedback.
- Built a **multi-LLM routing layer** (OpenRouter primary, OpenAI / Anthropic / Moonshot fallback) supporting streaming, tool calling, and JSON mode — and an **agentic chat** that reads and writes the user's Google Calendar via tool use.
- Designed a **Redis-free Postgres-native job queue** using `FOR UPDATE SKIP LOCKED` for atomic job claims. Powers ~14 background job types including daily briefs, brain-dump processing, voice transcription, OCR, and SMS workflows.
- Stack: TypeScript across the entire codebase, Postgres / Supabase for persistence, Tailwind for UI, GitHub Actions for CI.

### Curri (YC S19) — Software Engineer · Jan 2022 – Feb 2025

_B2B same-day construction-materials delivery startup. React + TypeScript codebase across three frontends, a React Native driver app, and a Node worker service running the driver-search algorithm and async delivery jobs._

- **Built and owned Curri's third-party delivery integration layer** end-to-end — connected seven providers (**Lyft, Uber, DoorDash, Dispatch, Pronto, Material Drop, Superior**) into Curri's driver-search algorithm so deliveries could fail over to an external network when no in-network driver was available. Routed an estimated 100–200+ deliveries per day per partner at scale.
    - **Reverse-engineered every partner's delivery API.** Public docs were typically incomplete or missing; pieced together the contracts by hand.
    - Designed a hybrid **webhook + polling reconciliation pattern** to maintain ground-truth state across partners with inconsistent event coverage.
    - Built the **OAuth and credential-exchange flows** and partner-specific API contracts; pre-fetched pricing quotes so deliveries could be dispatched on demand.
- **Rebuilt Curri's service-ops console into a real-time, event-driven triage system.** Partnered with PM and design to scope and ship; coordinated cross-system changes across the worker service and integration layer to emit the events the new console consumed (driver-search timeout, assigned-driver cancellation, driver stalled at pickup, ETA overrun). Each exception surfaced inline with its resolving action.

### C4 Planning Solutions — Software Engineer · Mar 2021 – Dec 2021

_**Department of Defense client** — Military Justice Case Management System used by military lawyers across the DoD military justice system._

- Performed substantial **data migrations of legacy case data** into the production system; built reusable migration tooling to format and load incoming data.
- Tackled bug fixes and new feature work in an Agile environment. Stack: Vue, jQuery, SharePoint.

### Webworld Technologies — Software Engineer · Aug 2019 – Mar 2021

_**Dewey Knowledge Portal** — proof-of-concept knowledge platform for **US Air Force intelligence analysts**. Ingested intel reports and exposed them through a graph data model so analysts could traverse connections across people, places, events, and source documents._

- Designed and built the **nested AND/OR query-builder UI** that compiled visual queries to **SPARQL** and ran them against the underlying knowledge graph — letting analysts express complex connection-driven searches without writing graph queries by hand. Iterated against direct analyst feedback.
- Built supporting analyst tooling: classification/citation documentation flows, change-management dashboards, and a templating system that returned custom "Wikipedia-style" result pages.
- **Improved frontend performance** in the Angular + NgRx app by adding memoization to store effects and caching at the data layer, reducing redundant API calls and re-renders.

### MetroStar Systems — Software Engineer · Apr 2018 – Aug 2019

_**US Census Bureau** — Center for Enterprise Dissemination Services and Consumer Innovation (CEDSCI)._

- Re-architected an aging **AngularJS application into Vue** as part of a joint contract team (~5 frontend / 5 backend, plus data engineers and SMEs) delivering a single-search-bar interface across the Census Bureau's multidimensional public datasets.
- Built the **central search-bar component** — the product's primary interface — engineered for responsiveness, keyboard navigation, and **Section 508 / WCAG accessibility** compliance including JAWS screen-reader support.
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
- Graduated **Marine Scout Sniper School (2015)** — qualified for the elite reconnaissance and precision-marksmanship community.
- Deployed to **Kuwait (2016) as a Scout Sniper Team Leader**, serving as the Quick Reaction Force for operations across the area of responsibility.
- **Honor Graduate, Corporal / Non-Commissioned Officer Course** — top of class in the Marine Corps' professional NCO leadership program.

---

## Education

- **Web Development Certificate** — Sabio Coding Bootcamp (partnered with Antioch University), 2017
- **Two years of community college coursework**

---

## Selected Personal Projects

- **[9takes.com](https://9takes.com)** — Reddit-style discussion site organized around the Enneagram personality framework. Built solo on Vue + Nuxt + GraphQL + Elasticsearch + MongoDB. 15K+ monthly unique visitors, 100+ registered users.
