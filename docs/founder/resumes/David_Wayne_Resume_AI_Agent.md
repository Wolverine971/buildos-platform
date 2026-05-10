<!-- docs/founder/resumes/David_Wayne_Resume_AI_Agent.md -->
<!-- Tailored for: AI agents / LLM platform engineering roles -->

# David Wayne

**Senior Full-Stack Engineer — AI Agents, LLM Platforms & Context Engineering**

djwayne35@gmail.com · (202) 869-5478 · [github.com/Wolverine971](https://github.com/Wolverine971) · [linkedin.com/in/djwayne](https://linkedin.com/in/djwayne)

---

## Summary

Senior software engineer with 8+ years shipping production systems, with the last year focused on **AI agent platforms, LLM routing infrastructure, and agent harness design**. Founder of **BuildOS**, an AI-native platform built around a multi-LLM routing layer with provider fallback (OpenRouter, OpenAI, Anthropic, Moonshot), an agentic chat with tool calling and MCP-style external-agent integration, and a Supabase-native distributed job queue. Three years of prior experience on **DoD and federal programs** — US Air Force intelligence knowledge graph, DoD military justice case-management system, US Census Bureau search platform. Former US Marine Corps Scout Sniper Team Leader; US citizen.

---

## Technical Skills

- **AI / Agents:** Multi-provider LLM routing with fallback (OpenRouter, OpenAI, Anthropic, Moonshot), tool calling, streaming, JSON mode, prompt caching, **agent harness design, context engineering**, MCP-style external-agent integration, Claude SDK / Claude Code, LLM evaluation harnesses (real-API prompt test suites)
- **Backend / Distributed Systems:** Node.js, Express, **Supabase Postgres-native job queue** (`FOR UPDATE SKIP LOCKED`, atomic claim RPCs), worker services, webhooks, OAuth / credential exchange, REST + SSE, async job processing
- **Cloud Infrastructure:** Vercel, Railway, Turborepo + pnpm workspaces, GitHub Actions, PostgreSQL with row-level security
- **Frontend:** SvelteKit / Svelte 5, React, Next.js, TypeScript, real-time UIs (SSE, WebSockets), Vue, Angular
- **Data:** PostgreSQL, Supabase (RLS, RPC), Elasticsearch, **SPARQL / knowledge graphs**
- **Languages:** TypeScript, JavaScript, C#, Java

---

## Experience

### BuildOS — Founder & Engineer · Mar 2025 – Present

_AI-native productivity platform · [build-os.com](https://build-os.com) · 80+ beta users_

- Designed and shipped the full platform solo: SvelteKit web app on Vercel, Node.js worker on Railway, Turborepo monorepo (pnpm workspaces), Supabase Postgres with row-level security. Distributed across two services with a shared queue, shared types, and a shared LLM layer.
- Built a **multi-LLM routing layer** (`packages/smart-llm`) that scores requests by task complexity, latency, and cost and routes across OpenRouter (primary) with OpenAI / Anthropic / Moonshot as direct fallbacks. Supports streaming, tool calling, JSON mode, and prompt caching. Consumed as a shared package by both the web app and the worker service.
- Built an **agentic chat** that reads and writes the user's Google Calendar and executes project actions via tool use. Exposed a clean integration surface so external agents (Claude Code, MCP-style harnesses) can drive BuildOS on a user's behalf.
- Designed a **Redis-free distributed job queue on Supabase Postgres** using `FOR UPDATE SKIP LOCKED` for atomic job claims and dedicated RPCs (`add_queue_job`, `claim_pending_jobs`, `complete_queue_job`, `fail_queue_job`). Powers ~14 job types including daily-brief generation, agentic brain-dump processing, voice transcription, OCR, ontology classification, project context-snapshot building, and SMS workflows.
- Invested heavily in **agent harness design and context engineering** — picking the right tools, schemas, and context so LLM tool calls behave reliably in production. Built an **LLM evaluation harness** including a real-API prompt test suite (`pnpm test:llm`) for validating prompt and model changes against live providers.
- Published long-form writing on the BuildOS blog about agent engineering vs. context engineering, framing the internal patterns I rely on for reliable LLM-powered systems.
- Implemented per-request server-timing instrumentation, billing/consumption guards, and feature-flagged rollout patterns (e.g. `shadow → inject` modes for behavioral profiles) to support safe iteration on AI features in production.

### Curri (YC S19) — Software Engineer · Jan 2022 – Feb 2025

_B2B same-day construction-materials delivery platform. React + TypeScript codebase with three web frontends, a React Native driver app, and a Node worker service running the driver-search algorithm and async delivery jobs._

- **Built and owned Curri's third-party delivery integration platform** — the internal layer that connected seven delivery service providers (**Lyft, Uber, DoorDash, Dispatch, Pronto, Material Drop, Superior**) into Curri's driver-search algorithm so deliveries could dynamically fail over to an external network when no in-network driver was available. Used by every dispatch path in the system; routed an estimated 100–200+ deliveries per day per partner at scale.
    - **Reverse-engineered every partner's delivery API** — public docs were typically incomplete or missing; pieced together the contracts by hand.
    - Designed a hybrid **webhook + polling reconciliation pattern** to maintain ground-truth delivery state across partners with inconsistent or partial event coverage — a recurring problem in distributed integrations with unreliable upstream signals.
    - Built **OAuth and credential-exchange flows** and partner-specific API contracts; pre-fetched pricing quotes so any open delivery could be dispatched on demand.
- **Rebuilt Curri's service-ops console into a real-time, event-driven triage system.** Designed the upstream signal model and coordinated cross-system changes across the worker service and the integration layer to emit the events the console consumed (driver-search timeout, assigned-driver cancellation, driver stalled at pickup, ETA overrun). Each event surfaced inline with its resolving action.

### C4 Planning Solutions — Software Engineer · Mar 2021 – Dec 2021

_**Department of Defense client** — Military Justice Case Management System used by military lawyers to look up case and trial information across the DoD military justice system._

- Performed substantial **data migrations of legacy case data** into the production system; built reusable migration tooling to format and load incoming data.
- Bug fixes and new feature work in an Agile environment. Stack: Vue, jQuery, SharePoint.

### Webworld Technologies — Software Engineer · Aug 2019 – Mar 2021

_**Dewey Knowledge Portal** — proof-of-concept knowledge platform for **US Air Force intelligence analysts**. Ingested intel reports and exposed them through a graph data model so analysts could traverse connections across people, places, events, and source documents._

- Designed and built the **nested AND/OR query-builder UI** that compiled visual queries to **SPARQL** and ran them against the underlying knowledge graph — letting analysts express complex connection-driven searches without writing graph queries by hand. Direct exposure to the kind of analyst-facing tooling that intel and defense teams rely on.
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
