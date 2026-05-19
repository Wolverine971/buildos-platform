<!-- docs/founder/resumes/David_Wayne_Resume_Frontend_AI.md -->
<!-- Tailored for: Frontend / full-stack product-engineering roles at AI-native search, recommendations, and retrieval product companies -->

# David Wayne

**Senior Full-Stack Engineer — React, Next.js, TypeScript & Product Engineering**

djwayne35@gmail.com · (202) 869-5478 · [github.com/Wolverine971](https://github.com/Wolverine971) · [linkedin.com/in/djwayne](https://linkedin.com/in/djwayne)

---

## Summary

Senior full-stack engineer with 8+ years shipping production React + TypeScript web apps, with a sharp eye for UX and an instinct for product surfaces customers actually want to use. Founder of **BuildOS**, an AI-first product (multi-LLM routing, agentic chat with tool calling, real-time streaming UI) shipped solo end-to-end and now used by 80+ beta users. Previously at Curri (YC S19) shipped across **three Next.js + TypeScript frontends** in a mature monorepo, rebuilt the live operations console into a real-time event-driven triage UI, and owned the integration layer connecting Curri's delivery network to Lyft, Uber, DoorDash, and four regional partners. Earlier built customer-facing search UIs at scale — the US Census Bureau single-search-bar interface, and a SPARQL query-builder UI for an Air Force knowledge graph. Comfortable embedded with product, design, and end users.

---

## Technical Skills

- **Frontend:** React, Next.js, TypeScript, Tailwind, SvelteKit / Svelte 5, Vue 2/3, Angular / AngularJS, Redux-pattern state management (VueX, NgRx, Svelte stores), real-time UIs (SSE, WebSockets), map UIs (Mapbox), accessibility (Section 508 / WCAG / JAWS)
- **AI / LLM:** Multi-provider LLM routing with fallback (OpenRouter, OpenAI, Anthropic, Moonshot), tool calling, streaming, JSON mode, prompt caching, agent harness design, context engineering, MCP-style external-agent integration
- **Backend:** Node.js, Express, REST, webhooks, OAuth / credential exchange, async job queues
- **Data:** PostgreSQL, Supabase (Row-Level Security, RPC), Elasticsearch, SPARQL / knowledge graphs
- **Infrastructure:** Vercel, Railway, Turborepo + pnpm workspaces, GitHub Actions, Twilio
- **Languages:** TypeScript, JavaScript, C#, Java

---

## Experience

### BuildOS — Founder & Engineer · Mar 2025 – Present

_AI-first project management platform that users and their agents connect to so they work from one shared source of truth · [build-os.com](https://build-os.com) · 80+ beta users · solo build_

- **Shipped the full user-facing surface to 80+ beta users** — brain-dump capture (text + voice), project and task views, a **real-time streaming chat UI** with tool-call surfacing, daily-brief email composition, and SSE-driven progress for long-running LLM jobs. SvelteKit on Vercel; Inkprint design system built in-house.
- Built an **agentic chat** that reads and writes the user's Google Calendar and executes project actions via tool use. Exposed a clean integration surface so external agents (Claude Code, MCP-style harnesses) can drive BuildOS on a user's behalf.
- Built a **multi-LLM routing layer** that scores requests by task complexity, latency, and cost and routes across OpenRouter (primary) with OpenAI, Anthropic, and Moonshot as direct fallbacks. Supports streaming, tool calling, JSON mode, and prompt caching.
- Designed and stood up the full backend — Node.js worker service on Railway, Turborepo + pnpm monorepo, Supabase Postgres with row-level security, and a Redis-free Postgres-native job queue powering ~14 job types (daily briefs, brain-dump processing, voice transcription, OCR, SMS).
- Invested deeply in **context engineering** — selecting the right tools, schemas, and context so LLM tool calls behave reliably in production. Wrote and shipped an LLM evaluation harness against live providers.
- Wrote long-form public posts on agent vs. context engineering — the patterns I rely on for production LLM systems.

### Curri (YC S19) — Software Engineer · Jan 2022 – Feb 2025

_B2B same-day construction-materials delivery platform. Mature TypeScript monorepo with **three Next.js frontends** — internal admin, customer booking, and public marketing site — plus a React Native driver app and a Node worker service running the driver-search algorithm and async delivery jobs._

- **Rebuilt Curri's service-ops console into a real-time, event-driven triage UI.** Replaced a static delivery dashboard with a prioritized alert queue that surfaced exceptions — driver-search timeout, assigned-driver cancellation, driver stalled at pickup, ETA overrun — to ops reps the moment they needed to act, with the resolving action exposed inline. Designed the upstream signal model and coordinated cross-system changes across the worker service and the integration layer to emit the events the console consumed. Built around operator throughput: keep the right delivery in front of the rep, with the right control one click away. Partnered closely with PM, design, and the ops org consuming the tool.
- **Built and owned Curri's third-party delivery integration layer.** Connected seven delivery service providers — **Lyft, Uber, DoorDash, Dispatch, Pronto, Material Drop, Superior** — into Curri's driver-search algorithm so deliveries could dynamically fail over to an external network when no in-network driver was available, recovering deliveries that would otherwise have lost money on small jobs or stranded customers.
    - **Reverse-engineered every partner's delivery API** — public docs were typically incomplete or missing; pieced together the contracts by hand for all seven partners.
    - Designed a hybrid **webhook + polling reconciliation pattern** to maintain ground-truth delivery state across partners with inconsistent or partial event coverage.
    - Built **OAuth and credential-exchange flows** and partner-specific API contracts; pre-fetched pricing quotes so any open delivery could be dispatched on demand.
    - Routed an estimated 100–200+ deliveries per day per partner at scale, including high-margin specialty equipment the in-network fleet couldn't service.
- **Built an interactive sales / leadership map** showing geographic delivery activity, regional metrics, and customer-specific delivery patterns. Sales reps got a fast read on where deliveries were happening and how individual accounts were spending; leadership got a territory-level view for strategic decisions.

### C4 Planning Solutions — Software Engineer · Mar 2021 – Dec 2021

_Military Justice Case Management System used by military lawyers to look up case and trial information across the DoD military justice system._

- Performed substantial **data migrations of legacy case data** into the production system; built reusable migration tooling to format and load incoming data.
- Bug fixes and new feature work in an Agile environment. Stack: Vue, jQuery, SharePoint.

### Webworld Technologies — Software Engineer · Aug 2019 – Mar 2021

_Dewey Knowledge Portal — proof-of-concept knowledge platform for US Air Force intelligence analysts. Ingested intel reports and exposed them through a graph data model so analysts could traverse connections across people, places, events, and source documents._

- Designed and built the **nested AND/OR query-builder UI** that compiled visual queries to **SPARQL** and ran them against the underlying knowledge graph — letting analysts express complex connection-driven searches without writing graph queries by hand. Direct experience designing an analyst-facing search UI on top of a retrieval engine.
- Built supporting analyst tooling: classification/citation documentation flows, change-management dashboards, and a templating system that returned custom "Wikipedia-style" result pages.
- **Improved frontend performance** in the Angular + NgRx app by adding memoization to store effects and caching at the data layer, reducing redundant API calls and re-renders.

### MetroStar Systems — Software Engineer · Apr 2018 – Aug 2019

_US Census Bureau — Center for Enterprise Dissemination Services and Consumer Innovation (CEDSCI). Single-search-bar interface across the Census Bureau's multidimensional public datasets._

- Built the **central search-bar component** — the product's primary user interface — engineered for responsiveness, keyboard navigation, and **Section 508 / WCAG accessibility** including JAWS screen-reader support. The kind of search-input surface that thousands of users hit as the front door to the product.
- Re-architected an aging **AngularJS application into Vue** as part of a joint contract team (~5 frontend / 5 backend, plus data engineers and SMEs).
- Owned heavy **frontend state management in VueX** for multi-dimension faceted search and filtering.
- Led stakeholder demos and participated in agile ceremonies with 100–200 government stakeholders and SMEs in attendance.

### Sabio — Full Stack Developer · Apr 2017 – Jan 2018

_Hired by the Sabio bootcamp upon graduation to build internal tools and client work._

- Built a real-time **student-management application** (AngularJS + C# + SQL + SignalR) that managed an instructor/student help queue with one-on-one routing.
- Led the "Intro to Web Development" community meetup, walking attendees through building a working blog from scratch.

---

## Selected Personal Projects

- **[9takes.com](https://9takes.com)** — Reddit-style discussion site organized around the Enneagram personality framework. Built solo on Vue + Nuxt + GraphQL + **Elasticsearch** + MongoDB. ~15K monthly unique visitors, 1,500+ weekly uniques, 100+ registered users. Real consumer-facing product with a search/discovery surface backed by Elasticsearch.
- **[thecadretraining.com](https://thecadretraining.com)** — Live booking site for a long-range precision rifle training company. Drives course signups for active classes.

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
