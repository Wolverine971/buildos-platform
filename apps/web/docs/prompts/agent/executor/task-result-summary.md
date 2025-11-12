# Prompt Audit: agent-executor-result

**Generated at:** 2025-11-12T05:49:29.824Z
**Environment:** Development

## Metadata

```json
{
	"executorId": "42b3de18-efdb-4d0c-aa1e-29f3b4af810e",
	"planId": "c53392ff-deaf-4aee-ac20-95f33a5f6813",
	"sessionId": "2664ae61-8489-423e-975e-46711dac096e",
	"taskId": "c53392ff-deaf-4aee-ac20-95f33a5f6813-step-2-4426ddd4-e06f-49cf-b7b4-2b0c66634af5",
	"toolCalls": 1,
	"tokensUsed": 24582,
	"timestamp": "2025-11-12T05:49:29.823Z"
}
```

## System Prompt

```
Executor Result Summary
Executor ID: 42b3de18-efdb-4d0c-aa1e-29f3b4af810e
Plan ID: c53392ff-deaf-4aee-ac20-95f33a5f6813
Session ID: 2664ae61-8489-423e-975e-46711dac096e
```

## User Prompt

```
{
  "task": {
    "id": "c53392ff-deaf-4aee-ac20-95f33a5f6813-step-2-4426ddd4-e06f-49cf-b7b4-2b0c66634af5",
    "description": "Create a new ontology project using the selected template.",
    "goal": "Complete plan step 2 for strategy project_creation",
    "constraints": [
      "Incorporate outputs from plan steps 1",
      "Use only the assigned tools: `create_onto_project`",
      "Return structured JSON data that can be used by subsequent plan steps"
    ],
    "contextData": {
      "1": {
        "templates": [
          {
            "id": "d2c326eb-bc8d-4e5d-9979-fffa578639de",
            "scope": "project",
            "type_key": "developer.app",
            "name": "Application Development",
            "status": "active",
            "metadata": {
              "realm": "technical",
              "output_type": "software",
              "typical_scale": "large"
            },
            "facet_defaults": {
              "scale": "large",
              "stage": "planning",
              "context": "commercial"
            },
            "default_props": {},
            "default_views": [
              {
                "view": "kanban",
                "group_by": "state_key"
              }
            ],
            "schema": {
              "type": "object",
              "properties": {
                "mvp_date": {
                  "type": "string",
                  "format": "date"
                },
                "tech_stack": {
                  "type": "array"
                },
                "target_platform": {
                  "type": "string"
                }
              }
            },
            "fsm": {
              "states": [
                "planning",
                "development",
                "testing",
                "deployed"
              ],
              "transitions": [
                {
                  "to": "development",
                  "from": "planning",
                  "event": "start_dev"
                },
                {
                  "to": "testing",
                  "from": "development",
                  "event": "code_complete"
                },
                {
                  "to": "deployed",
                  "from": "testing",
                  "event": "deploy"
                }
              ]
            },
            "created_at": "2025-11-03T04:48:06.523206+00:00",
            "updated_at": "2025-11-03T04:48:06.523206+00:00",
            "inheritance_chain": []
          },
          {
            "id": "006f1aca-5e71-4581-9d26-0af4c65d0c5f",
            "scope": "project",
            "type_key": "writer.article",
            "name": "Article/Essay",
            "status": "active",
            "metadata": {
              "realm": "creative",
              "output_type": "content",
              "typical_scale": "small"
            },
            "facet_defaults": {
              "scale": "small",
              "stage": "planning",
              "context": "client"
            },
            "default_props": {},
            "default_views": [
              {
                "view": "pipeline",
                "group_by": "state_key"
              }
            ],
            "schema": {
              "type": "object",
              "properties": {
                "due_date": {
                  "type": "string",
                  "format": "date"
                },
                "word_count": {
                  "type": "number"
                },
                "publication": {
                  "type": "string"
                }
              }
            },
            "fsm": {
              "states": [
                "draft",
                "writing",
                "review",
                "published"
              ],
              "transitions": [
                {
                  "to": "writing",
                  "from": "draft",
                  "event": "start"
                },
                {
                  "to": "review",
                  "from": "writing",
                  "event": "submit"
                },
                {
                  "to": "published",
                  "from": "review",
                  "event": "publish"
                }
              ]
            },
            "created_at": "2025-11-03T04:48:06.523206+00:00",
            "updated_at": "2025-11-03T04:48:06.523206+00:00",
            "inheritance_chain": []
          },
          {
            "id": "bc769000-b91e-4266-8c26-43ae17fbc935",
            "scope": "output",
            "type_key": "output.article",
            "name": "Article/Essay",
            "status": "active",
            "metadata": {
              "primitive": "TEXT_DOCUMENT",
              "description": "Articles, essays, and published content pieces",
              "output_type": "content",
              "typical_use_by": [
                "writer",
                "marketer",
                "content-creator"
              ],
              "can_create_in_buildos": true
            },
            "facet_defaults": {
              "stage": "planning"
            },
            "default_props": {
              "target_word_count": 1000
            },
            "default_views": [
              {
                "view": "document"
              }
            ],
            "schema": {
              "type": "object",
              "properties": {
                "keywords": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                },
                "seo_title": {
                  "type": "string",
                  "maxLength": 60
                },
                "publication": {
                  "type": "string"
                },
                "publish_date": {
                  "type": "string",
                  "format": "date"
                },
                "meta_description": {
                  "type": "string",
                  "maxLength": 160
                },
                "target_word_count": {
                  "type": "number",
                  "minimum": 100
                }
              }
            },
            "fsm": {
              "states": [
                "draft",
                "review",
                "approved",
                "published"
              ],
              "type_key": "output.article",
              "transitions": [
                {
                  "to": "review",
                  "from": "draft",
                  "event": "submit"
                },
                {
                  "to": "draft",
                  "from": "review",
                  "event": "request_changes"
                },
                {
                  "to": "approved",
                  "from": "review",
                  "event": "approve"
                },
                {
                  "to": "published",
                  "from": "approved",
                  "event": "publish"
                }
              ]
            },
            "created_at": "2025-11-03T22:01:33.116979+00:00",
            "updated_at": "2025-11-03T22:01:33.116979+00:00",
            "inheritance_chain": []
          },
          {
            "id": "758075dd-418e-4cdd-b82a-bfc783604ffc",
            "scope": "project",
            "type_key": "student.assignment",
            "name": "Assignment/Homework",
            "status": "active",
            "metadata": {
              "realm": "education",
              "output_type": "knowledge",
              "typical_scale": "micro"
            },
            "facet_defaults": {
              "scale": "micro",
              "stage": "planning",
              "context": "academic"
            },
            "default_props": {},
            "default_views": [
              {
                "view": "list",
                "sort_by": "due_date"
              }
            ],
            "schema": {
              "type": "object",
              "properties": {
                "due_date": {
                  "type": "string",
                  "format": "date"
                },
                "course_name": {
                  "type": "string"
                },
                "grade_weight": {
                  "type": "number"
                }
              }
            },
            "fsm": {
              "states": [
                "assigned",
                "working",
                "submitted",
                "graded"
              ],
              "transitions": [
                {
                  "to": "working",
                  "from": "assigned",
                  "event": "start"
                },
                {
                  "to": "submitted",
                  "from": "working",
                  "event": "submit"
                },
                {
                  "to": "graded",
                  "from": "submitted",
                  "event": "receive_grade"
                }
              ]
            },
            "created_at": "2025-11-03T04:48:06.523206+00:00",
            "updated_at": "2025-11-03T04:48:06.523206+00:00",
            "inheritance_chain": []
          },
          {
            "id": "cf070b00-4605-4c8a-9999-15d41a49d83d",
            "scope": "goal",
            "type_key": "goal.base",
            "name": "Base Goal",
            "status": "active",
            "metadata": {
              "realm": "goals",
              "description": "Abstract base template for all goals"
            },
            "facet_defaults": {},
            "default_props": {
              "priority": "medium"
            },
            "default_views": [
              {
                "view": "list",
                "sort_by": "target_date"
              }
            ],
            "schema": {
              "type": "object",
              "required": [
                "name",
                "success_definition"
              ],
              "properties": {
                "name": {
                  "type": "string",
                  "description": "Goal name"
                },
                "notes": {
                  "type": "string",
                  "description": "Additional context"
                },
                "priority": {
                  "enum": [
                    "high",
                    "medium",
                    "low"
                  ],
                  "type": "string",
                  "default": "medium",
                  "description": "Goal priority"
                },
                "description": {
                  "type": "string",
                  "description": "Detailed description"
                },
                "target_date": {
                  "type": "string",
                  "format": "date",
                  "description": "Target completion date"
                },
                "success_definition": {
                  "type": "string",
                  "description": "What success looks like"
                },
                "measurement_criteria": {
                  "type": "string",
                  "description": "How to measure progress"
                }
              }
            },
            "fsm": {
              "states": [
                "draft",
                "active",
                "achieved",
                "abandoned"
              ],
              "type_key": "goal.base",
              "transitions": [
                {
                  "to": "active",
                  "from": "draft",
                  "event": "commit",
                  "description": "Commit to pursuing this goal"
                },
                {
                  "to": "achieved",
                  "from": "active",
                  "event": "achieve",
                  "actions": [
                    {
                      "type": "notify",
                      "message": "Congratulations on achieving your goal!"
                    }
                  ],
                  "description": "Goal successfully achieved"
                },
                {
                  "to": "abandoned",
                  "from": "active",
                  "event": "abandon",
                  "description": "Stop pursuing this goal"
                }
              ]
            },
            "created_at": "2025-11-04T23:25:09.400439+00:00",
            "updated_at": "2025-11-04T23:25:09.400439+00:00",
            "inheritance_chain": []
          },
          {
            "id": "b5249009-c446-4e38-abce-387f1c7375d7",
            "scope": "output",
            "type_key": "output.base",
            "name": "Base Output",
            "status": "active",
            "metadata": {
              "realm": "output",
              "description": "Base template for all outputs"
            },
            "facet_defaults": {
              "stage": "planning"
            },
            "default_props": {},
            "default_views": [
              {
                "view": "pipeline",
                "group_by": "state_key"
              }
            ],
            "schema": {
              "type": "object",
              "required": [
                "name"
              ],
              "properties": {
                "name": {
                  "type": "string"
                },
                "description": {
                  "type": "string"
                }
              }
            },
            "fsm": {
              "states": [
                "draft",
                "review",
                "approved",
                "published"
              ],
              "type_key": "output.base",
              "transitions": [
                {
                  "to": "review",
                  "from": "draft",
                  "event": "submit"
                },
                {
                  "to": "draft",
                  "from": "review",
                  "event": "request_changes"
                },
                {
                  "to": "approved",
                  "from": "review",
                  "event": "approve"
                },
                {
                  "to": "published",
                  "from": "approved",
                  "event": "publish"
                }
              ]
            },
            "created_at": "2025-11-03T22:01:33.116979+00:00",
            "updated_at": "2025-11-03T22:01:33.116979+00:00",
            "inheritance_chain": []
          },
          {
            "id": "8ee3273e-c5be-4180-ba8c-b91766ec53f8",
            "scope": "task",
            "type_key": "task.base",
            "name": "Base Task",
            "status": "active",
            "metadata": {
              "realm": "productivity",
              "usage": "Base class for task inheritance",
              "description": "Abstract base template for all tasks",
              "typical_duration": "varies"
            },
            "facet_defaults": {
              "scale": "small"
            },
            "default_props": {},
            "default_views": [
              {
                "view": "list",
                "sort_by": "priority"
              }
            ],
            "schema": {
              "type": "object",
              "required": [
                "title"
              ],
              "properties": {
                "notes": {
                  "type": "string",
                  "description": "Additional notes and context"
                },
                "title": {
                  "type": "string",
                  "description": "Task title"
                },
                "description": {
                  "type": "string",
                  "description": "Detailed task description"
                },
                "actual_duration_minutes": {
                  "type": "number",
                  "minimum": 0,
                  "description": "Actual time spent (minutes)"
                },
                "estimated_duration_minutes": {
                  "type": "number",
                  "minimum": 5,
                  "description": "Estimated time to complete (minutes)"
                }
              }
            },
            "fsm": {
              "states": [
                "todo",
                "in_progress",
                "blocked",
                "done",
                "abandoned"
              ],
              "type_key": "task.base",
              "transitions": [
                {
                  "to": "in_progress",
                  "from": "todo",
                  "event": "start",
                  "description": "Begin working on task"
                },
                {
                  "to": "blocked",
                  "from": "in_progress",
                  "event": "block",
                  "description": "Task is blocked by external dependency"
                },
                {
                  "to": "in_progress",
                  "from": "blocked",
                  "event": "unblock",
                  "description": "Blocker resolved, resume work"
                },
                {
                  "to": "done",
                  "from": "in_progress",
                  "event": "complete",
                  "description": "Task completed successfully"
                },
                {
                  "to": "abandoned",
                  "from": "todo",
                  "event": "abandon",
                  "description": "Task no longer needed"
                },
                {
                  "to": "abandoned",
                  "from": "in_progress",
                  "event": "abandon",
                  "description": "Stop work on task"
                },
                {
                  "to": "abandoned",
                  "from": "blocked",
                  "event": "abandon",
                  "description": "Cancel blocked task"
                }
              ]
            },
            "created_at": "2025-11-04T23:25:09.400439+00:00",
            "updated_at": "2025-11-04T23:25:09.400439+00:00",
            "inheritance_chain": []
          },
          {
            "id": "e3e626ef-fc9a-4a70-9c6e-c79fc8898b03",
            "scope": "goal",
            "type_key": "goal.behavior",
            "name": "Behavior Change Goal",
            "status": "active",
            "metadata": {
              "realm": "goals",
              "usage": "Exercise regularly, wake up early, meditate daily",
              "category": "Personal Development",
              "goal_type": "behavior",
              "description": "Goals focused on changing habits and behaviors",
              "measurement_type": "Frequency & consistency"
            },
            "facet_defaults": {},
            "default_props": {
              "streak": 0
            },
            "default_views": [],
            "schema": {
              "type": "object",
              "properties": {
                "streak": {
                  "type": "number",
                  "default": 0,
                  "description": "Current streak count"
                },
                "completion_log": {
                  "type": "array",
                  "items": {
                    "type": "string",
                    "format": "date-time"
                  },
                  "description": "Dates when behavior was performed"
                },
                "target_behavior": {
                  "type": "string",
                  "description": "Desired behavior"
                },
                "tracking_method": {
                  "type": "string",
                  "description": "How to track progress"
                },
                "current_behavior": {
                  "type": "string",
                  "description": "Behavior to change"
                },
                "frequency_target": {
                  "type": "string",
                  "description": "How often (daily, weekly, etc.)"
                }
              }
            },
            "fsm": {},
            "created_at": "2025-11-04T23:25:09.400439+00:00",
            "updated_at": "2025-11-04T23:33:57.928788+00:00",
            "inheritance_chain": []
          },
          {
            "id": "0d60ace7-52ae-476d-b2fa-40746f96f397",
            "scope": "output",
            "type_key": "output.blog_post",
            "name": "Blog Post",
            "status": "active",
            "metadata": {
              "primitive": "TEXT_DOCUMENT",
              "description": "Blog posts for websites and content marketing",
              "output_type": "content",
              "typical_use_by": [
                "writer",
                "marketer",
                "content-creator",
                "founder"
              ],
              "can_create_in_buildos": true
            },
            "facet_defaults": {
              "stage": "planning"
            },
            "default_props": {
              "tags": [],
              "categories": []
            },
            "default_views": [
              {
                "view": "document"
              }
            ],
            "schema": {
              "type": "object",
              "properties": {
                "slug": {
                  "type": "string"
                },
                "tags": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                },
                "excerpt": {
                  "type": "string",
                  "maxLength": 300
                },
                "blog_name": {
                  "type": "string"
                },
                "categories": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                },
                "publish_date": {
                  "type": "string",
                  "format": "date"
                },
                "featured_image_url": {
                  "type": "string",
                  "format": "uri"
                }
              }
            },
            "fsm": {
              "states": [
                "draft",
                "review",
                "approved",
                "published"
              ],
              "type_key": "output.blog_post",
              "transitions": [
                {
                  "to": "review",
                  "from": "draft",
                  "event": "submit"
                },
                {
                  "to": "draft",
                  "from": "review",
                  "event": "request_changes"
                },
                {
                  "to": "approved",
                  "from": "review",
                  "event": "approve"
                },
                {
                  "to": "published",
                  "from": "approved",
                  "event": "publish"
                }
              ]
            },
            "created_at": "2025-11-03T22:01:33.116979+00:00",
            "updated_at": "2025-11-03T22:01:33.116979+00:00",
            "inheritance_chain": []
          },
          {
            "id": "dc8dd6ec-6e26-4bfa-b265-2f1fa4c4890a",
            "scope": "output",
            "type_key": "output.chapter",
            "name": "Book Chapter",
            "status": "active",
            "metadata": {
              "primitive": "TEXT_DOCUMENT",
              "output_type": "content",
              "typical_use_by": [
                "writer"
              ],
              "can_create_in_buildos": true
            },
            "facet_defaults": {
              "stage": "planning"
            },
            "default_props": {},
            "default_views": [
              {
                "view": "pipeline",
                "group_by": "state_key"
              }
            ],
            "schema": {
              "type": "object",
              "properties": {
                "target_words": {
                  "type": "number"
                },
                "chapter_title": {
                  "type": "string"
                },
                "chapter_number": {
                  "type": "integer"
                }
              }
            },
            "fsm": {
              "states": [
                "outline",
                "draft",
                "revision",
                "final"
              ],
              "transitions": [
                {
                  "to": "draft",
                  "from": "outline",
                  "event": "start_writing"
                },
                {
                  "to": "revision",
                  "from": "draft",
                  "event": "first_draft_done"
                },
                {
                  "to": "final",
                  "from": "revision",
                  "event": "approve"
                }
              ]
            },
            "created_at": "2025-11-03T04:48:06.523206+00:00",
            "updated_at": "2025-11-03T22:01:33.116979+00:00",
            "inheritance_chain": []
          },
          {
            "id": "3120b7ed-7c00-425a-ae62-9bf6e987617c",
            "scope": "project",
            "type_key": "writer.book",
            "name": "Book Project",
            "status": "active",
            "metadata": {
              "realm": "creative",
              "keywords": [
                "writing",
                "book",
                "novel",
                "author",
                "manuscript",
                "publishing"
              ],
              "output_type": "content",
              "typical_scale": "large"
            },
            "facet_defaults": {
              "scale": "large",
              "stage": "planning",
              "context": "personal"
            },
            "default_props": {
              "default_chapter_count": 10
            },
            "default_views": [
              {
                "view": "pipeline",
                "group_by": "state_key"
              },
              {
                "view": "kanban",
                "group_by": "state_key"
              }
            ],
            "schema": {
              "type": "object",
              "properties": {
                "genre": {
                  "type": "string"
                },
                "deadline": {
                  "type": "string",
                  "format": "date"
                },
                "publisher": {
                  "type": "string"
                },
                "target_word_count": {
                  "type": "number",
                  "minimum": 1000
                },
                "draft_complete_date": {
                  "type": "string",
                  "format": "date"
                }
              }
            },
            "fsm": {
              "states": [
                "planning",
                "writing",
                "editing",
                "published"
              ],
              "type_key": "writer.book",
              "transitions": [
                {
                  "to": "writing",
                  "from": "planning",
                  "event": "start_writing",
                  "guards": [
                    {
                      "path": "props.target_word_count",
                      "type": "has_property"
                    }
                  ],
                  "actions": [
                    {
                      "type": "spawn_tasks",
                      "titles": [
                        "Draft Chapter 1",
                        "Draft Chapter 2",
                        "Draft Chapter 3",
                        "Draft Chapter 4",
                        "Draft Chapter 5"
                      ],
                      "props_template": {
                        "facets": {
                          "scale": "medium"
                        }
                      }
                    },
                    {
                      "type": "update_facets",
                      "facets": {
                        "stage": "execution"
                      }
                    },
                    {
                      "type": "notify",
                      "message": "Writing phase started! Time to create your manuscript."
                    }
                  ]
                },
                {
                  "to": "editing",
                  "from": "writing",
                  "event": "complete_draft",
                  "guards": [
                    {
                      "path": "props.draft_complete_date",
                      "type": "has_property"
                    }
                  ],
                  "actions": [
                    {
                      "type": "spawn_tasks",
                      "titles": [
                        "First editing pass - structure and flow",
                        "Second editing pass - prose and style",
                        "Proofread for grammar and typos",
                        "Format manuscript"
                      ],
                      "props_template": {
                        "facets": {
                          "scale": "small"
                        }
                      }
                    },
                    {
                      "type": "update_facets",
                      "facets": {
                        "stage": "launch"
                      }
                    },
                    {
                      "type": "notify",
                      "message": "Draft complete! Moving to editing phase."
                    }
                  ]
                },
                {
                  "to": "published",
                  "from": "editing",
                  "event": "publish",
                  "actions": [
                    {
                      "type": "update_facets",
                      "facets": {
                        "stage": "complete"
                      }
                    },
                    {
                      "type": "notify",
                      "message": "Congratulations! Your book is published!"
                    },
                    {
                      "type": "email_user",
                      "subject": "Your book is published!",
                      "body_template": "Congratulations on publishing your book!"
                    }
                  ]
                }
              ]
            },
            "created_at": "2025-11-03T04:48:06.523206+00:00",
            "updated_at": "2025-11-03T04:48:06.523206+00:00",
            "inheritance_chain": []
          },
          {
            "id": "79712e15-98b0-4bd5-ae37-fb359a1c5012",
            "scope": "output",
            "type_key": "output.case_study",
            "name": "Case Study",
            "status": "active",
            "metadata": {
              "primitive": "TEXT_DOCUMENT",
              "description": "Customer case studies showcasing successful projects and outcomes",
              "output_type": "content",
              "typical_use_by": [
                "marketer",
                "consultant",
                "agency",
                "founder"
              ],
              "can_create_in_buildos": true
            },
            "facet_defaults": {
              "stage": "planning"
            },
            "default_props": {
              "results": []
            },
            "default_views": [
              {
                "view": "document"
              }
            ],
            "schema": {
              "type": "object",
              "required": [
                "client_name",
                "challenge"
              ],
              "properties": {
                "results": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                },
                "industry": {
                  "type": "string"
                },
                "solution": {
                  "type": "string"
                },
                "challenge": {
                  "type": "string"
                },
                "team_size": {
                  "type": "number"
                },
                "client_name": {
                  "type": "string"
                },
                "testimonial": {
                  "type": "string"
                },
                "project_duration": {
                  "type": "string"
                }
              }
            },
            "fsm": {
              "states": [
                "draft",
                "review",
                "approved",
                "published"
              ],
              "type_key": "output.case_study",
              "transitions": [
                {
                  "to": "review",
                  "from": "draft",
                  "event": "submit"
                },
                {
                  "to": "draft",
                  "from": "review",
                  "event": "request_changes"
                },
                {
                  "to": "approved",
                  "from": "review",
                  "event": "approve"
                },
                {
                  "to": "published",
                  "from": "approved",
                  "event": "publish"
                }
              ]
            },
            "created_at": "2025-11-03T22:01:33.116979+00:00",
            "updated_at": "2025-11-03T22:01:33.116979+00:00",
            "inheritance_chain": []
          },
          {
            "id": "d75b38a1-8bd4-4950-ad44-13b119042aa2",
            "scope": "plan",
            "type_key": "plan.client_onboarding",
            "name": "Client Onboarding",
            "status": "active",
            "metadata": {
              "usage": "Client kickoff, intake process, initial setup",
              "description": "Structured plan for onboarding new clients",
              "typical_use_by": [
                "coach",
                "consultant",
                "agency"
              ]
            },
            "facet_defaults": {
              "scale": "small",
              "context": "client"
            },
            "default_props": {},
            "default_views": [],
            "schema": {
              "type": "object",
              "properties": {
                "start_date": {
                  "type": "string",
                  "format": "date",
                  "description": "Onboarding start date"
                },
                "client_name": {
                  "type": "string",
                  "description": "Client name"
                },
                "key_milestones": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  },
                  "description": "Critical onboarding steps"
                },
                "onboarding_duration_days": {
                  "type": "number",
                  "description": "Expected duration"
                }
              }
            },
            "fsm": {
              "states": [
                "preparing",
                "in_progress",
                "complete",
                "paused"
              ],
              "type_key": "plan.client_onboarding",
              "transitions": [
                {
                  "to": "in_progress",
                  "from": "preparing",
                  "event": "start"
                },
                {
                  "to": "paused",
                  "from": "in_progress",
                  "event": "pause"
                },
                {
                  "to": "in_progress",
                  "from": "paused",
                  "event": "resume"
                },
                {
                  "to": "complete",
                  "from": "in_progress",
                  "event": "finish"
                }
              ]
            },
            "created_at": "2025-11-04T23:25:09.400439+00:00",
            "updated_at": "2025-11-04T23:25:09.400439+00:00",
            "inheritance_chain": []
          },
          {
            "id": "c490a8e6-8a79-4b42-8ee9-1e5d9043a50b",
            "scope": "project",
            "type_key": "coach.client",
            "name": "Coaching Client",
            "status": "active",
            "metadata": {
              "realm": "service",
              "output_type": "service",
              "typical_scale": "medium"
            },
            "facet_defaults": {
              "scale": "medium",
              "stage": "planning",
              "context": "client"
            },
            "default_props": {},
            "default_views": [
              {
                "view": "pipeline",
                "group_by": "state_key"
              }
            ],
            "schema": {
              "type": "object",
              "properties": {
                "client_name": {
                  "type": "string"
                },
                "session_frequency": {
                  "type": "string"
                },
                "time_horizon_weeks": {
                  "type": "integer"
                }
              }
            },
            "fsm": {
              "states": [
                "intake",
                "active",
                "paused",
                "completed"
              ],
              "transitions": [
                {
                  "to": "active",
                  "from": "intake",
                  "event": "begin_coaching"
                },
                {
                  "to": "paused",
                  "from": "active",
                  "event": "pause"
                },
                {
                  "to": "active",
                  "from": "paused",
                  "event": "resume"
                },
                {
                  "to": "completed",
                  "from": "active",
                  "event": "complete"
                }
              ]
            },
            "created_at": "2025-11-03T04:48:06.523206+00:00",
            "updated_at": "2025-11-03T04:48:06.523206+00:00",
            "inheritance_chain": []
          },
          {
            "id": "16cff2aa-09ed-41e6-9581-4e3be04f23eb",
            "scope": "plan",
            "type_key": "plan.content_calendar",
            "name": "Content Calendar",
            "status": "active",
            "metadata": {
              "usage": "Editorial calendar, social media planning, blog scheduling",
              "description": "Plan for organizing content creation and publishing",
              "typical_use_by": [
                "marketer",
                "writer",
                "content-creator"
              ]
            },
            "facet_defaults": {
              "scale": "medium",
              "stage": "execution"
            },
            "default_props": {},
            "default_views": [],
            "schema": {
              "type": "object",
              "properties": {
                "theme": {
                  "type": "string",
                  "description": "Overall content theme"
                },
                "platforms": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  },
                  "description": "Publishing platforms"
                },
                "content_types": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  },
                  "description": "Types of content (blog, video, social, etc.)"
                },
                "publish_frequency": {
                  "type": "string",
                  "description": "How often to publish"
                }
              }
            },
            "fsm": {
              "states": [
                "planning",
                "scheduled",
                "publishing",
                "complete"
              ],
              "type_key": "plan.content_calendar",
              "transitions": [
                {
                  "to": "scheduled",
                  "from": "planning",
                  "event": "schedule"
                },
                {
                  "to": "publishing",
                  "from": "scheduled",
                  "event": "start_publishing"
                },
                {
                  "to": "complete",
                  "from": "publishing",
                  "event": "finish"
                }
              ]
            },
            "created_at": "2025-11-04T23:25:09.400439+00:00",
            "updated_at": "2025-11-04T23:25:09.400439+00:00",
            "inheritance_chain": []
          },
          {
            "id": "def3e1fd-c727-44ce-a4e1-2fe657062a4d",
            "scope": "task",
            "type_key": "task.deep_work",
            "name": "Deep Work Task",
            "status": "active",
            "metadata": {
              "realm": "productivity",
              "usage": "Complex work, creative tasks, problem-solving",
              "category": "Deep Work",
              "description": "Tasks requiring extended focused attention",
              "typical_duration": "1-4 hours",
              "requires_deep_focus": true
            },
            "facet_defaults": {
              "scale": "small"
            },
            "default_props": {
              "requires_focus_time": true,
              "estimated_duration_minutes": 120
            },
            "default_views": [],
            "schema": {
              "type": "object",
              "properties": {
                "work_sessions": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "date": {
                        "type": "string",
                        "format": "date-time"
                      },
                      "duration_minutes": {
                        "type": "number"
                      }
                    }
                  },
                  "description": "Log of work sessions"
                },
                "requires_focus_time": {
                  "type": "boolean",
                  "default": true,
                  "description": "Requires uninterrupted focus"
                },
                "preferred_time_of_day": {
                  "enum": [
                    "morning",
                    "afternoon",
                    "evening"
                  ],
                  "type": "string",
                  "description": "Optimal time for this work"
                }
              }
            },
            "fsm": {},
            "created_at": "2025-11-04T23:25:09.400439+00:00",
            "updated_at": "2025-11-04T23:33:57.928788+00:00",
            "inheritance_chain": []
          },
          {
            "id": "a9f51dbc-3210-49b1-b567-03284057430e",
            "scope": "output",
            "type_key": "output.design",
            "name": "Design Asset",
            "status": "active",
            "metadata": {
              "output_type": "content"
            },
            "facet_defaults": {
              "stage": "planning"
            },
            "default_props": {},
            "default_views": [
              {
                "view": "pipeline",
                "group_by": "state_key"
              }
            ],
            "schema": {
              "type": "object",
              "properties": {
                "format": {
                  "type": "string"
                },
                "asset_type": {
                  "type": "string"
                },
                "dimensions": {
                  "type": "string"
                }
              }
            },
            "fsm": {
              "states": [
                "concept",
                "draft",
                "review",
                "approved"
              ],
              "transitions": [
                {
                  "to": "draft",
                  "from": "concept",
                  "event": "start_designing"
                },
                {
                  "to": "review",
                  "from": "draft",
                  "event": "submit"
                },
                {
                  "to": "approved",
                  "from": "review",
                  "event": "approve"
                }
              ]
            },
            "created_at": "2025-11-03T04:48:06.523206+00:00",
            "updated_at": "2025-11-03T04:48:06.523206+00:00",
            "inheritance_chain": []
          },
          {
            "id": "ef85231f-5037-4098-9daa-09b89785298f",
            "scope": "project",
            "type_key": "developer.feature",
            "name": "Feature Development",
            "status": "active",
            "metadata": {
              "realm": "technical",
              "output_type": "software",
              "typical_scale": "small"
            },
            "facet_defaults": {
              "scale": "small",
              "stage": "planning",
              "context": "internal"
            },
            "default_props": {},
            "default_views": [
              {
                "view": "kanban",
                "group_by": "state_key"
              }
            ],
            "schema": {
              "type": "object",
              "properties": {
                "epic_id": {
                  "type": "string"
                },
                "feature_name": {
                  "type": "string"
                },
                "story_points": {
                  "type": "integer"
                }
              }
            },
            "fsm": {
              "states": [
                "backlog",
                "in_progress",
                "review",
                "done"
              ],
              "transitions": [
                {
                  "to": "in_progress",
                  "from": "backlog",
                  "event": "start"
                },
                {
                  "to": "review",
                  "from": "in_progress",
                  "event": "submit_pr"
                },
                {
                  "to": "done",
                  "from": "review",
                  "event": "merge"
                }
              ]
            },
            "created_at": "2025-11-03T04:48:06.523206+00:00",
            "updated_at": "2025-11-03T04:48:06.523206+00:00",
            "inheritance_chain": []
          },
          {
            "id": "5ac0c60e-be6b-4194-8ea5-5b0dc97fb823",
            "scope": "project",
            "type_key": "coach.program",
            "name": "Group Coaching Program",
            "status": "active",
            "metadata": {
              "realm": "service",
              "output_type": "service",
              "typical_scale": "medium"
            },
            "facet_defaults": {
              "scale": "medium",
              "stage": "planning",
              "context": "commercial"
            },
            "default_props": {},
            "default_views": [
              {
                "view": "pipeline",
                "group_by": "state_key"
              }
            ],
            "schema": {
              "type": "object",
              "properties": {
                "cohort_size": {
                  "type": "integer"
                },
                "program_name": {
                  "type": "string"
                },
                "duration_weeks": {
                  "type": "integer"
                }
              }
            },
            "fsm": {
              "states": [
                "planning",
                "enrollment",
                "active",
                "completed"
              ],
              "transitions": [
                {
                  "to": "enrollment",
                  "from": "planning",
                  "event": "open_enrollment"
                },
                {
                  "to": "active",
                  "from": "enrollment",
                  "event": "start_program"
                },
                {
                  "to": "completed",
                  "from": "active",
                  "event": "finish"
                }
              ]
            },
            "created_at": "2025-11-03T04:48:06.523206+00:00",
            "updated_at": "2025-11-03T04:48:06.523206+00:00",
            "inheritance_chain": []
          },
          {
            "id": "09d47325-137b-4eb3-99c5-2682b497e21e",
            "scope": "project",
            "type_key": "personal.routine",
            "name": "Habit/Routine",
            "status": "active",
            "metadata": {
              "realm": "personal_dev",
              "keywords": [
                "habit",
                "routine",
                "practice",
                "daily",
                "weekly",
                "consistency",
                "self-improvement"
              ],
              "output_type": "process",
              "typical_scale": "epic"
            },
            "facet_defaults": {
              "scale": "epic",
              "stage": "planning",
              "context": "personal"
            },
            "default_props": {
              "target_streak": 21
            },
            "default_views": [
              {
                "view": "checklist",
                "group_by": "day"
              },
              {
                "view": "calendar",
                "group_by": "week"
              }
            ],
            "schema": {
              "type": "object",
              "properties": {
                "frequency": {
                  "enum": [
                    "daily",
                    "weekly",
                    "monthly"
                  ],
                  "type": "string"
                },
                "trial_days": {
                  "type": "number",
                  "minimum": 7
                },
                "time_of_day": {
                  "enum": [
                    "morning",
                    "afternoon",
                    "evening",
                    "night"
                  ],
                  "type": "string"
                },
                "routine_name": {
                  "type": "string"
                },
                "target_streak": {
                  "type": "number",
                  "minimum": 21
                },
                "days_completed": {
                  "type": "number",
                  "default": 0
                }
              }
            },
            "fsm": {
              "states": [
                "designing",
                "testing",
                "established",
                "maintaining"
              ],
              "type_key": "personal.routine",
              "transitions": [
                {
                  "to": "testing",
                  "from": "designing",
                  "event": "start_trial",
                  "guards": [
                    {
                      "path": "props.frequency",
                      "type": "has_property"
                    },
                    {
                      "path": "props.time_of_day",
                      "type": "has_property"
                    }
                  ],
                  "actions": [
                    {
                      "type": "schedule_rrule",
                      "rrule": "FREQ=DAILY;COUNT=21",
                      "task_template": {
                        "props": {
                          "facets": {
                            "scale": "micro"
                          }
                        },
                        "title": "Complete routine"
                      }
                    },
                    {
                      "type": "update_facets",
                      "facets": {
                        "stage": "execution"
                      }
                    },
                    {
                      "type": "notify",
                      "message": "Trial started! Track your progress for the next 21 days."
                    }
                  ]
                },
                {
                  "to": "established",
                  "from": "testing",
                  "event": "make_habit",
                  "guards": [
                    {
                      "path": "props.days_completed",
                      "type": "has_property"
                    }
                  ],
                  "actions": [
                    {
                      "type": "update_facets",
                      "facets": {
                        "stage": "maintenance"
                      }
                    },
                    {
                      "type": "notify",
                      "message": "Great job! Your routine is now established. Keep it going!"
                    }
                  ]
                },
                {
                  "to": "maintaining",
                  "from": "established",
                  "event": "sustain",
                  "actions": [
                    {
                      "type": "schedule_rrule",
                      "rrule": "FREQ=DAILY",
                      "task_template": {
                        "title": "Maintain routine"
                      }
                    },
                    {
                      "type": "notify",
                      "message": "Routine is now part of your lifestyle!"
                    }
                  ]
                },
                {
                  "to": "designing",
                  "from": "testing",
                  "event": "restart",
                  "actions": [
                    {
                      "type": "update_facets",
                      "facets": {
                        "stage": "planning"
                      }
                    },
                    {
                      "type": "notify",
                      "message": "Routine reset. Let's redesign and try again!"
                    }
                  ]
                }
              ]
            },
            "created_at": "2025-11-03T04:48:06.523206+00:00",
            "updated_at": "2025-11-03T04:48:06.523206+00:00",
            "inheritance_chain": []
          },
          {
            "id": "9dc14016-ed48-4d63-bd1c-d2b80c262973",
            "scope": "document",
            "type_key": "doc.intake",
            "name": "Intake Form",
            "status": "active",
            "metadata": {
              "output_type": "knowledge"
            },
            "facet_defaults": {},
            "default_props": {},
            "default_views": [
              {
                "view": "form"
              }
            ],
            "schema": {
              "type": "object",
              "properties": {
                "responses": {
                  "type": "array"
                },
                "client_info": {
                  "type": "object"
                }
              }
            },
            "fsm": {
              "states": [
                "draft",
                "submitted",
                "reviewed"
              ],
              "transitions": [
                {
                  "to": "submitted",
                  "from": "draft",
                  "event": "submit"
                },
                {
                  "to": "reviewed",
                  "from": "submitted",
                  "event": "review"
                }
              ]
            },
            "created_at": "2025-11-03T04:48:06.523206+00:00",
            "updated_at": "2025-11-03T04:48:06.523206+00:00",
            "inheritance_chain": []
          },
          {
            "id": "86b1d107-c807-454d-8ab4-c75e776803bc",
            "scope": "goal",
            "type_key": "goal.learning",
            "name": "Learning Goal",
            "status": "active",
            "metadata": {
              "realm": "goals",
              "usage": "Learn a language, master a technology, develop expertise",
              "category": "Personal Development",
              "goal_type": "learning",
              "description": "Goals focused on acquiring new skills or knowledge",
              "measurement_type": "Skill level progression"
            },
            "facet_defaults": {},
            "default_props": {},
            "default_views": [],
            "schema": {
              "type": "object",
              "required": [
                "skill_to_learn"
              ],
              "properties": {
                "target_level": {
                  "enum": [
                    "beginner",
                    "intermediate",
                    "advanced",
                    "expert"
                  ],
                  "type": "string",
                  "description": "Desired skill level"
                },
                "current_level": {
                  "enum": [
                    "beginner",
                    "intermediate",
                    "advanced"
                  ],
                  "type": "string",
                  "description": "Current skill level"
                },
                "skill_to_learn": {
                  "type": "string",
                  "description": "What to learn"
                },
                "practice_schedule": {
                  "type": "string",
                  "description": "How often to practice"
                },
                "learning_resources": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  },
                  "description": "Books, courses, tutorials"
                }
              }
            },
            "fsm": {},
            "created_at": "2025-11-04T23:25:09.400439+00:00",
            "updated_at": "2025-11-04T23:33:57.928788+00:00",
            "inheritance_chain": []
          },
          {
            "id": "cac2f698-d391-4fd8-b0e1-b19dae58df79",
            "scope": "project",
            "type_key": "marketer.campaign",
            "name": "Marketing Campaign",
            "status": "active",
            "metadata": {
              "realm": "business",
              "keywords": [
                "marketing",
                "campaign",
                "advertising",
                "content",
                "brand",
                "social-media",
                "email",
                "launch"
              ],
              "output_type": "content",
              "typical_scale": "medium"
            },
            "facet_defaults": {
              "scale": "medium",
              "stage": "planning",
              "context": "commercial"
            },
            "default_props": {},
            "default_views": [
              {
                "view": "pipeline",
                "group_by": "state_key"
              },
              {
                "view": "kanban",
                "group_by": "state_key"
              },
              {
                "view": "timeline",
                "sort_by": "start_date"
              }
            ],
            "schema": {
              "type": "object",
              "properties": {
                "budget": {
                  "type": "number",
                  "minimum": 0
                },
                "channels": {
                  "type": "array",
                  "items": {
                    "enum": [
                      "social-media",
                      "email",
                      "paid-ads",
                      "content-marketing",
                      "influencer"
                    ],
                    "type": "string"
                  }
                },
                "end_date": {
                  "type": "string",
                  "format": "date"
                },
                "start_date": {
                  "type": "string",
                  "format": "date"
                },
                "approval_date": {
                  "type": "string",
                  "format": "date"
                },
                "campaign_goal": {
                  "enum": [
                    "brand-awareness",
                    "lead-generation",
                    "product-launch",
                    "engagement",
                    "sales"
                  ],
                  "type": "string"
                },
                "campaign_name": {
                  "type": "string"
                },
                "assets_complete": {
                  "type": "boolean",
                  "default": false
                },
                "target_audience": {
                  "type": "string"
                },
                "performance_metrics": {
                  "type": "object",
                  "properties": {
                    "roi": {
                      "type": "number"
                    },
                    "clicks": {
                      "type": "number"
                    },
                    "conversions": {
                      "type": "number"
                    },
                    "impressions": {
                      "type": "number"
                    }
                  }
                }
              }
            },
            "fsm": {
              "states": [
                "planning",
                "creating",
                "reviewing",
                "launched",
                "analyzing"
              ],
              "type_key": "marketer.campaign",
              "transitions": [
                {
                  "to": "creating",
                  "from": "planning",
                  "event": "start_creation",
                  "guards": [
                    {
                      "path": "props.campaign_goal",
                      "type": "has_property"
                    },
                    {
                      "path": "props.target_audience",
                      "type": "has_property"
                    },
                    {
                      "path": "props.channels",
                      "type": "has_property"
                    }
                  ],
                  "actions": [
                    {
                      "type": "spawn_tasks",
                      "titles": [
                        "Create social media graphics",
                        "Write ad copy",
                        "Design landing page",
                        "Create email templates",
                        "Develop content calendar"
                      ],
                      "props_template": {
                        "facets": {
                          "scale": "small"
                        }
                      }
                    },
                    {
                      "type": "update_facets",
                      "facets": {
                        "stage": "execution"
                      }
                    },
                    {
                      "type": "notify",
                      "message": "Asset creation started! Build your campaign materials."
                    }
                  ]
                },
                {
                  "to": "reviewing",
                  "from": "creating",
                  "event": "submit_for_review",
                  "guards": [
                    {
                      "path": "props.assets_complete",
                      "type": "has_property"
                    }
                  ],
                  "actions": [
                    {
                      "type": "spawn_tasks",
                      "titles": [
                        "Review brand consistency",
                        "Check messaging alignment",
                        "Legal compliance check",
                        "Stakeholder approval"
                      ],
                      "props_template": {
                        "facets": {
                          "scale": "micro"
                        }
                      }
                    },
                    {
                      "type": "notify",
                      "message": "Campaign submitted for review. Awaiting stakeholder approval."
                    }
                  ]
                },
                {
                  "to": "creating",
                  "from": "reviewing",
                  "event": "request_changes",
                  "actions": [
                    {
                      "type": "notify",
                      "message": "Changes requested. Update campaign assets."
                    }
                  ]
                },
                {
                  "to": "launched",
                  "from": "reviewing",
                  "event": "approve_and_launch",
                  "guards": [
                    {
                      "path": "props.approval_date",
                      "type": "has_property"
                    },
                    {
                      "path": "props.start_date",
                      "type": "has_property"
                    }
                  ],
                  "actions": [
                    {
                      "type": "spawn_tasks",
                      "titles": [
                        "Schedule social posts",
                        "Launch paid ads",
                        "Send email campaign",
                        "Monitor performance",
                        "Engage with audience"
                      ],
                      "props_template": {
                        "facets": {
                          "scale": "small"
                        }
                      }
                    },
                    {
                      "type": "schedule_rrule",
                      "rrule": "FREQ=DAILY;COUNT=30",
                      "task_template": {
                        "title": "Check campaign metrics"
                      }
                    },
                    {
                      "type": "update_facets",
                      "facets": {
                        "stage": "launch"
                      }
                    },
                    {
                      "type": "notify",
                      "message": "Campaign launched! Monitor performance daily."
                    },
                    {
                      "type": "email_user",
                      "subject": "Campaign is live!",
                      "body_template": "Your marketing campaign has launched successfully."
                    }
                  ]
                },
                {
                  "to": "analyzing",
                  "from": "launched",
                  "event": "start_analysis",
                  "guards": [
                    {
                      "path": "props.end_date",
                      "type": "has_property"
                    }
                  ],
                  "actions": [
                    {
                      "type": "spawn_tasks",
                      "titles": [
                        "Gather performance data",
                        "Analyze ROI",
                        "Create performance report",
                        "Document learnings",
                        "Share results with team"
                      ],
                      "props_template": {
                        "facets": {
                          "scale": "small"
                        }
                      }
                    },
                    {
                      "type": "create_doc_from_template",
                      "variables": {
                        "campaign_name": "{{props.campaign_name}}"
                      },
                      "template_key": "doc.campaign_report"
                    },
                    {
                      "type": "update_facets",
                      "facets": {
                        "stage": "complete"
                      }
                    },
                    {
                      "type": "notify",
                      "message": "Campaign complete! Time to analyze results."
                    }
                  ]
                }
              ]
            },
            "created_at": "2025-11-03T04:48:06.523206+00:00",
            "updated_at": "2025-11-03T04:48:06.523206+00:00",
            "inheritance_chain": []
          },
          {
            "id": "1d1b4fd7-5355-4b56-bbae-11ae05eb740b",
            "scope": "task",
            "type_key": "task.meeting_prep",
            "name": "Meeting Preparation",
            "status": "active",
            "metadata": {
              "realm": "productivity",
              "usage": "Review materials, prepare talking points, gather data",
              "category": "Coordination",
              "description": "Preparation tasks for meetings"
            },
            "facet_defaults": {
              "scale": "micro"
            },
            "default_props": {
              "estimated_duration_minutes": 30
            },
            "default_views": [],
            "schema": {
              "type": "object",
              "properties": {
                "agenda_items": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  },
                  "description": "What to prepare for"
                },
                "meeting_date": {
                  "type": "string",
                  "format": "date-time",
                  "description": "When the meeting occurs"
                },
                "meeting_title": {
                  "type": "string",
                  "description": "Meeting name"
                }
              }
            },
            "fsm": {},
            "created_at": "2025-11-04T23:25:09.400439+00:00",
            "updated_at": "2025-11-04T23:33:57.928788+00:00",
            "inheritance_chain": []
          },
          {
            "id": "3d84ab9c-8972-4798-9a48-b957e28f13af",
            "scope": "goal",
            "type_key": "goal.metric",
            "name": "Metric Goal",
            "status": "active",
            "metadata": {
              "realm": "goals",
              "usage": "Reach revenue target, gain followers, write X words",
              "category": "Metrics & KPIs",
              "goal_type": "metric",
              "description": "Goals focused on achieving specific numeric targets",
              "measurement_type": "Numeric target"
            },
            "facet_defaults": {},
            "default_props": {},
            "default_views": [],
            "schema": {
              "type": "object",
              "required": [
                "metric_name",
                "target_value",
                "unit"
              ],
              "properties": {
                "unit": {
                  "type": "string",
                  "description": "Unit of measurement (pages, users, $, etc.)"
                },
                "data_points": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "date": {
                        "type": "string",
                        "format": "date"
                      },
                      "value": {
                        "type": "number"
                      }
                    }
                  },
                  "description": "Historical measurements"
                },
                "metric_name": {
                  "type": "string",
                  "description": "Name of the metric"
                },
                "target_value": {
                  "type": "number",
                  "description": "Goal value"
                },
                "current_value": {
                  "type": "number",
                  "description": "Starting value"
                },
                "measurement_frequency": {
                  "enum": [
                    "daily",
                    "weekly",
                    "monthly"
                  ],
                  "type": "string",
                  "description": "How often to measure"
                }
              }
            },
            "fsm": {},
            "created_at": "2025-11-04T23:25:09.400439+00:00",
            "updated_at": "2025-11-04T23:33:57.928788+00:00",
            "inheritance_chain": []
          },
          {
            "id": "0f106bee-c61e-4835-b9fd-68522b7232ff",
            "scope": "task",
            "type_key": "task.milestone",
            "name": "Milestone",
            "status": "active",
            "metadata": {
              "realm": "productivity",
              "usage": "Major deliverables, phase completions, releases",
              "category": "Milestones",
              "description": "Critical project milestones with deliverables",
              "is_milestone": true
            },
            "facet_defaults": {
              "scale": "medium"
            },
            "default_props": {},
            "default_views": [],
            "schema": {
              "type": "object",
              "properties": {
                "stakeholders": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  },
                  "description": "People involved or affected"
                },
                "acceptance_notes": {
                  "type": "string",
                  "description": "Notes from stakeholder review"
                },
                "success_criteria": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  },
                  "description": "Criteria for completion"
                },
                "deliverable_output_id": {
                  "type": "string",
                  "format": "uuid",
                  "description": "Associated deliverable"
                }
              }
            },
            "fsm": {
              "states": [
                "planned",
                "in_progress",
                "delivered",
                "accepted",
                "rejected"
              ],
              "type_key": "task.milestone",
              "transitions": [
                {
                  "to": "in_progress",
                  "from": "planned",
                  "event": "start",
                  "description": "Begin milestone work"
                },
                {
                  "to": "delivered",
                  "from": "in_progress",
                  "event": "deliver",
                  "actions": [
                    {
                      "type": "notify",
                      "message": "Milestone delivered for review"
                    }
                  ],
                  "description": "Submit for review"
                },
                {
                  "to": "accepted",
                  "from": "delivered",
                  "event": "accept",
                  "description": "Stakeholder accepts milestone"
                },
                {
                  "to": "rejected",
                  "from": "delivered",
                  "event": "reject",
                  "description": "Stakeholder requests changes"
                },
                {
                  "to": "in_progress",
                  "from": "rejected",
                  "event": "rework",
                  "description": "Address feedback and revise"
                }
              ]
            },
            "created_at": "2025-11-04T23:25:09.400439+00:00",
            "updated_at": "2025-11-04T23:33:57.928788+00:00",
            "inheritance_chain": []
          },
          {
            "id": "9e152100-b702-4b72-af34-3171c7240d85",
            "scope": "output",
            "type_key": "output.newsletter",
            "name": "Newsletter Edition",
            "status": "active",
            "metadata": {
              "primitive": "TEXT_DOCUMENT",
              "description": "Newsletter editions for email marketing campaigns",
              "output_type": "content",
              "typical_use_by": [
                "marketer",
                "writer",
                "content-creator",
                "founder"
              ],
              "can_create_in_buildos": true
            },
            "facet_defaults": {
              "stage": "planning"
            },
            "default_props": {},
            "default_views": [
              {
                "view": "document"
              }
            ],
            "schema": {
              "type": "object",
              "properties": {
                "send_date": {
                  "type": "string",
                  "format": "date"
                },
                "preview_text": {
                  "type": "string",
                  "maxLength": 140
                },
                "subject_line": {
                  "type": "string",
                  "maxLength": 90
                },
                "edition_number": {
                  "type": "number"
                },
                "subscriber_segment": {
                  "type": "string"
                }
              }
            },
            "fsm": {
              "states": [
                "draft",
                "review",
                "scheduled",
                "sent"
              ],
              "type_key": "output.newsletter",
              "transitions": [
                {
                  "to": "review",
                  "from": "draft",
                  "event": "submit"
                },
                {
                  "to": "draft",
                  "from": "review",
                  "event": "request_changes"
                },
                {
                  "to": "scheduled",
                  "from": "review",
                  "event": "schedule"
                },
                {
                  "to": "sent",
                  "from": "scheduled",
                  "event": "send"
                }
              ]
            },
            "created_at": "2025-11-03T22:01:33.116979+00:00",
            "updated_at": "2025-11-03T22:01:33.116979+00:00",
            "inheritance_chain": []
          },
          {
            "id": "95feca21-fd1e-49d3-9156-972fef4c8c74",
            "scope": "document",
            "type_key": "doc.notes",
            "name": "Notes/Research",
            "status": "active",
            "metadata": {
              "output_type": "knowledge"
            },
            "facet_defaults": {},
            "default_props": {},
            "default_views": [
              {
                "view": "document"
              }
            ],
            "schema": {
              "type": "object",
              "properties": {
                "tags": {
                  "type": "array"
                },
                "topic": {
                  "type": "string"
                }
              }
            },
            "fsm": {
              "states": [
                "active",
                "archived"
              ],
              "transitions": [
                {
                  "to": "archived",
                  "from": "active",
                  "event": "archive"
                }
              ]
            },
            "created_at": "2025-11-03T04:48:06.523206+00:00",
            "updated_at": "2025-11-03T04:48:06.523206+00:00",
            "inheritance_chain": []
          },
          {
            "id": "64ea1ca9-d8fe-44bb-980b-c3af3dc066e9",
            "scope": "goal",
            "type_key": "goal.outcome",
            "name": "Outcome Goal",
            "status": "active",
            "metadata": {
              "realm": "goals",
              "usage": "Complete a project, launch a product, publish a book",
              "category": "Outcomes",
              "goal_type": "outcome",
              "description": "Goals focused on achieving specific outcomes",
              "measurement_type": "Binary completion"
            },
            "facet_defaults": {},
            "default_props": {},
            "default_views": [],
            "schema": {
              "type": "object",
              "required": [
                "desired_outcome"
              ],
              "properties": {
                "obstacles": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  },
                  "description": "Known challenges"
                },
                "action_plan": {
                  "type": "string",
                  "description": "Steps to achieve outcome"
                },
                "current_state": {
                  "type": "string",
                  "description": "Where you are now"
                },
                "desired_outcome": {
                  "type": "string",
                  "description": "Specific result to achieve"
                }
              }
            },
            "fsm": {},
            "created_at": "2025-11-04T23:25:09.400439+00:00",
            "updated_at": "2025-11-04T23:33:57.928788+00:00",
            "inheritance_chain": []
          },
          {
            "id": "c8a203be-80ec-4de0-865b-0e0eb8240ff2",
            "scope": "project",
            "type_key": "personal.goal",
            "name": "Personal Goal",
            "status": "active",
            "metadata": {
              "realm": "personal_dev",
              "output_type": "process",
              "typical_scale": "medium"
            },
            "facet_defaults": {
              "scale": "medium",
              "stage": "planning",
              "context": "personal"
            },
            "default_props": {},
            "default_views": [
              {
                "view": "list",
                "sort_by": "target_date"
              }
            ],
            "schema": {
              "type": "object",
              "properties": {
                "measurement": {
                  "type": "string"
                },
                "target_date": {
                  "type": "string",
                  "format": "date"
                },
                "goal_description": {
                  "type": "string"
                }
              }
            },
            "fsm": {
              "states": [
                "planning",
                "active",
                "achieved",
                "abandoned"
              ],
              "transitions": [
                {
                  "to": "active",
                  "from": "planning",
                  "event": "commit"
                },
                {
                  "to": "achieved",
                  "from": "active",
                  "event": "complete"
                },
                {
                  "to": "abandoned",
                  "from": "active",
                  "event": "abandon"
                }
              ]
            },
            "created_at": "2025-11-03T04:48:06.523206+00:00",
            "updated_at": "2025-11-03T04:48:06.523206+00:00",
            "inheritance_chain": []
          },
          {
            "id": "db3ec12d-dff4-47ba-9892-260ea0e9090b",
            "scope": "project",
            "type_key": "founder.product",
            "name": "Product Launch",
            "status": "active",
            "metadata": {
              "realm": "business",
              "output_type": "software",
              "typical_scale": "large"
            },
            "facet_defaults": {
              "scale": "large",
              "stage": "planning",
              "context": "commercial"
            },
            "default_props": {},
            "default_views": [
              {
                "view": "pipeline",
                "group_by": "state_key"
              }
            ],
            "schema": {
              "type": "object",
              "properties": {
                "product_name": {
                  "type": "string"
                },
                "pricing_model": {
                  "type": "string"
                },
                "target_customers": {
                  "type": "string"
                }
              }
            },
            "fsm": {
              "states": [
                "concept",
                "development",
                "beta",
                "launched"
              ],
              "transitions": [
                {
                  "to": "development",
                  "from": "concept",
                  "event": "greenlight"
                },
                {
                  "to": "beta",
                  "from": "development",
                  "event": "beta_launch"
                },
                {
                  "to": "launched",
                  "from": "beta",
                  "event": "public_launch"
                }
              ]
            },
            "created_at": "2025-11-03T04:48:06.523206+00:00",
            "updated_at": "2025-11-03T04:48:06.523206+00:00",
            "inheritance_chain": []
          },
          {
            "id": "d8a4232d-5d5a-4553-8852-4398ff01a554",
            "scope": "plan",
            "type_key": "plan.product_roadmap",
            "name": "Product Roadmap",
            "status": "active",
            "metadata": {
              "usage": "Product strategy, feature planning, release scheduling",
              "description": "Long-term product development plan",
              "typical_use_by": [
                "founder",
                "developer",
                "product-manager"
              ]
            },
            "facet_defaults": {
              "scale": "large",
              "stage": "planning"
            },
            "default_props": {},
            "default_views": [],
            "schema": {
              "type": "object",
              "properties": {
                "quarters": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "themes": {
                        "type": "array",
                        "items": {
                          "type": "string"
                        }
                      },
                      "quarter": {
                        "type": "string"
                      }
                    }
                  },
                  "description": "Quarterly themes"
                },
                "product_name": {
                  "type": "string",
                  "description": "Product name"
                },
                "major_features": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  },
                  "description": "Planned major features"
                }
              }
            },
            "fsm": {
              "states": [
                "draft",
                "approved",
                "in_progress",
                "complete"
              ],
              "type_key": "plan.product_roadmap",
              "transitions": [
                {
                  "to": "approved",
                  "from": "draft",
                  "event": "approve"
                },
                {
                  "to": "in_progress",
                  "from": "approved",
                  "event": "start_execution"
                },
                {
                  "to": "complete",
                  "from": "in_progress",
                  "event": "finish"
                }
              ]
            },
            "created_at": "2025-11-04T23:25:09.400439+00:00",
            "updated_at": "2025-11-04T23:25:09.400439+00:00",
            "inheritance_chain": []
          },
          {
            "id": "70ba5521-b9db-402c-92ca-709068f74a48",
            "scope": "document",
            "type_key": "doc.brief",
            "name": "Project Brief",
            "status": "active",
            "metadata": {
              "output_type": "knowledge"
            },
            "facet_defaults": {},
            "default_props": {},
            "default_views": [
              {
                "view": "document"
              }
            ],
            "schema": {
              "type": "object",
              "properties": {
                "purpose": {
                  "type": "string"
                },
                "audience": {
                  "type": "string"
                }
              }
            },
            "fsm": {
              "states": [
                "draft",
                "review",
                "approved"
              ],
              "transitions": [
                {
                  "to": "review",
                  "from": "draft",
                  "event": "submit"
                },
                {
                  "to": "approved",
                  "from": "review",
                  "event": "approve"
                }
              ]
            },
            "created_at": "2025-11-03T04:48:06.523206+00:00",
            "updated_at": "2025-11-03T04:48:06.523206+00:00",
            "inheritance_chain": []
          },
          {
            "id": "322f3f1f-5cda-4e95-a30a-1adbbaf5b817",
            "scope": "task",
            "type_key": "task.quick",
            "name": "Quick Task",
            "status": "active",
            "metadata": {
              "realm": "productivity",
              "usage": "Short tasks, quick wins, simple todos",
              "category": "Quick Actions",
              "description": "Simple one-step tasks that can be done quickly",
              "typical_duration": "5-30 minutes"
            },
            "facet_defaults": {
              "scale": "micro"
            },
            "default_props": {
              "estimated_duration_minutes": 15
            },
            "default_views": [],
            "schema": {
              "type": "object",
              "properties": {
                "is_urgent": {
                  "type": "boolean",
                  "default": false,
                  "description": "Requires immediate attention"
                }
              }
            },
            "fsm": {
              "states": [
                "todo",
                "done"
              ],
              "type_key": "task.quick",
              "transitions": [
                {
                  "to": "done",
                  "from": "todo",
                  "event": "complete",
                  "description": "Mark as done"
                }
              ]
            },
            "created_at": "2025-11-04T23:25:09.400439+00:00",
            "updated_at": "2025-11-04T23:33:57.928788+00:00",
            "inheritance_chain": []
          },
          {
            "id": "b3bec393-ddf3-4aaa-9196-f76d192d2a95",
            "scope": "task",
            "type_key": "task.recurring",
            "name": "Recurring Task",
            "status": "active",
            "metadata": {
              "realm": "productivity",
              "usage": "Daily routines, weekly reviews, monthly reports",
              "category": "Recurring Tasks",
              "description": "Tasks that repeat on a schedule",
              "supports_recurrence": true
            },
            "facet_defaults": {
              "scale": "micro"
            },
            "default_props": {
              "recurrence_rule": "FREQ=WEEKLY;BYDAY=MO",
              "estimated_duration_minutes": 30
            },
            "default_views": [],
            "schema": {
              "type": "object",
              "required": [
                "recurrence_rule"
              ],
              "properties": {
                "skip_count": {
                  "type": "number",
                  "default": 0,
                  "description": "Number of skipped occurrences"
                },
                "recurrence_ends": {
                  "type": "string",
                  "format": "date",
                  "description": "When recurrence stops"
                },
                "recurrence_rule": {
                  "type": "string",
                  "pattern": "^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)",
                  "description": "RRULE format (RFC 5545)"
                },
                "completion_history": {
                  "type": "array",
                  "items": {
                    "type": "string",
                    "format": "date-time"
                  },
                  "description": "Dates when task was completed"
                }
              }
            },
            "fsm": {
              "states": [
                "active",
                "paused",
                "completed_instance",
                "ended"
              ],
              "type_key": "task.recurring",
              "transitions": [
                {
                  "to": "paused",
                  "from": "active",
                  "event": "pause",
                  "description": "Temporarily stop recurrence"
                },
                {
                  "to": "active",
                  "from": "paused",
                  "event": "resume",
                  "description": "Resume recurrence"
                },
                {
                  "to": "completed_instance",
                  "from": "active",
                  "event": "complete_instance",
                  "actions": [
                    {
                      "type": "schedule_next_occurrence",
                      "description": "Create next task instance"
                    }
                  ],
                  "description": "Mark this occurrence as done"
                },
                {
                  "to": "ended",
                  "from": "active",
                  "event": "end_recurrence",
                  "description": "Stop all future occurrences"
                }
              ]
            },
            "created_at": "2025-11-04T23:25:09.400439+00:00",
            "updated_at": "2025-11-04T23:33:57.928788+00:00",
            "inheritance_chain": []
          },
          {
            "id": "2a9a1aa2-bc89-4f36-88cb-614d80ebfcfc",
            "scope": "task",
            "type_key": "task.research",
            "name": "Research Task",
            "status": "active",
            "metadata": {
              "realm": "productivity",
              "usage": "Market research, literature review, technical investigation",
              "category": "Research & Analysis",
              "description": "Information gathering and investigation tasks"
            },
            "facet_defaults": {
              "scale": "small"
            },
            "default_props": {
              "estimated_duration_minutes": 60
            },
            "default_views": [],
            "schema": {
              "type": "object",
              "properties": {
                "sources": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  },
                  "description": "Sources to investigate"
                },
                "findings": {
                  "type": "string",
                  "description": "Summary of findings"
                },
                "research_question": {
                  "type": "string",
                  "description": "What needs to be discovered"
                }
              }
            },
            "fsm": {},
            "created_at": "2025-11-04T23:25:09.400439+00:00",
            "updated_at": "2025-11-04T23:33:57.928788+00:00",
            "inheritance_chain": []
          },
          {
            "id": "73f86c10-6e16-4489-a0d5-06fd9766c815",
            "scope": "task",
            "type_key": "task.review",
            "name": "Review Task",
            "status": "active",
            "metadata": {
              "realm": "productivity",
              "usage": "Code review, content editing, design feedback",
              "category": "Research & Analysis",
              "description": "Reviewing and providing feedback on work"
            },
            "facet_defaults": {
              "scale": "small"
            },
            "default_props": {
              "estimated_duration_minutes": 45
            },
            "default_views": [],
            "schema": {
              "type": "object",
              "properties": {
                "approved": {
                  "type": "boolean",
                  "description": "Whether item passes review"
                },
                "feedback": {
                  "type": "string",
                  "description": "Review feedback"
                },
                "item_to_review": {
                  "type": "string",
                  "description": "What is being reviewed"
                },
                "review_criteria": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  },
                  "description": "What to check for"
                }
              }
            },
            "fsm": {},
            "created_at": "2025-11-04T23:25:09.400439+00:00",
            "updated_at": "2025-11-04T23:33:57.928788+00:00",
            "inheritance_chain": []
          },
          {
            "id": "9adba2d0-8a00-4b5e-a04d-1b759af40a65",
            "scope": "plan",
            "type_key": "plan.sprint",
            "name": "Sprint (2 weeks)",
            "status": "active",
            "metadata": {
              "typical_scale": "small"
            },
            "facet_defaults": {
              "scale": "small",
              "stage": "execution"
            },
            "default_props": {},
            "default_views": [
              {
                "view": "kanban",
                "group_by": "state_key"
              }
            ],
            "schema": {
              "type": "object",
              "properties": {
                "capacity": {
                  "type": "number"
                },
                "sprint_goal": {
                  "type": "string"
                },
                "sprint_number": {
                  "type": "integer"
                }
              }
            },
            "fsm": {
              "states": [
                "planning",
                "active",
                "review",
                "complete"
              ],
              "transitions": [
                {
                  "to": "active",
                  "from": "planning",
                  "event": "start_sprint"
                },
                {
                  "to": "review",
                  "from": "active",
                  "event": "sprint_end"
                },
                {
                  "to": "complete",
                  "from": "review",
                  "event": "retrospective_done"
                }
              ]
            },
            "created_at": "2025-11-03T04:48:06.523206+00:00",
            "updated_at": "2025-11-03T04:48:06.523206+00:00",
            "inheritance_chain": []
          },
          {
            "id": "b4107b15-46b4-4cd0-8fc1-44bcd150b967",
            "scope": "project",
            "type_key": "founder.startup",
            "name": "Startup Launch",
            "status": "active",
            "metadata": {
              "realm": "business",
              "keywords": [
                "startup",
                "founder",
                "entrepreneur",
                "company",
                "business",
                "venture",
                "product-market-fit",
                "fundraising"
              ],
              "output_type": "relationship",
              "typical_scale": "epic"
            },
            "facet_defaults": {
              "scale": "epic",
              "stage": "discovery",
              "context": "startup"
            },
            "default_props": {
              "default_funding_stage": "bootstrapped"
            },
            "default_views": [
              {
                "view": "pipeline",
                "group_by": "state_key"
              },
              {
                "view": "kanban",
                "group_by": "state_key"
              }
            ],
            "schema": {
              "type": "object",
              "properties": {
                "mrr": {
                  "type": "number",
                  "minimum": 0
                },
                "company_name": {
                  "type": "string"
                },
                "mvp_complete": {
                  "type": "boolean",
                  "default": false
                },
                "funding_stage": {
                  "enum": [
                    "bootstrapped",
                    "pre-seed",
                    "seed",
                    "series-a"
                  ],
                  "type": "string"
                },
                "target_market": {
                  "type": "string"
                },
                "customer_count": {
                  "type": "number",
                  "minimum": 0
                },
                "value_proposition": {
                  "type": "string"
                },
                "first_customer_date": {
                  "type": "string",
                  "format": "date"
                }
              }
            },
            "fsm": {
              "states": [
                "ideation",
                "building",
                "launching",
                "growth"
              ],
              "type_key": "founder.startup",
              "transitions": [
                {
                  "to": "building",
                  "from": "ideation",
                  "event": "start_building",
                  "guards": [
                    {
                      "path": "props.company_name",
                      "type": "has_property"
                    },
                    {
                      "path": "props.target_market",
                      "type": "has_property"
                    },
                    {
                      "path": "props.value_proposition",
                      "type": "has_property"
                    }
                  ],
                  "actions": [
                    {
                      "type": "spawn_tasks",
                      "titles": [
                        "Define MVP features",
                        "Build core product",
                        "Set up development environment",
                        "Create landing page",
                        "Design user onboarding flow"
                      ],
                      "props_template": {
                        "facets": {
                          "scale": "large"
                        }
                      }
                    },
                    {
                      "type": "update_facets",
                      "facets": {
                        "stage": "execution"
                      }
                    },
                    {
                      "type": "notify",
                      "message": "Building phase started! Time to create your MVP."
                    }
                  ]
                },
                {
                  "to": "launching",
                  "from": "building",
                  "event": "launch",
                  "guards": [
                    {
                      "path": "props.mvp_complete",
                      "type": "has_property"
                    }
                  ],
                  "actions": [
                    {
                      "type": "spawn_tasks",
                      "titles": [
                        "Create launch plan",
                        "Set up analytics",
                        "Prepare marketing materials",
                        "Reach out to beta users",
                        "Launch on Product Hunt"
                      ],
                      "props_template": {
                        "facets": {
                          "scale": "medium"
                        }
                      }
                    },
                    {
                      "name": "Launch Plan",
                      "type": "create_output",
                      "props": {
                        "stage": "planning"
                      },
                      "type_key": "output.launch_plan"
                    },
                    {
                      "type": "update_facets",
                      "facets": {
                        "stage": "launch"
                      }
                    },
                    {
                      "type": "notify",
                      "message": "Launch phase! Time to get your first customers."
                    }
                  ]
                },
                {
                  "to": "growth",
                  "from": "launching",
                  "event": "achieve_pmf",
                  "guards": [
                    {
                      "path": "props.customer_count",
                      "type": "has_property"
                    },
                    {
                      "path": "props.first_customer_date",
                      "type": "has_property"
                    }
                  ],
                  "actions": [
                    {
                      "type": "spawn_tasks",
                      "titles": [
                        "Scale customer acquisition",
                        "Optimize conversion funnel",
                        "Build growth loops",
                        "Hire first team members",
                        "Raise funding"
                      ],
                      "props_template": {
                        "facets": {
                          "scale": "large"
                        }
                      }
                    },
                    {
                      "type": "update_facets",
                      "facets": {
                        "stage": "maintenance"
                      }
                    },
                    {
                      "type": "notify",
                      "message": "Product-market fit achieved! Focus on growth."
                    },
                    {
                      "type": "email_user",
                      "subject": "Congratulations on achieving PMF!",
                      "body_template": "Your startup has reached product-market fit. Time to scale!"
                    }
                  ]
                },
                {
                  "to": "ideation",
                  "from": "building",
                  "event": "pivot",
                  "actions": [
                    {
                      "type": "update_facets",
                      "facets": {
                        "stage": "discovery"
                      }
                    },
                    {
                      "type": "notify",
                      "message": "Pivoting! Time to rethink your approach."
                    }
                  ]
                }
              ]
            },
            "created_at": "2025-11-03T04:48:06.523206+00:00",
            "updated_at": "2025-11-03T04:48:06.523206+00:00",
            "inheritance_chain": []
          },
          {
            "id": "b48ef55a-1875-4ffc-b25c-34372325d80d",
            "scope": "project",
            "type_key": "student.project",
            "name": "Student Project",
            "status": "active",
            "metadata": {
              "realm": "education",
              "output_type": "knowledge",
              "typical_scale": "medium"
            },
            "facet_defaults": {
              "scale": "medium",
              "stage": "discovery",
              "context": "academic"
            },
            "default_props": {},
            "default_views": [
              {
                "view": "pipeline",
                "group_by": "state_key"
              }
            ],
            "schema": {
              "type": "object",
              "properties": {
                "subject": {
                  "type": "string"
                },
                "project_title": {
                  "type": "string"
                },
                "presentation_date": {
                  "type": "string",
                  "format": "date"
                }
              }
            },
            "fsm": {
              "states": [
                "assigned",
                "research",
                "building",
                "presenting",
                "complete"
              ],
              "transitions": [
                {
                  "to": "research",
                  "from": "assigned",
                  "event": "start_research"
                },
                {
                  "to": "building",
                  "from": "research",
                  "event": "start_building"
                },
                {
                  "to": "presenting",
                  "from": "building",
                  "event": "present"
                },
                {
                  "to": "complete",
                  "from": "presenting",
                  "event": "grade_received"
                }
              ]
            },
            "created_at": "2025-11-03T04:48:06.523206+00:00",
            "updated_at": "2025-11-03T04:48:06.523206+00:00",
            "inheritance_chain": []
          },
          {
            "id": "0bfe2e28-71bc-4a90-94f2-60ce73083a4d",
            "scope": "output",
            "type_key": "output.document",
            "name": "Text Document",
            "status": "active",
            "metadata": {
              "primitive": "TEXT_DOCUMENT",
              "description": "Base template for all text documents that can be created and edited in BuildOS",
              "output_type": "content",
              "can_create_in_buildos": true
            },
            "facet_defaults": {
              "stage": "planning"
            },
            "default_props": {
              "content": "",
              "word_count": 0,
              "content_type": "html"
            },
            "default_views": [
              {
                "view": "document"
              }
            ],
            "schema": {
              "type": "object",
              "required": [
                "title"
              ],
              "properties": {
                "title": {
                  "type": "string"
                },
                "content": {
                  "type": "string"
                },
                "word_count": {
                  "type": "number",
                  "default": 0,
                  "minimum": 0
                },
                "author_notes": {
                  "type": "string"
                },
                "content_type": {
                  "enum": [
                    "html",
                    "markdown"
                  ],
                  "type": "string",
                  "default": "html"
                }
              }
            },
            "fsm": {
              "states": [
                "draft",
                "review",
                "approved",
                "published"
              ],
              "type_key": "output.document",
              "transitions": [
                {
                  "to": "review",
                  "from": "draft",
                  "event": "submit"
                },
                {
                  "to": "draft",
                  "from": "review",
                  "event": "request_changes"
                },
                {
                  "to": "approved",
                  "from": "review",
                  "event": "approve"
                },
                {
                  "to": "published",
                  "from": "approved",
                  "event": "publish"
                }
              ]
            },
            "created_at": "2025-11-03T22:01:33.116979+00:00",
            "updated_at": "2025-11-03T22:01:33.116979+00:00",
            "inheritance_chain": []
          },
          {
            "id": "94e3581b-5568-4619-9c95-7753b5293648",
            "scope": "plan",
            "type_key": "plan.weekly",
            "name": "Weekly Plan",
            "status": "active",
            "metadata": {
              "typical_scale": "micro"
            },
            "facet_defaults": {
              "scale": "micro",
              "stage": "execution"
            },
            "default_props": {},
            "default_views": [
              {
                "view": "calendar",
                "group_by": "day"
              }
            ],
            "schema": {
              "type": "object",
              "properties": {
                "focus_areas": {
                  "type": "array"
                },
                "week_starting": {
                  "type": "string",
                  "format": "date"
                }
              }
            },
            "fsm": {
              "states": [
                "planning",
                "active",
                "review",
                "complete"
              ],
              "transitions": [
                {
                  "to": "active",
                  "from": "planning",
                  "event": "start_week"
                },
                {
                  "to": "review",
                  "from": "active",
                  "event": "week_end"
                },
                {
                  "to": "complete",
                  "from": "review",
                  "event": "archive"
                }
              ]
            },
            "created_at": "2025-11-03T04:48:06.523206+00:00",
            "updated_at": "2025-11-03T04:48:06.523206+00:00",
            "inheritance_chain": []
          },
          {
            "id": "687bd867-bcc5-450f-86a2-426a9238a209",
            "scope": "output",
            "type_key": "output.whitepaper",
            "name": "Whitepaper",
            "status": "active",
            "metadata": {
              "primitive": "TEXT_DOCUMENT",
              "description": "Long-form thought leadership and research papers",
              "output_type": "knowledge",
              "typical_use_by": [
                "marketer",
                "researcher",
                "consultant",
                "founder"
              ],
              "can_create_in_buildos": true
            },
            "facet_defaults": {
              "stage": "planning"
            },
            "default_props": {
              "data_sources": [],
              "key_findings": [],
              "target_word_count": 3000
            },
            "default_views": [
              {
                "view": "document"
              }
            ],
            "schema": {
              "type": "object",
              "properties": {
                "abstract": {
                  "type": "string",
                  "maxLength": 500
                },
                "data_sources": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                },
                "key_findings": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                },
                "target_audience": {
                  "type": "string"
                },
                "target_word_count": {
                  "type": "number",
                  "minimum": 2000
                }
              }
            },
            "fsm": {
              "states": [
                "draft",
                "review",
                "approved",
                "published"
              ],
              "type_key": "output.whitepaper",
              "transitions": [
                {
                  "to": "review",
                  "from": "draft",
                  "event": "submit"
                },
                {
                  "to": "draft",
                  "from": "review",
                  "event": "request_changes"
                },
                {
                  "to": "approved",
                  "from": "review",
                  "event": "approve"
                },
                {
                  "to": "published",
                  "from": "approved",
                  "event": "publish"
                }
              ]
            },
            "created_at": "2025-11-03T22:01:33.116979+00:00",
            "updated_at": "2025-11-03T22:01:33.116979+00:00",
            "inheritance_chain": []
          },
          {
            "id": "28ba81c6-4cac-4f5d-9c7c-e01cdbcfebc4",
            "scope": "output",
            "type_key": "output.workout_plan",
            "name": "Workout Plan",
            "status": "active",
            "metadata": {
              "output_type": "knowledge"
            },
            "facet_defaults": {
              "stage": "planning"
            },
            "default_props": {},
            "default_views": [
              {
                "view": "pipeline",
                "group_by": "state_key"
              }
            ],
            "schema": {
              "type": "object",
              "properties": {
                "split": {
                  "type": "string"
                },
                "weeks": {
                  "type": "integer"
                },
                "equipment": {
                  "type": "array"
                }
              }
            },
            "fsm": {
              "states": [
                "draft",
                "review",
                "active",
                "completed"
              ],
              "transitions": [
                {
                  "to": "review",
                  "from": "draft",
                  "event": "submit"
                },
                {
                  "to": "active",
                  "from": "review",
                  "event": "approve"
                },
                {
                  "to": "completed",
                  "from": "active",
                  "event": "complete"
                }
              ]
            },
            "created_at": "2025-11-03T04:48:06.523206+00:00",
            "updated_at": "2025-11-03T04:48:06.523206+00:00",
            "inheritance_chain": []
          }
        ],
        "count": 44,
        "message": "Found 44 templates."
      },
      "planId": "c53392ff-deaf-4aee-ac20-95f33a5f6813",
      "stepNumber": 2,
      "contextType": "project_create"
    }
  },
  "result": {
    "toolResults": [
      {
        "tool": "create_onto_project",
        "result": {
          "project_id": "0ca9ea9e-dd8b-4fc8-8470-7043150ada44",
          "counts": {
            "goals": 2,
            "requirements": 2,
            "plans": 1,
            "tasks": 2,
            "outputs": 1,
            "documents": 1,
            "edges": 12
          },
          "message": "Created project \"New Ontology Project\" (ID: 0ca9ea9e-dd8b-4fc8-8470-7043150ada44) with 2 goals, 2 requirements, 1 plans, 2 tasks, 1 outputs, 1 documents, 12 edges",
          "context_shift": {
            "new_context": "project",
            "entity_id": "0ca9ea9e-dd8b-4fc8-8470-7043150ada44",
            "entity_name": "New Ontology Project",
            "entity_type": "project"
          }
        }
      }
    ]
  },
  "toolCallsMade": 1,
  "tokensUsed": 24582
}
```

## Token Estimates

- **System Prompt:** ~42 tokens
- **User Prompt:** ~30114 tokens
- **Total Estimate:** ~30156 tokens

---

_This file is automatically generated in development mode for prompt auditing purposes._
