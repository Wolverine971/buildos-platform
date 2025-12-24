<!-- apps/web/docs/prompts/agent/executor/task-result-summary.md -->

# Prompt Audit: agent-executor-result

**Generated at:** 2025-12-23T06:28:54.543Z
**Environment:** Development

## Metadata

```json
{
	"executorId": "d18899a5-2177-43f0-94e2-f888aff7d340",
	"planId": "b2df4112-9739-4464-8c3d-e40f7bfb833c",
	"sessionId": "55e5fd65-525f-4b81-8910-568172cee5b0",
	"taskId": "b2df4112-9739-4464-8c3d-e40f7bfb833c-step-2-515681b0-c0e5-4e72-ac89-caca8d0c5ee6",
	"toolCalls": 0,
	"tokensUsed": 5487,
	"timestamp": "2025-12-23T06:28:54.543Z"
}
```

## System Prompt

```
Executor Result Summary
Executor ID: d18899a5-2177-43f0-94e2-f888aff7d340
Plan ID: b2df4112-9739-4464-8c3d-e40f7bfb833c
Session ID: 55e5fd65-525f-4b81-8910-568172cee5b0
```

## User Prompt

````
{
  "task": {
    "id": "b2df4112-9739-4464-8c3d-e40f7bfb833c-step-2-515681b0-c0e5-4e72-ac89-caca8d0c5ee6",
    "description": "Analyze retrieved project details to categorize entities (tasks, goals, plans, documents) for migration.",
    "goal": "Complete plan step 2 for strategy planner_stream",
    "constraints": [
      "Incorporate outputs from plan steps 1",
      "Use reasoning and summarization without additional tools",
      "Return structured JSON data that can be used by subsequent plan steps"
    ],
    "contextData": {
      "1": {
        "project": {
          "id": "2339d78f-f925-4bb3-b6a6-c2027ceeca87",
          "org_id": null,
          "name": "BuildOS Unified",
          "description": "Consolidated project for all BuildOS-related initiatives including development, marketing, and outreach",
          "type_key": "project.technical.os.unified",
          "state_key": "planning",
          "props": {
            "facets": {
              "scale": "epic",
              "stage": "planning",
              "context": "startup"
            },
            "migration_source_project_ids": [
              "c4b58fa3-6dd2-486c-a658-fd2921e3876b",
              "f7824d94-0de0-460c-80dd-67bf11f6445a",
              "0a7d9b5e-18c4-4990-a416-c2bdcb0cc026",
              "660161ee-3ef8-476d-9885-b4af63ce544b",
              "986549c8-6944-43ee-b0d6-9751683c058d"
            ]
          },
          "facet_context": "startup",
          "facet_scale": "epic",
          "facet_stage": "planning",
          "start_at": null,
          "end_at": null,
          "created_by": "85eba71b-56c9-4561-9dae-3828cf9922c4",
          "created_at": "2025-12-23T06:27:24.205408+00:00",
          "updated_at": "2025-12-23T06:27:24.205408+00:00",
          "next_step_short": null,
          "next_step_long": null,
          "next_step_updated_at": null,
          "next_step_source": null,
          "is_public": false,
          "deleted_at": null
        },
        "goals": [
          {
            "id": "1ea48d6c-8a3c-4946-9145-fb3a36bd7c5d",
            "project_id": "2339d78f-f925-4bb3-b6a6-c2027ceeca87",
            "name": "Complete migration of all BuildOS projects into unified structure",
            "type_key": "goal.outcome.project",
            "props": {},
            "created_by": "85eba71b-56c9-4561-9dae-3828cf9922c4",
            "created_at": "2025-12-23T06:27:24.539898+00:00",
            "state_key": "draft",
            "goal": null,
            "description": null,
            "updated_at": "2025-12-23T06:27:24.539898+00:00",
            "completed_at": null,
            "target_date": null,
            "deleted_at": null,
            "search_vector": "'buildo':5A 'complet':1A 'migrat':2A 'project':6A 'structur':9A 'unifi':8A"
          },
          {
            "id": "4ce9d48a-f961-430f-8952-d5d78a93b553",
            "project_id": "2339d78f-f925-4bb3-b6a6-c2027ceeca87",
            "name": "Maintain data integrity during migration",
            "type_key": "goal.metric.integrity",
            "props": {},
            "created_by": "85eba71b-56c9-4561-9dae-3828cf9922c4",
            "created_at": "2025-12-23T06:27:24.539898+00:00",
            "state_key": "draft",
            "goal": null,
            "description": null,
            "updated_at": "2025-12-23T06:27:24.539898+00:00",
            "completed_at": null,
            "target_date": null,
            "deleted_at": null,
            "search_vector": "'data':2A 'integr':3A 'maintain':1A 'migrat':5A"
          }
        ],
        "requirements": [],
        "plans": [
          {
            "id": "a39f1722-3e09-487c-a675-740bb0396fb4",
            "project_id": "2339d78f-f925-4bb3-b6a6-c2027ceeca87",
            "name": "Migration Execution Plan",
            "type_key": "plan.process.migration",
            "state_key": "draft",
            "props": {},
            "facet_context": null,
            "facet_scale": null,
            "facet_stage": null,
            "created_by": "85eba71b-56c9-4561-9dae-3828cf9922c4",
            "created_at": "2025-12-23T06:27:24.820986+00:00",
            "updated_at": "2025-12-23T06:27:24.820986+00:00",
            "plan": null,
            "description": null,
            "deleted_at": null,
            "search_vector": "'execut':2A 'migrat':1A 'plan':3A"
          },
          {
            "id": "7801f8d2-7eb3-4964-aafa-790f57573bfb",
            "project_id": "2339d78f-f925-4bb3-b6a6-c2027ceeca87",
            "name": "Data Verification Phase",
            "type_key": "plan.phase.verification",
            "state_key": "draft",
            "props": {},
            "facet_context": null,
            "facet_scale": null,
            "facet_stage": null,
            "created_by": "85eba71b-56c9-4561-9dae-3828cf9922c4",
            "created_at": "2025-12-23T06:27:24.983884+00:00",
            "updated_at": "2025-12-23T06:27:24.983884+00:00",
            "plan": null,
            "description": null,
            "deleted_at": null,
            "search_vector": "'data':1A 'phase':3A 'verif':2A"
          }
        ],
        "tasks": [
          {
            "id": "cf807570-1e38-4ef3-8014-87f31872d4fe",
            "project_id": "2339d78f-f925-4bb3-b6a6-c2027ceeca87",
            "title": "Audit all source projects for migration content",
            "state_key": "todo",
            "priority": 1,
            "due_at": null,
            "props": {},
            "facet_scale": null,
            "created_by": "85eba71b-56c9-4561-9dae-3828cf9922c4",
            "created_at": "2025-12-23T06:27:25.122886+00:00",
            "updated_at": "2025-12-23T06:27:25.122886+00:00",
            "type_key": "task.execute",
            "start_at": null,
            "completed_at": null,
            "deleted_at": null,
            "description": null,
            "search_vector": "'audit':1A 'content':7A 'migrat':6A 'project':4A 'sourc':3A",
            "plan_id": "a39f1722-3e09-487c-a675-740bb0396fb4",
            "plan": {
              "id": "a39f1722-3e09-487c-a675-740bb0396fb4",
              "project_id": "2339d78f-f925-4bb3-b6a6-c2027ceeca87",
              "name": "Migration Execution Plan",
              "type_key": "plan.process.migration",
              "state_key": "draft",
              "props": {},
              "facet_context": null,
              "facet_scale": null,
              "facet_stage": null,
              "created_by": "85eba71b-56c9-4561-9dae-3828cf9922c4",
              "created_at": "2025-12-23T06:27:24.820986+00:00",
              "updated_at": "2025-12-23T06:27:24.820986+00:00",
              "plan": null,
              "description": null,
              "deleted_at": null,
              "search_vector": "'execut':2A 'migrat':1A 'plan':3A"
            }
          },
          {
            "id": "9969fa1a-0c56-401a-8dc1-aed688a6d832",
            "project_id": "2339d78f-f925-4bb3-b6a6-c2027ceeca87",
            "title": "Create mapping structure for entity relationships",
            "state_key": "todo",
            "priority": 2,
            "due_at": null,
            "props": {},
            "facet_scale": null,
            "created_by": "85eba71b-56c9-4561-9dae-3828cf9922c4",
            "created_at": "2025-12-23T06:27:25.311018+00:00",
            "updated_at": "2025-12-23T06:27:25.311018+00:00",
            "type_key": "task.execute",
            "start_at": null,
            "completed_at": null,
            "deleted_at": null,
            "description": null,
            "search_vector": "'creat':1A 'entiti':5A 'map':2A 'relationship':6A 'structur':3A",
            "plan_id": "a39f1722-3e09-487c-a675-740bb0396fb4",
            "plan": {
              "id": "a39f1722-3e09-487c-a675-740bb0396fb4",
              "project_id": "2339d78f-f925-4bb3-b6a6-c2027ceeca87",
              "name": "Migration Execution Plan",
              "type_key": "plan.process.migration",
              "state_key": "draft",
              "props": {},
              "facet_context": null,
              "facet_scale": null,
              "facet_stage": null,
              "created_by": "85eba71b-56c9-4561-9dae-3828cf9922c4",
              "created_at": "2025-12-23T06:27:24.820986+00:00",
              "updated_at": "2025-12-23T06:27:24.820986+00:00",
              "plan": null,
              "description": null,
              "deleted_at": null,
              "search_vector": "'execut':2A 'migrat':1A 'plan':3A"
            }
          },
          {
            "id": "2d291887-303f-497d-8939-504e043f37d7",
            "project_id": "2339d78f-f925-4bb3-b6a6-c2027ceeca87",
            "title": "Verify all migrated data matches source",
            "state_key": "todo",
            "priority": 1,
            "due_at": null,
            "props": {},
            "facet_scale": null,
            "created_by": "85eba71b-56c9-4561-9dae-3828cf9922c4",
            "created_at": "2025-12-23T06:27:25.444121+00:00",
            "updated_at": "2025-12-23T06:27:25.444121+00:00",
            "type_key": "task.execute",
            "start_at": null,
            "completed_at": null,
            "deleted_at": null,
            "description": null,
            "search_vector": "'data':4A 'match':5A 'migrat':3A 'sourc':6A 'verifi':1A",
            "plan_id": "7801f8d2-7eb3-4964-aafa-790f57573bfb",
            "plan": {
              "id": "7801f8d2-7eb3-4964-aafa-790f57573bfb",
              "project_id": "2339d78f-f925-4bb3-b6a6-c2027ceeca87",
              "name": "Data Verification Phase",
              "type_key": "plan.phase.verification",
              "state_key": "draft",
              "props": {},
              "facet_context": null,
              "facet_scale": null,
              "facet_stage": null,
              "created_by": "85eba71b-56c9-4561-9dae-3828cf9922c4",
              "created_at": "2025-12-23T06:27:24.983884+00:00",
              "updated_at": "2025-12-23T06:27:24.983884+00:00",
              "plan": null,
              "description": null,
              "deleted_at": null,
              "search_vector": "'data':1A 'phase':3A 'verif':2A"
            }
          }
        ],
        "outputs": [],
        "documents": [
          {
            "id": "e179afb4-6ae9-4047-85c1-a2ccba1c2779",
            "project_id": "2339d78f-f925-4bb3-b6a6-c2027ceeca87",
            "title": "BuildOS Unified Context Document",
            "type_key": "document.context.project",
            "props": {
              "source": "agent_project_creation",
              "generated_at": "2025-12-23T06:27:23.122Z",
              "body_markdown": "# BuildOS Unified Context Document\n\n## Vision & Summary\n\nConsolidated project for all BuildOS-related initiatives including development, marketing, and outreach\n\n## Braindump / Spark\n\nNot provided yet.\n\n## Initial Goals\n\n- Complete migration of all BuildOS projects into unified structure\n- Maintain data integrity during migration\n\n## Initial Tasks / Threads\n\n- Audit all source projects for migration content (Plan: Migration Execution Plan)\n- Create mapping structure for entity relationships (Plan: Migration Execution Plan)\n- Verify all migrated data matches source (Plan: Data Verification Phase)"
            },
            "created_by": "85eba71b-56c9-4561-9dae-3828cf9922c4",
            "created_at": "2025-12-23T06:27:24.353125+00:00",
            "state_key": "draft",
            "updated_at": "2025-12-23T06:27:24.353125+00:00",
            "content": "# BuildOS Unified Context Document\n\n## Vision & Summary\n\nConsolidated project for all BuildOS-related initiatives including development, marketing, and outreach\n\n## Braindump / Spark\n\nNot provided yet.\n\n## Initial Goals\n\n- Complete migration of all BuildOS projects into unified structure\n- Maintain data integrity during migration\n\n## Initial Tasks / Threads\n\n- Audit all source projects for migration content (Plan: Migration Execution Plan)\n- Create mapping structure for entity relationships (Plan: Migration Execution Plan)\n- Verify all migrated data matches source (Plan: Data Verification Phase)",
            "description": null,
            "deleted_at": null,
            "search_vector": "'-12':86 '-23':87 '2025':85 '23.122':90 '27':89 'agent':80 'audit':48C,152 'bodi':92 'braindump':24C,118 'buildo':1A,5C,16C,35C,94,108,134 'buildos-rel':15C,107 'complet':31C,130 'consolid':11C 'content':54C,158 'context':3A,7C,96 'creat':59C,164 'creation':82 'data':41C,72C,76C,141,178,182 'develop':20C,112 'document':4A,8C,97 'entiti':63C,168 'execut':57C,67C,161,172 'generat':83 'goal':30C,127 'includ':19C,111 'initi':18C,29C,45C,110,126,147 'integr':42C,142 'maintain':40C,140 'map':60C,165 'markdown':93 'market':21C,113 'match':73C,179 'migrat':32C,44C,53C,56C,66C,71C,131,144,157,160,171,177 'n':98,99,102,116,117,120,124,125,128,129,139,145,146,150,151,163,174 'nconsolid':103 'nnot':121 'outreach':23C,115 'phase':78C,184 'plan':55C,58C,65C,68C,75C,159,162,170,173,181 'project':12C,36C,51C,81,104,135,155 'provid':27C,122 'relat':17C,109 'relationship':64C,169 'sourc':50C,74C,79,154,180 'spark':25C,119 'structur':39C,61C,138,166 'summari':10C,101 't06':88 'task':46C,148 'thread':47C,149 'unifi':2A,6C,38C,95,137 'verif':77C,183 'verifi':69C,175 'vision':9C,100 'yet':28C,123 'z':91"
          },
          {
            "id": "130a760f-1d82-4fdb-9992-b2b5b93878b1",
            "project_id": "2339d78f-f925-4bb3-b6a6-c2027ceeca87",
            "title": "Migration Protocol",
            "type_key": "document.spec.technical",
            "props": {},
            "created_by": "85eba71b-56c9-4561-9dae-3828cf9922c4",
            "created_at": "2025-12-23T06:27:24.690713+00:00",
            "state_key": "draft",
            "updated_at": "2025-12-23T06:27:24.690713+00:00",
            "content": null,
            "description": null,
            "deleted_at": null,
            "search_vector": "'migrat':1A 'protocol':2A"
          }
        ],
        "sources": [],
        "milestones": [],
        "risks": [],
        "decisions": [],
        "metrics": [],
        "context_document": null,
        "message": "Complete ontology project details loaded."
      },
      "planId": "b2df4112-9739-4464-8c3d-e40f7bfb833c",
      "stepNumber": 2,
      "contextType": "project",
      "entityId": "2339d78f-f925-4bb3-b6a6-c2027ceeca87"
    }
  },
  "result": {
    "response": "```json\n{\n  \"entities\": {\n    \"tasks\": [\n      {\n        \"id\": \"cf807570-1e38-4ef3-8014-87f31872d4fe\",\n        \"title\": \"Audit all source projects for migration content\",\n        \"state_key\": \"todo\",\n        \"priority\": 1,\n        \"plan_id\": \"a39f1722-3e09-487c-a675-740bb0396fb4\"\n      },\n      {\n        \"id\": \"9969fa1a-0c56-401a-8dc1-aed688a6d832\",\n        \"title\": \"Create mapping structure for entity relationships\",\n        \"state_key\": \"todo\",\n        \"priority\": 2,\n        \"plan_id\": \"a39f1722-3e09-487c-a675-740bb0396fb4\"\n      },\n      {\n        \"id\": \"2d291887-303f-497d-8939-504e043f37d7\",\n        \"title\": \"Verify all migrated data matches source\",\n        \"state_key\": \"todo\",\n        \"priority\": 1,\n        \"plan_id\": \"7801f8d2-7eb3-4964-aafa-790f57573bfb\"\n      }\n    ],\n    \"goals\": [\n      {\n        \"id\": \"1ea48d6c-8a3c-4946-9145-fb3a36bd7c5d\",\n        \"name\": \"Complete migration of all BuildOS projects into unified structure\",\n        \"state_key\": \"draft\"\n      },\n      {\n        \"id\": \"4ce9d48a-f961-430f-8952-d5d78a93b553\",\n        \"name\": \"Maintain data integrity during migration\",\n        \"state_key\": \"draft\"\n      }\n    ],\n    \"plans\": [\n      {\n        \"id\": \"a39f1722-3e09-487c-a675-740bb0396fb4\",\n        \"name\": \"Migration Execution Plan\",\n        \"state_key\": \"draft\"\n      },\n      {\n        \"id\": \"7801f8d2-7eb3-4964-aafa-790f57573bfb\",\n        \"name\": \"Data Verification Phase\",\n        \"state_key\": \"draft\"\n      }\n    ],\n    \"documents\": [\n      {\n        \"id\": \"e179afb4-6ae9-4047-85c1-a2ccba1c2779\",\n        \"title\": \"BuildOS Unified Context Document\",\n        \"state_key\": \"draft\"\n      },\n      {\n        \"id\": \"130a760f-1d82-4fdb-9992-b2b5b93878b1\",\n        \"title\": \"Migration Protocol\",\n        \"state_key\": \"draft\"\n      }\n    ]\n  },\n  \"project_id\": \"2339d78f-f925-4bb3-b6a6-c2027ceeca87\",\n  \"plan_step\": 2,\n  \"status\": \"completed\",\n  \"errors\": []\n}\n```"
  },
  "toolCallsMade": 0,
  "tokensUsed": 5487
}
````

## Token Estimates

- **System Prompt:** ~42 tokens
- **User Prompt:** ~4149 tokens
- **Total Estimate:** ~4191 tokens

---

_This file is automatically generated in development mode for prompt auditing purposes._
