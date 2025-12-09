<!-- thoughts/shared/ideas/ontology/endpoint-stubs.md -->
TypeScript endpoint stubs (SvelteKit server routes)
Types: src/lib/types/onto.ts
typescriptexport type ProjectSpec = {
project: {
name: string;
description?: string;
type_key: string;
also_types?: string[];
state_key?: string;
props?: {
facets?: {
context?: string;
scale?: string;
stage?: string;
};
[key: string]: any;
};
start_at?: string;
end_at?: string;
};
goals?: Array<{ name: string; type_key?: string; props?: any }>;
requirements?: Array<{ text: string; type_key?: string; props?: any }>;
plans?: Array<{
name: string;
type_key: string;
state_key?: string;
props?: { facets?: Record<string, string>; [key: string]: any };
}>;
tasks?: Array<{
title: string;
plan_name?: string;
state_key?: string;
priority?: number;
due_at?: string;
props?: { facets?: { scale?: string }; [key: string]: any };
}>;
deliverables?: Array<{
name: string;
type_key: string; // Changed from 'kind' to match schema
state_key?: string;
props?: { facets?: { stage?: string }; [key: string]: any };
}>;
documents?: Array<{
title: string;
type_key: string; // Changed from 'kind' to match schema
props?: any;
}>;
sources?: Array<{ uri: string; snapshot_uri?: string; props?: any }>;
metrics?: Array<{ name: string; unit: string; type_key?: string; definition?: string; props?: any }>;
milestones?: Array<{ title: string; due_at: string; type_key?: string; props?: any }>;
risks?: Array<{ title: string; type_key?: string; probability?: number; impact?: string; props?: any }>;
decisions?: Array<{ title: string; decision_at: string; rationale?: string; props?: any }>;
edges?: Array<{ src_kind: string; src_id: string; rel: string; dst_kind: string; dst_id: string; props?: any }>;
clarifications?: Array<{
key: string;
question: string;
required: boolean;
choices?: string[];
help_text?: string;
}>;
meta?: {
model?: string;
template_keys?: string[];
confidence?: number;
suggested_facets?: { context?: string; scale?: string; stage?: string };
};
};

export type FSMTransitionRequest = {
object_kind: "task" | "deliverable" | "plan" | "project" | "document";
object_id: string;
event: string;
};

export type TemplateMetadata = {
realm?: string; // creative, technical, business, service, etc.
output_type?: string; // software, content, service, knowledge, etc.
typical_scale?: string; // hint for AI
keywords?: string[]; // for matching
description?: string;
};

export type FacetDefaults = {
context?: string;
scale?: string;
stage?: string;
};

Spec drafting: src/routes/onto/specs/draft/+server.ts
typescriptimport type { RequestHandler } from "./$types";
import { json, error } from "@sveltejs/kit";
import type { ProjectSpec, TemplateMetadata, FacetDefaults } from "$lib/types/onto";
import { sbAdmin } from "$lib/server/db";

export const POST: RequestHandler = async ({ request, locals }) => {
const { brain_dump, org_id } = await request.json();
if (!brain_dump) throw error(400, "Missing brain_dump");

const sb = sbAdmin();

// 1) Load template catalog with metadata and facet_defaults
const { data: templates, error: tplErr } = await sb
.from("onto.templates")
.select("scope, type_key, name, fsm, default_props, schema, metadata, facet_defaults")
.eq("status", "active");

if (tplErr) throw error(500, tplErr.message);

// 2) Load facet taxonomy (3 facets only)
const { data: facets } = await sb
.from("onto.facet_definitions")
.select("key, allowed_values");

const facetTaxonomy = facets?.reduce((acc, f) => {
acc[f.key] = JSON.parse(f.allowed_values);
return acc;
}, {} as Record<string, string[]>) ?? {};

// 3) Prepare catalog snapshot for LLM
const catalogSnapshot = templates?.map(t => ({
type_key: t.type_key,
name: t.name,
scope: t.scope,
metadata: t.metadata as TemplateMetadata,
facet_defaults: t.facet_defaults as FacetDefaults,
})) ?? [];

// 4) Call LLM with type_key selection + facet suggestion
// TODO: Replace with actual LLM call
// const result = await proposeProjectSpec({
// brain_dump,
// catalog: catalogSnapshot,
// facet_taxonomy: facetTaxonomy,
// org_prefs: locals.user?.org_prefs ?? {}
// });

// Example response (replace with LLM output)
const project_spec: ProjectSpec = {
project: {
name: "Coaching: Stacy",
description: "12-week fat loss program with 45-minute sessions at Planet Fitness",
type_key: "coach.client",
also_types: [], // Multi-role support
props: {
facets: {
context: "client", // AI inferred from "coaching client"
scale: "medium", // AI inferred from "12 weeks"
stage: "planning", // Default for new projects
},
client_name: "Stacy",
time_horizon_weeks: 12,
session_frequency: "3x/week",
},
},
plans: [
{
name: "4-week Program Cycle",
type_key: "plan.coaching_4w",
state_key: "draft",
props: {
facets: { scale: "small", stage: "planning" },
checkin_day: "Friday",
},
},
],
deliverables: [
{
name: "Workout Plan — Cycle 1",
type_key: "deliverable.workout_plan",
state_key: "draft",
props: {
facets: { stage: "planning" },
weeks: 4,
},
},
],
documents: [
{
title: "Intake Notes: Stacy",
type_key: "doc.intake",
props: {},
},
],
clarifications: [
{
key: "equipment",
question: "What equipment does Stacy have access to at Planet Fitness?",
required: true,
help_text: "This helps customize the workout plan to available equipment",
},
{
key: "injuries",
question: "Does Stacy have any injuries or limitations?",
required: false,
},
],
meta: {
template_keys: ["coach.client", "plan.coaching_4w", "deliverable.workout_plan"],
confidence: 0.92,
suggested_facets: {
context: "client",
scale: "medium",
stage: "planning",
},
},
};

// 5) Validate project_spec
// TODO: Validate against ProjectSpec schema
// TODO: Validate type_key format
// TODO: Validate facet values against taxonomy

return json({
project_spec,
clarifications: project_spec.clarifications ?? [],
catalog: catalogSnapshot, // Return for UI display
});
};

Spec patch: src/routes/onto/specs/patch/+server.ts
typescriptimport type { RequestHandler } from "./$types";
import { json, error } from "@sveltejs/kit";
import type { ProjectSpec } from "$lib/types/onto";
import { sbAdmin } from "$lib/server/db";

export const POST: RequestHandler = async ({ request }) => {
const { project_spec, answers } = (await request.json()) as {
project_spec: ProjectSpec;
answers: Record<string, any>;
};

const sb = sbAdmin();

// 1) Apply answers to the spec
for (const [key, value] of Object.entries(answers)) {
const clarification = project_spec.clarifications?.find((c) => c.key === key);
if (!clarification) continue;

    // Apply to relevant entities based on key
    if (key === "equipment" && project_spec.deliverables) {
      const workoutPlan = project_spec.deliverables.find(
        (d) => d.type_key === "deliverable.workout_plan"
      );
      if (workoutPlan) {
        workoutPlan.props = { ...workoutPlan.props, equipment: value };
      }
    } else if (key === "injuries" && project_spec.project.props) {
      project_spec.project.props.injuries = value;
    }
    // Add more mapping logic as needed

}

// 2) Filter out answered clarifications
const answeredKeys = Object.keys(answers);
project_spec.clarifications = project_spec.clarifications?.filter(
(c) => !answeredKeys.includes(c.key)
);

// 3) Validate facet values if they were modified
if (project_spec.project.props?.facets) {
const { data: facetDefs } = await sb
.from("onto.facet_definitions")
.select("key, allowed_values");

    for (const [facetKey, facetValue] of Object.entries(
      project_spec.project.props.facets
    )) {
      const def = facetDefs?.find((d) => d.key === facetKey);
      if (def) {
        const allowedValues = JSON.parse(def.allowed_values) as string[];
        if (!allowedValues.includes(facetValue as string)) {
          throw error(400, `Invalid facet value: ${facetKey}=${facetValue}`);
        }
      }
    }

}

// 4) If no clarifications left, mark as ready for instantiation
const ready = !project_spec.clarifications || project_spec.clarifications.length === 0;

return json({ project_spec, ready });
};

Instantiate: src/routes/onto/projects/instantiate/+server.ts
typescriptimport type { RequestHandler } from "./$types";
import { json, error } from "@sveltejs/kit";
import type { ProjectSpec } from "$lib/types/onto";
import { sbAdmin } from "$lib/server/db";

export const POST: RequestHandler = async ({ request, locals }) => {
const { project_spec } = (await request.json()) as { project_spec: ProjectSpec };
const sb = sbAdmin();

// 1) Validate type*key format
const typeKeyRegex = /^[a-z*]+\.[a-z_]+(\.[a-z_]+)?$/;
if (!typeKeyRegex.test(project_spec.project.type_key)) {
throw error(400, `Invalid type_key format: ${project_spec.project.type_key}`);
}

// 2) Validate also_types if present
if (project_spec.project.also_types) {
for (const tk of project_spec.project.also_types) {
if (!typeKeyRegex.test(tk)) {
throw error(400, `Invalid also_types format: ${tk}`);
}
}
}

// 3) Validate facets against taxonomy
if (project_spec.project.props?.facets) {
const { data: facetValues } = await sb
.from("onto.facet_values")
.select("facet_key, value");

    const validValues = facetValues?.reduce((acc, fv) => {
      if (!acc[fv.facet_key]) acc[fv.facet_key] = [];
      acc[fv.facet_key].push(fv.value);
      return acc;
    }, {} as Record<string, string[]>) ?? {};

    for (const [key, value] of Object.entries(project_spec.project.props.facets)) {
      if (value && validValues[key] && !validValues[key].includes(value)) {
        throw error(400, `Invalid facet value: ${key}=${value}`);
      }
    }

}

// 4) TODO: Validate props against template schema

const me = locals.user?.actor_id ?? (await ensureActor(sb, locals.user?.email));

// 5) Insert project
const { data: projIns, error: projErr } = await sb
.from("onto.projects")
.insert({
org_id: locals.user?.org_id ?? null,
name: project_spec.project.name,
description: project_spec.project.description ?? null,
type_key: project_spec.project.type_key,
also_types: project_spec.project.also_types ?? [],
state_key: project_spec.project.state_key ?? "draft",
props: project_spec.project.props ?? {},
start_at: project_spec.project.start_at ?? null,
end_at: project_spec.project.end_at ?? null,
created_by: me,
})
.select("id")
.single();

if (projErr) throw error(500, projErr.message);
const project_id = projIns.id as string;

// 6) Insert goals
if (project_spec.goals?.length) {
const goalsInserts = project_spec.goals.map((g) => ({
project_id,
name: g.name,
type_key: g.type_key ?? null,
props: g.props ?? {},
created_by: me,
}));
const { error: e } = await sb.from("onto.goals").insert(goalsInserts);
if (e) throw error(500, `Goals insert failed: ${e.message}`);
}

// 7) Insert requirements
if (project_spec.requirements?.length) {
const reqInserts = project_spec.requirements.map((r) => ({
project_id,
text: r.text,
type_key: r.type_key ?? "requirement.general",
props: r.props ?? {},
created_by: me,
}));
const { error: e } = await sb.from("onto.requirements").insert(reqInserts);
if (e) throw error(500, `Requirements insert failed: ${e.message}`);
}

// 8) Insert documents (to get IDs for context_document_id)
const docIdByTitle = new Map<string, string>();
if (project_spec.documents?.length) {
for (const doc of project_spec.documents) {
const { data, error: e } = await sb
.from("onto.documents")
.insert({
project_id,
title: doc.title,
type_key: doc.type_key,
props: doc.props ?? {},
created_by: me,
})
.select("id")
.single();
if (e) throw error(500, `Document insert failed: ${e.message}`);
docIdByTitle.set(doc.title, data!.id);
}

    // If first document is "Intake" or "Brief", set as context_document_id
    const firstDoc = project_spec.documents[0];
    if (
      firstDoc.type_key === "doc.intake" ||
      firstDoc.type_key === "doc.brief"
    ) {
      const contextDocId = docIdByTitle.get(firstDoc.title);
      if (contextDocId) {
        await sb
          .from("onto.projects")
          .update({ context_document_id: contextDocId })
          .eq("id", project_id);
      }
    }

}

// 9) Insert plans
const planIdByName = new Map<string, string>();
if (project_spec.plans?.length) {
for (const plan of project_spec.plans) {
const { data, error: e } = await sb
.from("onto.plans")
.insert({
project_id,
name: plan.name,
type_key: plan.type_key,
state_key: plan.state_key ?? "draft",
props: plan.props ?? {},
created_by: me,
})
.select("id")
.single();
if (e) throw error(500, `Plan insert failed: ${e.message}`);
planIdByName.set(plan.name, data!.id);
}
}

// 10) Insert tasks
if (project_spec.tasks?.length) {
for (const t of project_spec.tasks) {
const plan_id = t.plan_name ? planIdByName.get(t.plan_name) : null;
const { error: e } = await sb.from("onto.tasks").insert({
project_id,
plan_id: plan_id ?? null,
title: t.title,
state_key: t.state_key ?? "todo",
priority: t.priority ?? 3,
due_at: t.due_at ?? null,
props: t.props ?? {},
created_by: me,
});
if (e) throw error(500, `Task insert failed: ${e.message}`);
}
}

// 11) Insert deliverables
if (project_spec.deliverables?.length) {
for (const d of project_spec.deliverables) {
const { error: e } = await sb.from("onto.deliverables").insert({
project_id,
name: d.name,
type_key: d.type_key,
state_key: d.state_key ?? "draft",
props: d.props ?? {},
created_by: me,
});
if (e) throw error(500, `Deliverable insert failed: ${e.message}`);
}
}

// 12) Insert sources
if (project_spec.sources?.length) {
const sourceInserts = project_spec.sources.map((s) => ({
project_id,
uri: s.uri,
snapshot_uri: s.snapshot_uri ?? null,
props: s.props ?? {},
created_by: me,
}));
const { error: e } = await sb.from("onto.sources").insert(sourceInserts);
if (e) throw error(500, `Sources insert failed: ${e.message}`);
}

// 13) Insert milestones
if (project_spec.milestones?.length) {
const milestoneInserts = project_spec.milestones.map((m) => ({
project_id,
title: m.title,
type_key: m.type_key ?? null,
due_at: m.due_at,
props: m.props ?? {},
created_by: me,
}));
const { error: e } = await sb.from("onto.milestones").insert(milestoneInserts);
if (e) throw error(500, `Milestones insert failed: ${e.message}`);
}

// 14) Insert risks
if (project_spec.risks?.length) {
const riskInserts = project_spec.risks.map((r) => ({
project_id,
title: r.title,
type_key: r.type_key ?? null,
probability: r.probability ?? null,
impact: r.impact ?? "medium",
state_key: "open",
props: r.props ?? {},
created_by: me,
}));
const { error: e } = await sb.from("onto.risks").insert(riskInserts);
if (e) throw error(500, `Risks insert failed: ${e.message}`);
}

// 15) Insert decisions
if (project_spec.decisions?.length) {
const decisionInserts = project_spec.decisions.map((d) => ({
project_id,
title: d.title,
decision_at: d.decision_at,
rationale: d.rationale ?? null,
props: d.props ?? {},
created_by: me,
}));
const { error: e } = await sb.from("onto.decisions").insert(decisionInserts);
if (e) throw error(500, `Decisions insert failed: ${e.message}`);
}

// 16) Insert metrics
if (project_spec.metrics?.length) {
const metricInserts = project_spec.metrics.map((m) => ({
project_id,
name: m.name,
type_key: m.type_key ?? null,
unit: m.unit,
definition: m.definition ?? null,
props: m.props ?? {},
created_by: me,
}));
const { error: e } = await sb.from("onto.metrics").insert(metricInserts);
if (e) throw error(500, `Metrics insert failed: ${e.message}`);
}

// 17) Insert edges if specified
if (project_spec.edges?.length) {
const { error: e } = await sb.from("onto.edges").insert(project_spec.edges);
if (e) throw error(500, `Edges insert failed: ${e.message}`);
}

return json({ project_id, url: `/projects/${project_id}` });
};

async function ensureActor(
sb: ReturnType<typeof sbAdmin>,
email?: string
): Promise<string | null> {
if (!email) return null;
const { data: row } = await sb
.from("onto.actors")
.select("id")
.eq("email", email)
.limit(1)
.maybeSingle();
if (row?.id) return row.id;
const { data, error } = await sb
.from("onto.actors")
.insert({ kind: "human", name: email, email })
.select("id")
.single();
return data?.id ?? null;
}

Templates list: src/routes/onto/templates/+server.ts
typescriptimport type { RequestHandler } from "./$types";
import { json } from "@sveltejs/kit";
import { sbAdmin } from "$lib/server/db";

export const GET: RequestHandler = async ({ url }) => {
const scope = url.searchParams.get("scope") ?? undefined;
const realm = url.searchParams.get("realm") ?? undefined; // Filter by metadata.realm
const type_key_prefix = url.searchParams.get("type_key_prefix") ?? undefined;

const sb = sbAdmin();
let q = sb
.from("onto.templates")
.select("id, scope, type_key, name, status, metadata, facet_defaults, default_views, parent_template_id, is_abstract");

if (scope) q = q.eq("scope", scope);
if (type_key_prefix) q = q.like("type_key", `${type_key_prefix}%`);

const { data, error } = await q.order("type_key", { ascending: true });
if (error) return new Response(error.message, { status: 500 });

// Filter by realm if specified (client-side filter since metadata is JSONB)
let filtered = data ?? [];
if (realm) {
filtered = filtered.filter((t) => (t.metadata as any)?.realm === realm);
}

// Group by realm for UI
const grouped = filtered.reduce((acc, t) => {
const r = (t.metadata as any)?.realm ?? "other";
if (!acc[r]) acc[r] = [];
acc[r].push(t);
return acc;
}, {} as Record<string, typeof filtered>);

return json({ templates: filtered, grouped });
};

Template propose: src/routes/onto/templates/propose/+server.ts
typescriptimport type { RequestHandler } from "./$types";
import { json, error } from "@sveltejs/kit";
import { sbAdmin } from "$lib/server/db";
import type { TemplateMetadata, FacetDefaults } from "$lib/types/onto";

export const POST: RequestHandler = async ({ request, locals }) => {
const { domain_brief, base_type_key } = await request.json();
if (!domain_brief) throw error(400, "domain_brief required");

const sb = sbAdmin();

// Load catalog for matching
const { data: catalog } = await sb
.from("onto.templates")
.select("scope, type_key, name, fsm, schema, default_props, metadata, facet_defaults, status")
.eq("status", "active");

// TODO: Call LLM with Template Designer prompt
// const result = await proposeTemplate({
// domain_brief,
// base_type_key,
// catalog: catalog ?? [],
// });

// Example template draft (replace with LLM output)
const templateDraft = {
scope: "project",
type_key: "podcast.production", // Follows {domain}.{deliverable} convention
name: "Podcast Production",
status: "draft",
parent_template_id: null, // Or UUID if inheriting
is_abstract: false,
metadata: {
realm: "creative",
output_type: "content",
typical_scale: "medium",
keywords: ["podcast", "audio", "production", "episodes"],
description: "End-to-end podcast production from planning to publishing",
} as TemplateMetadata,
facet_defaults: {
context: "commercial",
scale: "medium",
stage: "planning",
} as FacetDefaults,
schema: {
type: "object",
properties: {
show_title: { type: "string" },
episode_count: { type: "integer" },
frequency: { type: "string", enum: ["weekly", "biweekly", "monthly"] },
},
required: ["show_title"],
},
fsm: {
type_key: "podcast.production",
states: ["planning", "recording", "editing", "published"],
transitions: [
{ from: "planning", to: "recording", event: "start_recording" },
{ from: "recording", to: "editing", event: "finish_recording" },
{ from: "editing", to: "published", event: "publish" },
],
},
default_props: {},
default_views: [
{ view: "pipeline", group_by: "state_key", fields: ["name", "updated_at"] },
],
};

// Validate type*key format
const typeKeyRegex = /^[a-z*]+\.[a-z_]+(\.[a-z_]+)?$/;
if (!typeKeyRegex.test(templateDraft.type_key)) {
throw error(400, `Invalid type_key format: ${templateDraft.type_key}`);
}

// Validate facet_defaults values
const { data: facetValues } = await sb
.from("onto.facet_values")
.select("facet_key, value");

const validValues =
facetValues?.reduce((acc, fv) => {
if (!acc[fv.facet_key]) acc[fv.facet_key] = [];
acc[fv.facet_key].push(fv.value);
return acc;
}, {} as Record<string, string[]>) ?? {};

for (const [key, value] of Object.entries(templateDraft.facet_defaults)) {
if (value && validValues[key] && !validValues[key].includes(value)) {
throw error(400, `Invalid facet default: ${key}=${value}`);
}
}

// TODO: Validate FSMDef structure
// TODO: Validate schema is valid JSON Schema

// Insert as draft
const { data, error: e } = await sb
.from("onto.templates")
.insert({
scope: templateDraft.scope,
type_key: templateDraft.type_key,
name: templateDraft.name,
status: "draft",
parent_template_id: templateDraft.parent_template_id,
is_abstract: templateDraft.is_abstract,
schema: templateDraft.schema,
fsm: templateDraft.fsm,
default_props: templateDraft.default_props,
default_views: templateDraft.default_views,
metadata: templateDraft.metadata,
facet_defaults: templateDraft.facet_defaults,
created_by: locals.user?.actor_id ?? null,
})
.select("id")
.single();

if (e) throw error(500, e.message);

return json({
template_id: data!.id,
template: templateDraft,
clarifications: [], // Could ask for additional template details
});
};

FSM engine: src/lib/server/fsm/engine.ts
typescriptimport { sbAdmin } from "../db";

type Ctx = { actor_id?: string | null };
type TransitionResult =
| { ok: true; state_after: string; actions_run: string[] }
| { ok: false; error: string; guard_failures?: string[] };

export async function runTransition(
req: { object_kind: string; object_id: string; event: string },
ctx: Ctx
): Promise<TransitionResult> {
const sb = sbAdmin();

// 1) Load object row + its type_key/state_key
const table = kindToTable(req.object_kind);
const { data: rows, error } = await sb
.from(table)
.select("id, type_key, state_key, props, project_id")
.eq("id", req.object_id)
.limit(1);

if (error || !rows?.length) return { ok: false, error: "Not found" };
const node = rows[0];

// 2) Load template FSM
const { data: tpl, error: te } = await sb
.from("onto.templates")
.select("fsm")
.eq("type_key", node.type_key)
.limit(1)
.maybeSingle();

if (te || !tpl) return { ok: false, error: "FSM not found" };
const fsm = tpl.fsm as any;

// 3) Find transition
const trans = (fsm.transitions as any[]).find(
(t) => t.from === node.state_key && t.event === req.event
);

if (!trans) {
return {
ok: false,
error: `Transition not allowed: ${node.state_key} --${req.event}--> (no valid transition)`,
};
}

// 4) Evaluate guards
if (trans.guards && trans.guards.length > 0) {
const guardResults = await evaluateGuards(trans.guards, node, ctx);
if (!guardResults.passed) {
return {
ok: false,
error: "Guard check failed",
guard_failures: guardResults.failures,
};
}
}

// 5) Update state
const { error: ue } = await sb
.from(table)
.update({ state_key: trans.to })
.eq("id", node.id);

if (ue) return { ok: false, error: ue.message };

// 6) Execute actions
const actions_run: string[] = [];
if (trans.actions && trans.actions.length > 0) {
try {
const actionResults = await executeActions(trans.actions, node, ctx);
actions_run.push(...actionResults);
} catch (err: any) {
// Log but don't fail the transition (actions are side-effects)
console.error("Action execution error:", err);
}
}

return { ok: true, state_after: trans.to, actions_run };
}

async function evaluateGuards(
guards: any[],
node: any,
ctx: Ctx
): Promise<{ passed: boolean; failures: string[] }> {
const failures: string[] = [];

for (const guard of guards) {
const guardType = guard.type || guard.op;
let passed = false;

    switch (guardType) {
      case "has_property":
        // e.g., { type: "has_property", path: "props.equipment" }
        passed = !!getNestedValue(node, guard.path);
        break;

      case "has_facet":
        // e.g., { type: "has_facet", key: "context", value: "client" }
        passed = node.props?.facets?.[guard.key] === guard.value;
        break;

      case "facet_in":
        // e.g., { type: "facet_in", key: "scale", values: ["large", "epic"] }
        passed =
          guard.values && guard.values.includes(node.props?.facets?.[guard.key]);
        break;

      case "all_facets_set":
        // e.g., { type: "all_facets_set", keys: ["context", "scale", "stage"] }
        passed = guard.keys.every((key: string) => !!node.props?.facets?.[key]);
        break;

      case "type_key_matches":
        // e.g., { type: "type_key_matches", pattern: "writer.*" }
        const regex = new RegExp(guard.pattern.replace("*", ".*"));
        passed = regex.test(node.type_key);
        break;

      default:
        failures.push(`Unknown guard type: ${guardType}`);
        continue;
    }

    if (!passed) {
      failures.push(
        `Guard failed: ${guardType} (${JSON.stringify(guard)})`
      );
    }

}

return { passed: failures.length === 0, failures };
}

async function executeActions(
actions: any[],
node: any,
ctx: Ctx
): Promise<string[]> {
const sb = sbAdmin();
const executed: string[] = [];

for (const action of actions) {
const actionType = action.type || action.op;

    try {
      switch (actionType) {
        case "update_facets": {
          // e.g., { type: "update_facets", facets: { stage: "launch" } }
          const table = kindToTable(getObjectKindFromTable(node));
          const updatedProps = {
            ...node.props,
            facets: { ...node.props?.facets, ...action.facets },
          };
          await sb.from(table).update({ props: updatedProps }).eq("id", node.id);
          executed.push(`update_facets(${JSON.stringify(action.facets)})`);
          break;
        }

        case "spawn_tasks": {
          // e.g., { type: "spawn_tasks", titles: ["Task 1", "Task 2"], props: {} }
          const taskInserts = action.titles.map((title: string) => ({
            project_id: node.project_id,
            plan_id: action.plan_id ?? null,
            title,
            state_key: "todo",
            props: action.props_template ?? {},
            created_by: ctx.actor_id,
          }));
          await sb.from("onto.tasks").insert(taskInserts);
          executed.push(`spawn_tasks(${action.titles.length} tasks)`);
          break;
        }

        case "notify": {
          // e.g., { type: "notify", to_actor_ids: ["..."], message: "..." }
          // TODO: Implement notification system
          executed.push(`notify(${action.to_actor_ids?.length ?? 0} actors)`);
          break;
        }

        case "email_user": {
          // e.g., { type: "email_user", to: "email@example.com", subject: "...", body: "..." }
          // TODO: Implement email connector
          executed.push(`email_user(${action.to})`);
          break;
        }

        default:
          console.warn(`Unknown action type: ${actionType}`);
      }
    } catch (err: any) {
      console.error(`Action ${actionType} failed:`, err);
      // Continue executing other actions
    }

}

return executed;
}

function getNestedValue(obj: any, path: string): any {
return path.split(".").reduce((acc, part) => acc?.[part], obj);
}

function kindToTable(
k: string
):
| "onto.tasks"
| "onto.deliverables"
| "onto.plans"
| "onto.projects"
| "onto.documents" {
switch (k) {
case "task":
return "onto.tasks";
case "deliverable":
return "onto.deliverables";
case "plan":
return "onto.plans";
case "document":
return "onto.documents";
default:
return "onto.projects";
}
}

function getObjectKindFromTable(node: any): string {
// Infer from node structure or pass explicitly
return "project"; // Simplified
}

What’s left to wire (quick checklist)

Hook real JSON Schema validators for ProjectSpec and Template/FSM (zod or ajv).
Implement guard ops and action primitives in the FSM engine (with idempotency keys).
Add RLS policies leveraging your org/membership model.
Connect your LLM calls in specs/draft and templates/propose using the prompts we already wrote.
