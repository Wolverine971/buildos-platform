<!-- apps/web/src/lib/services/agentic-chat/tools/tool-help-spec-2.md -->

Below is a **registry op mapping table** you can drop in as `registry.op-map.json` (or generate at runtime). It includes **everything you pasted** (ontology read + write + utility) and it’s structured so you can easily extend it when you add “other tools / other things.”

I’m also including a **standard extension pattern** for “unknown/other tools” so your agent can ingest more definitions later without changing the gateway protocol.

---

## 1) `registry.op-map.json` (CLI op → underlying tool name)

```json
{
	"version": "buildos-registry-op-map/0.2",
	"generated_from": [
		"apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-read.ts",
		"apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-write.ts",
		"apps/web/src/lib/services/agentic-chat/tools/core/definitions/utility.ts"
	],
	"groups": {
		"onto": {
			"task": {
				"list": "list_onto_tasks",
				"search": "search_onto_tasks",
				"get": "get_onto_task_details",
				"create": "create_onto_task",
				"update": "update_onto_task",
				"delete": "delete_onto_task",
				"docs": {
					"list": "list_task_documents",
					"create_or_attach": "create_task_document"
				}
			},
			"goal": {
				"list": "list_onto_goals",
				"get": "get_onto_goal_details",
				"create": "create_onto_goal",
				"update": "update_onto_goal",
				"delete": "delete_onto_goal"
			},
			"plan": {
				"list": "list_onto_plans",
				"get": "get_onto_plan_details",
				"create": "create_onto_plan",
				"update": "update_onto_plan",
				"delete": "delete_onto_plan"
			},
			"project": {
				"list": "list_onto_projects",
				"search": "search_onto_projects",
				"get": "get_onto_project_details",
				"graph": {
					"get": "get_onto_project_graph",
					"reorganize": "reorganize_onto_project_graph"
				},
				"create": "create_onto_project",
				"update": "update_onto_project"
			},
			"document": {
				"list": "list_onto_documents",
				"search": "search_onto_documents",
				"get": "get_onto_document_details",
				"create": "create_onto_document",
				"update": "update_onto_document",
				"delete": "delete_onto_document",
				"tree": {
					"get": "get_document_tree",
					"move": "move_document_in_tree"
				},
				"path": {
					"get": "get_document_path"
				}
			},
			"milestone": {
				"list": "list_onto_milestones",
				"get": "get_onto_milestone_details",
				"update": "update_onto_milestone"
			},
			"risk": {
				"list": "list_onto_risks",
				"get": "get_onto_risk_details",
				"update": "update_onto_risk"
			},
			"requirement": {
				"list": "list_onto_requirements",
				"get": "get_onto_requirement_details",
				"update": "update_onto_requirement"
			},
			"entity": {
				"relationships": {
					"get": "get_entity_relationships"
				},
				"links": {
					"get": "get_linked_entities"
				}
			},
			"edge": {
				"link": "link_onto_entities",
				"unlink": "unlink_onto_edge"
			},
			"search": {
				"all": "search_ontology"
			}
		},
		"util": {
			"schema": {
				"field_info": "get_field_info"
			},
			"web": {
				"search": "web_search",
				"visit": "web_visit"
			},
			"buildos": {
				"overview": "get_buildos_overview",
				"usage_guide": "get_buildos_usage_guide"
			}
		}
	},

	"flat_op_to_tool": {
		"onto.task.list": "list_onto_tasks",
		"onto.task.search": "search_onto_tasks",
		"onto.task.get": "get_onto_task_details",
		"onto.task.create": "create_onto_task",
		"onto.task.update": "update_onto_task",
		"onto.task.delete": "delete_onto_task",
		"onto.task.docs.list": "list_task_documents",
		"onto.task.docs.create_or_attach": "create_task_document",

		"onto.goal.list": "list_onto_goals",
		"onto.goal.get": "get_onto_goal_details",
		"onto.goal.create": "create_onto_goal",
		"onto.goal.update": "update_onto_goal",
		"onto.goal.delete": "delete_onto_goal",

		"onto.plan.list": "list_onto_plans",
		"onto.plan.get": "get_onto_plan_details",
		"onto.plan.create": "create_onto_plan",
		"onto.plan.update": "update_onto_plan",
		"onto.plan.delete": "delete_onto_plan",

		"onto.project.list": "list_onto_projects",
		"onto.project.search": "search_onto_projects",
		"onto.project.get": "get_onto_project_details",
		"onto.project.graph.get": "get_onto_project_graph",
		"onto.project.graph.reorganize": "reorganize_onto_project_graph",
		"onto.project.create": "create_onto_project",
		"onto.project.update": "update_onto_project",

		"onto.document.list": "list_onto_documents",
		"onto.document.search": "search_onto_documents",
		"onto.document.get": "get_onto_document_details",
		"onto.document.create": "create_onto_document",
		"onto.document.update": "update_onto_document",
		"onto.document.delete": "delete_onto_document",
		"onto.document.tree.get": "get_document_tree",
		"onto.document.tree.move": "move_document_in_tree",
		"onto.document.path.get": "get_document_path",

		"onto.milestone.list": "list_onto_milestones",
		"onto.milestone.get": "get_onto_milestone_details",
		"onto.milestone.update": "update_onto_milestone",

		"onto.risk.list": "list_onto_risks",
		"onto.risk.get": "get_onto_risk_details",
		"onto.risk.update": "update_onto_risk",

		"onto.requirement.list": "list_onto_requirements",
		"onto.requirement.get": "get_onto_requirement_details",
		"onto.requirement.update": "update_onto_requirement",

		"onto.entity.relationships.get": "get_entity_relationships",
		"onto.entity.links.get": "get_linked_entities",

		"onto.edge.link": "link_onto_entities",
		"onto.edge.unlink": "unlink_onto_edge",

		"onto.search": "search_ontology",

		"util.schema.field_info": "get_field_info",
		"util.web.search": "web_search",
		"util.web.visit": "web_visit",
		"util.buildos.overview": "get_buildos_overview",
		"util.buildos.usage_guide": "get_buildos_usage_guide"
	}
}
```

### Notes on a couple naming decisions

- I used `onto.search` (instead of `onto.search.all`) as the canonical op for `search_ontology` because it’s the “global fuzzy search across entities.” If you prefer `onto.search.all`, keep it; just be consistent.
- I used `onto.task.docs.create_or_attach` to match your `create_task_document` “create OR attach” semantics.

---

## 2) “Other tools exist” — extension pattern (so you don’t have to redesign later)

Since you’ve got more tools beyond what you pasted, the registry should support **multiple sources** and **multiple naming conventions** without breaking the gateway. Here’s the pattern to follow:

### 2.1 Add “toolsets” + “namespacing rules”

Add a top-level section like:

```json
{
	"toolsets": [
		{
			"id": "onto",
			"source": "ontology-read.ts, ontology-write.ts",
			"namespace_prefix": "onto"
		},
		{
			"id": "util",
			"source": "utility.ts",
			"namespace_prefix": "util"
		},
		{
			"id": "other",
			"source": "TBD",
			"namespace_prefix": "x"
		}
	],
	"naming_rules": {
		"default": "derive from function.name by prefixes (list_|search_|get_|create_|update_|delete_)",
		"exceptions": {
			"search_ontology": "onto.search",
			"get_document_tree": "onto.document.tree.get",
			"move_document_in_tree": "onto.document.tree.move",
			"get_document_path": "onto.document.path.get"
		}
	}
}
```

### 2.2 Add “unknown tool ingestion”

Your registry generator should do this automatically for new tools:

- If tool name matches `^(list|search|get|create|update|delete)_(onto_)?(.+)$`, derive:
    - entity slug from the remainder
    - action from the prefix

- If it doesn’t match, place it under:
    - `x.misc.<tool_name>` (or `x.<category>.<tool_name>` if your tool definition includes tags)

Example fallback:

- `send_email` → `x.misc.send_email`
- `calendar_find_availability` → `x.calendar.find_availability`

This way **new tools become discoverable immediately** via `tool.help("x")` without you hand-curating mappings every time.

---

## 3) Small “to-do” flags you may want to encode in registry metadata (recommended)

Even in the op map, you can add lightweight metadata (optional but super helpful for the help system):

- `kind: read|write`
- `impact: low|medium|high` (e.g., deletes, reorganize graph = high)
- `default_dry_run: true` for `onto.project.graph.reorganize`
- `notes/policy_ref` for large policy tools (create task/project)
