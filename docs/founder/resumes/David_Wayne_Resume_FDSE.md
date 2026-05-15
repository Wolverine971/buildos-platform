<!-- docs/founder/resumes/David_Wayne_Resume_FDSE.md -->
<!-- Tailored for: Forward Deployed Software Engineer (FDSE) roles at federal / public-sector AI product organizations. Emphasizes operator-facing tooling, knowledge-graph data modeling, end-to-end solo ownership, military deployment experience, and TS-clearance eligibility. -->

# David Wayne

**Senior Full-Stack Engineer, Federal Programs & AI Agent Systems**

djwayne35@gmail.com · (202) 869-5478 · [github.com/Wolverine971](https://github.com/Wolverine971) · [linkedin.com/in/djwayne](https://linkedin.com/in/djwayne)

---

## Summary

Senior full-stack engineer with 8+ years shipping production systems. Three of those years were on **DoD and federal programs**: a DoD military justice case management system; the **US Air Force's Dewey intelligence knowledge portal**, which exposed intel reports through a graph data model so analysts could traverse connections across people, places, events, and source documents; and the US Census Bureau CEDSCI public-data search platform. Comfortable demoing and iterating directly with government stakeholders. **Former US Marine Corps Scout Sniper Team Leader** with combat deployment to Afghanistan (2013) and a Quick Reaction Force deployment to Kuwait (2016). US citizen, willing to obtain a Top Secret clearance with sponsorship. Open to travel.

The last year, as founder of **BuildOS**, an AI-first project management platform that users and their agents connect to so they work from one shared source of truth, I've owned product, design, and engineering end to end. Shipped solo to 80+ beta users. The work centers on a multi-LLM routing layer with provider fallback, agentic tool use, agent harness design, and a Postgres-backed job queue, all on a TypeScript stack across Vercel and Railway. Before that, at Curri (YC S19), I owned the third-party delivery integration layer end to end (Lyft, Uber, DoorDash, and four regional partners) and rebuilt the ops console into a real-time triage system used daily by service-ops reps.

---

## Technical Skills

- **AI / Agents:** Multi-provider LLM routing with fallback (OpenRouter, OpenAI, Anthropic, Moonshot), tool calling, streaming, JSON mode, prompt caching, agent harness design, context engineering, MCP-style external-agent integration, Claude SDK / Claude Code, LLM evaluation harnesses
- **Backend:** Node.js, Express, PostgreSQL, Supabase (Row-Level Security, RPC), Postgres-backed job queues, REST, SSE, webhooks, OAuth and credential exchange, async job processing
- **Data integration & modeling:** Building integration layers across third-party APIs, webhook and polling reconciliation patterns, legacy data migration tooling, knowledge-graph data modeling (SPARQL / RDF), ontology-style classification, Elasticsearch
- **Frontend:** React, Next.js, SvelteKit / Svelte 5, TypeScript, Vue 2/3, Angular / AngularJS, Tailwind, real-time UIs (SSE, WebSockets), Mapbox
- **Cloud & Infrastructure:** Vercel, Railway, Turborepo with pnpm workspaces, GitHub Actions
- **Languages:** TypeScript, JavaScript, C#, Java, SQL

---

## Experience

### BuildOS · Founder & Engineer · Mar 2025 – Present

_AI-first project management platform that users and their agents connect to so they work from one shared source of truth · [build-os.com](https://build-os.com) · 80+ beta users_

- Solo engineer running the entire product end to end. Two services with a shared queue, shared types, and a shared LLM layer: SvelteKit web app on Vercel, Node.js worker on Railway, Turborepo monorepo with pnpm workspaces, Supabase Postgres with row-level security.
- Built a **multi-LLM routing layer** that scores requests by task complexity, latency, and cost and routes across OpenRouter (primary) with OpenAI, Anthropic, and Moonshot as direct fallbacks. Supports streaming, tool calling, JSON mode, and prompt caching.
- Built an **agentic chat** that reads and writes the user's Google Calendar and executes project actions via tool use. Exposed a clean integration surface so external agents (Claude Code, MCP-style harnesses) can drive BuildOS on a user's behalf.
- Designed a **Postgres-native job queue on Supabase** that uses row-level locking for atomic claims, removing the need for a separate Redis or RabbitMQ deployment. Powers around 14 background job types including daily-brief generation, agentic brain-dump processing, voice transcription, OCR, ontology classification, and SMS workflows.
- Invested heavily in **agent harness design and context engineering**. Built an LLM evaluation harness with a real-API prompt test suite for validating prompt and model changes against live providers before shipping.
- Implemented per-request server-timing instrumentation, billing and consumption guards, and feature-flagged rollout patterns (shadow-then-inject) to support safe iteration on AI features in production.
- Published long-form writing on the BuildOS blog about agent engineering versus context engineering.

### Curri (YC S19) · Software Engineer · Jan 2022 – Feb 2025

_B2B same-day construction-materials delivery platform. React and TypeScript codebase across three frontends, a React Native driver app, and a Node worker service running the driver-search algorithm and async delivery jobs._

- **Rebuilt Curri's service-ops console into a real-time, event-driven triage system used daily by ops reps.** Replaced a static dashboard with a prioritized alert queue surfacing exceptions inline with their resolving action (driver-search timeout, assigned-driver cancellation, driver stalled at pickup, ETA overrun). Designed the upstream signal model and coordinated cross-system changes across the worker service and the integration layer to emit the events the console consumed. Partnered with PM and design.
- **Built and owned Curri's third-party delivery integration layer end to end.** Connected seven partners (Lyft, Uber, DoorDash, Dispatch, Pronto, Material Drop, Superior) into Curri's driver-search algorithm so deliveries could fail over to an external network when no in-network driver was available. At scale, the layer routed an estimated 100 to 200+ deliveries per day per partner.
    - Reverse-engineered every partner's delivery API. Public docs were typically incomplete or missing, so I pieced together the contracts by hand.
    - Designed a hybrid webhook and polling reconciliation pattern to maintain ground-truth state across partners with inconsistent or partial event coverage.
    - Built the OAuth and credential-exchange flows and partner-specific API contracts. Pre-fetched pricing quotes so deliveries could be dispatched on demand.

### C4 Planning Solutions · Software Engineer · Mar 2021 – Dec 2021

_DoD contract. Worked on the Military Justice Case Management System used by military lawyers across the DoD justice system._

- Performed substantial data migrations of legacy case data into the production system. Built reusable migration tooling to format and load incoming data.
- Bug fixes and new feature work in an Agile environment. Stack: Vue, jQuery, SharePoint.

### Webworld Technologies · Software Engineer · Aug 2019 – Mar 2021

_USAF contract. Built the **Dewey Knowledge Portal**, a proof-of-concept analyst platform for US Air Force intelligence analysts. Ingested intel reports and exposed them through a graph data model so analysts could traverse connections across people, places, events, and source documents._

- **Designed and built the nested AND/OR query-builder UI** that compiled visual queries to SPARQL and ran them against the underlying knowledge graph, letting analysts express complex connection-driven searches without writing graph queries by hand. Iterated against direct analyst feedback.
- Built supporting analyst tooling: classification and citation documentation flows, change-management dashboards, and a templating system that returned custom Wikipedia-style result pages.
- Improved frontend performance in the Angular and NgRx app by adding memoization to store effects and caching at the data layer, which reduced redundant API calls and re-renders.

### MetroStar Systems · Software Engineer · Apr 2018 – Aug 2019

_US Census Bureau contract. Center for Enterprise Dissemination Services and Consumer Innovation (CEDSCI) program._

- Re-architected an aging AngularJS application into Vue as part of a joint contract team (around 5 frontend, 5 backend, plus data engineers and SMEs) delivering a single-search-bar interface across the Census Bureau's multidimensional public datasets.
- Built the central search-bar component, the product's primary interface, engineered for responsiveness, keyboard navigation, and **Section 508 / WCAG accessibility** including JAWS screen-reader support.
- Owned heavy frontend state management in VueX for multi-dimension faceted search and filtering.
- Led stakeholder demos and participated in agile ceremonies with 100 to 200 government stakeholders and SMEs in attendance.

### Sabio · Full Stack Developer · Apr 2017 – Jan 2018

_Hired by the Sabio bootcamp upon graduation to build internal tools and client work._

- Built a real-time student-management application (AngularJS, C#, SQL, SignalR) that managed an instructor and student help queue with one-on-one routing.
- Led the "Intro to Web Development" community meetup, walking attendees through building a working blog from scratch.

---

## Military Service

### US Marine Corps · 2012 – 2017

**Scout Sniper Team Leader · Infantry**

- Deployed to **Afghanistan (2013)** with an infantry line platoon supporting the retrograde of US forces from the country.
- Graduated **Marine Scout Sniper School (2015)**, qualified for the elite reconnaissance and precision-marksmanship community.
- Deployed to **Kuwait (2016) as a Scout Sniper Team Leader**, serving as the Quick Reaction Force for operations across the area of responsibility. Mission planning, aviation coordination, and time-pressured decision making with infantry and aviation assets.
- **Honor Graduate, Corporal / Non-Commissioned Officer Course.** Top of class in the Marine Corps' professional NCO leadership program.

---

## Education

- **Web Development Certificate**, Sabio Coding Bootcamp (partnered with Antioch University), 2017
- **Two years of community college coursework**

---

## Selected Personal Projects

- **[9takes.com](https://9takes.com).** Reddit-style discussion site organized around the Enneagram personality framework. Built solo on Vue, Nuxt, GraphQL, Elasticsearch, and MongoDB. 15K+ monthly unique visitors, 100+ registered users.
