# Utilities API

**Base Paths:** `/api/search`, `/api/feedback`, `/api/notifications`, `/api/templates`, `/api/analytics`

The Utilities API provides supporting functionality including search, user feedback, notifications, templates, and client-side analytics.

---

## Table of Contents

1. [Search](#search)
2. [Feedback & Support](#feedback--support)
3. [Notifications](#notifications)
4. [Templates](#templates)
5. [Analytics & Tracking](#analytics--tracking)
6. [File Upload](#file-upload)

---

## Search

### 1. `GET /api/search` - Global Search

**Purpose:** Search across all user content (projects, tasks, brain dumps, notes).

**File:** `src/routes/api/search/+server.ts`

**Authentication:** Required (session-based)

#### Query Parameters

| Parameter | Type                                                         | Required | Description                             |
| --------- | ------------------------------------------------------------ | -------- | --------------------------------------- |
| `q`       | `string`                                                     | Yes      | Search query                            |
| `type`    | `'all' \| 'projects' \| 'tasks' \| 'brain_dumps' \| 'notes'` | No       | Filter by content type (default: 'all') |
| `limit`   | `number`                                                     | No       | Max results per type (default: 10)      |
| `offset`  | `number`                                                     | No       | Pagination offset                       |

#### Response: `ApiResponse<{ results: SearchResults }>`

```typescript
{
  success: true,
  data: {
    results: {
      // Project results
      projects: [
        {
          id: "uuid",
          name: "BuildOS Platform",
          description: "AI-powered productivity platform",
          match_score: 0.95,
          matched_fields: ["name", "description"],
          highlight: "...AI-powered <em>productivity</em> platform..."
        }
      ],

      // Task results
      tasks: [
        {
          id: "uuid",
          title: "Implement search functionality",
          project_name: "BuildOS Platform",
          match_score: 0.88,
          matched_fields: ["title"],
          highlight: "Implement <em>search</em> functionality"
        }
      ],

      // Brain dump results
      brain_dumps: [
        {
          id: "uuid",
          content: "Need to build a search feature...",
          project_name: "BuildOS Platform",
          match_score: 0.82,
          matched_fields: ["content"],
          highlight: "...build a <em>search</em> feature..."
        }
      ],

      // Note results
      notes: [
        {
          id: "uuid",
          content: "Meeting notes about search UX",
          project_name: "BuildOS Platform",
          match_score: 0.75,
          matched_fields: ["content"],
          highlight: "Meeting notes about <em>search</em> UX"
        }
      ],

      // Metadata
      total_results: 15,
      query: "search",
      execution_time_ms: 45
    }
  }
}
```

#### Search Features

- **Full-text search**: Searches across all text fields
- **Relevance ranking**: Results sorted by match score
- **Highlighting**: Matched terms highlighted in results
- **Fuzzy matching**: Handles typos and variations
- **Stop words**: Common words filtered out
- **Recent bias**: Recent content ranked higher

---

### 2. `GET /api/search/suggestions` - Search Suggestions

**Purpose:** Get autocomplete suggestions for search queries.

**File:** `src/routes/api/search/suggestions/+server.ts`

**Authentication:** Required (session-based)

#### Query Parameters

| Parameter | Type     | Required | Description                  |
| --------- | -------- | -------- | ---------------------------- |
| `q`       | `string` | Yes      | Partial search query         |
| `limit`   | `number` | No       | Max suggestions (default: 5) |

#### Response: `ApiResponse<{ suggestions: Suggestion[] }>`

```typescript
{
  success: true,
  data: {
    suggestions: [
      {
        text: "productivity tools",
        type: "recent",  // "recent" | "popular" | "completion"
        score: 0.95
      },
      {
        text: "product roadmap",
        type: "completion",
        score: 0.82
      }
    ]
  }
}
```

---

### 3. `GET /api/search/recent` - Recent Searches

**Purpose:** Get user's recent search queries.

**File:** `src/routes/api/search/recent/+server.ts`

**Authentication:** Required (session-based)

#### Query Parameters

| Parameter | Type     | Required | Description               |
| --------- | -------- | -------- | ------------------------- |
| `limit`   | `number` | No       | Max results (default: 10) |

#### Response: `ApiResponse<{ recent_searches: RecentSearch[] }>`

```typescript
{
  success: true,
  data: {
    recent_searches: [
      {
        query: "authentication",
        searched_at: "2025-01-15T10:00:00Z",
        results_count: 12
      },
      {
        query: "calendar sync",
        searched_at: "2025-01-14T15:30:00Z",
        results_count: 8
      }
    ]
  }
}
```

---

## Feedback & Support

### 4. `POST /api/feedback` - Submit Feedback

**Purpose:** Submit user feedback, bug reports, or feature requests.

**File:** `src/routes/api/feedback/+server.ts`

**Authentication:** Required (session-based)

#### Request Body

```typescript
{
  type: 'bug' | 'feature' | 'improvement' | 'other';
  title: string;        // Required, max 200 chars
  description: string;  // Required, max 5000 chars
  category?: string;    // Optional category (e.g., "brain-dump", "calendar")
  priority?: 'low' | 'medium' | 'high';
  metadata?: {
    url?: string;       // Current page URL
    browser?: string;   // Browser info
    screenshot_url?: string;  // Screenshot if available
    [key: string]: any;
  };
}
```

#### Response: `ApiResponse<{ feedback: Feedback }>`

```typescript
{
  success: true,
  data: {
    feedback: {
      id: "uuid",
      type: "bug",
      title: "Calendar sync not working",
      description: "Events not syncing...",
      status: "submitted",
      created_at: "2025-01-15T10:00:00Z"
    }
  },
  message: "Thank you for your feedback! We'll review it shortly."
}
```

#### Side Effects

- Creates feedback record in database
- Sends notification to support team
- Auto-categorizes using AI (if enabled)
- Links to user account for follow-up

---

### 5. `GET /api/feedback` - List User Feedback

**Purpose:** Retrieve feedback submitted by current user.

**File:** `src/routes/api/feedback/+server.ts`

**Authentication:** Required (session-based)

#### Query Parameters

| Parameter | Type                                                                 | Required | Description      |
| --------- | -------------------------------------------------------------------- | -------- | ---------------- |
| `status`  | `'submitted' \| 'reviewing' \| 'planned' \| 'completed' \| 'closed'` | No       | Filter by status |
| `type`    | `'bug' \| 'feature' \| 'improvement' \| 'other'`                     | No       | Filter by type   |

#### Response: `ApiResponse<{ feedback: Feedback[] }>`

```typescript
{
  success: true,
  data: {
    feedback: [
      {
        id: "uuid",
        type: "feature",
        title: "Add dark mode",
        description: "Would love a dark theme option",
        status: "planned",
        created_at: "2025-01-10T10:00:00Z",
        updated_at: "2025-01-12T14:00:00Z",
        admin_response: "Great idea! We're planning this for Q2."
      }
    ]
  }
}
```

---

### 6. `GET /api/feedback/[id]` - Get Feedback Details

**Purpose:** Get details of specific feedback item.

**File:** `src/routes/api/feedback/[id]/+server.ts`

**Authentication:** Required (session-based, user must own feedback)

#### Response: `ApiResponse<{ feedback: FeedbackDetail }>`

```typescript
{
  success: true,
  data: {
    feedback: {
      id: "uuid",
      type: "bug",
      title: "Calendar sync not working",
      description: "Detailed description...",
      status: "completed",
      priority: "high",
      category: "calendar",

      // Response from team
      admin_response: "This has been fixed in version 2.1.0",
      admin_response_at: "2025-01-14T10:00:00Z",

      // Timeline
      timeline: [
        {
          status: "submitted",
          timestamp: "2025-01-10T10:00:00Z"
        },
        {
          status: "reviewing",
          timestamp: "2025-01-11T09:00:00Z",
          note: "Investigating the issue"
        },
        {
          status: "completed",
          timestamp: "2025-01-14T10:00:00Z",
          note: "Fixed in v2.1.0"
        }
      ],

      created_at: "2025-01-10T10:00:00Z",
      updated_at: "2025-01-14T10:00:00Z"
    }
  }
}
```

---

## Notifications

### 7. `GET /api/notifications` - List Notifications

**Purpose:** Retrieve user notifications.

**File:** `src/routes/api/notifications/+server.ts`

**Authentication:** Required (session-based)

#### Query Parameters

| Parameter     | Type      | Required | Description                       |
| ------------- | --------- | -------- | --------------------------------- |
| `unread_only` | `boolean` | No       | Show only unread (default: false) |
| `type`        | `string`  | No       | Filter by notification type       |
| `limit`       | `number`  | No       | Max results (default: 20)         |
| `offset`      | `number`  | No       | Pagination offset                 |

#### Response: `ApiResponse<{ notifications: Notification[], unread_count: number }>`

```typescript
{
  success: true,
  data: {
    notifications: [
      {
        id: "uuid",
        type: "task_completed",
        title: "Task completed",
        message: "Your task 'Implement auth' was completed",
        read: false,
        data: {
          task_id: "uuid",
          project_id: "uuid"
        },
        created_at: "2025-01-15T10:00:00Z"
      },
      {
        id: "uuid",
        type: "trial_ending",
        title: "Trial ending soon",
        message: "Your trial ends in 3 days",
        read: false,
        data: {
          days_remaining: 3
        },
        created_at: "2025-01-14T09:00:00Z"
      }
    ],
    unread_count: 5
  }
}
```

---

### 8. `PATCH /api/notifications/[id]/read` - Mark as Read

**Purpose:** Mark notification as read.

**File:** `src/routes/api/notifications/[id]/read/+server.ts`

**Authentication:** Required (session-based)

#### Response: `ApiResponse<{ notification: Notification }>`

```typescript
{
  success: true,
  data: {
    notification: {
      id: "uuid",
      read: true,
      read_at: "2025-01-15T10:00:00Z"
    }
  }
}
```

---

### 9. `POST /api/notifications/mark-all-read` - Mark All as Read

**Purpose:** Mark all notifications as read.

**File:** `src/routes/api/notifications/mark-all-read/+server.ts`

**Authentication:** Required (session-based)

#### Response: `ApiResponse<{ marked_count: number }>`

```typescript
{
  success: true,
  data: {
    marked_count: 12
  },
  message: "All notifications marked as read"
}
```

---

### 10. `GET /api/notifications/preferences` - Get Notification Preferences

**Purpose:** Retrieve user notification preferences.

**File:** `src/routes/api/notifications/preferences/+server.ts`

**Authentication:** Required (session-based)

#### Response: `ApiResponse<{ preferences: NotificationPreferences }>`

```typescript
{
  success: true,
  data: {
    preferences: {
      // Email notifications
      email: {
        task_reminders: true,
        daily_brief: true,
        project_updates: true,
        marketing: false
      },

      // Push notifications
      push: {
        task_completed: true,
        task_assigned: true,
        phase_completed: true
      },

      // In-app notifications
      in_app: {
        all: true
      },

      // Digest settings
      digest: {
        enabled: true,
        frequency: "daily",  // "daily" | "weekly"
        time: "09:00",
        timezone: "America/New_York"
      }
    }
  }
}
```

---

### 11. `PATCH /api/notifications/preferences` - Update Preferences

**Purpose:** Update notification preferences.

**File:** `src/routes/api/notifications/preferences/+server.ts`

**Authentication:** Required (session-based)

#### Request Body (Partial Updates Supported)

Same structure as GET response, but all fields optional.

#### Response: `ApiResponse<{ preferences: NotificationPreferences }>`

---

## Templates

### 12. `GET /api/templates/projects` - List Project Templates

**Purpose:** Get available project templates.

**File:** `src/routes/api/templates/projects/+server.ts`

**Authentication:** Required (session-based)

#### Query Parameters

| Parameter  | Type     | Required | Description                                        |
| ---------- | -------- | -------- | -------------------------------------------------- |
| `category` | `string` | No       | Filter by category (e.g., "software", "marketing") |

#### Response: `ApiResponse<{ templates: ProjectTemplate[] }>`

```typescript
{
  success: true,
  data: {
    templates: [
      {
        id: "uuid",
        name: "Software Development Project",
        description: "Complete template for software development projects",
        category: "software",
        icon: "code",

        // Template content
        phases: [
          {
            name: "Planning",
            description: "Requirements gathering and planning",
            tasks: [
              {
                title: "Define requirements",
                description: "Create comprehensive requirements document",
                priority: "high",
                estimated_duration: 240
              }
            ]
          },
          {
            name: "Development",
            description: "Build the solution",
            tasks: [...]
          }
        ],

        // Usage stats
        usage_count: 1250,
        rating: 4.8,

        created_at: "2025-01-01T00:00:00Z"
      }
    ]
  }
}
```

---

### 13. `POST /api/templates/projects/[id]/apply` - Apply Template

**Purpose:** Create project from template.

**File:** `src/routes/api/templates/projects/[id]/apply/+server.ts`

**Authentication:** Required (session-based)

#### Request Body

```typescript
{
  project_name: string;
  customize?: {
    start_date?: string;  // ISO date
    schedule_tasks?: boolean;
    calendar_id?: string;
  };
}
```

#### Response: `ApiResponse<{ project: Project }>`

```typescript
{
  success: true,
  data: {
    project: {
      id: "uuid",
      name: "My New Software Project",
      description: "Complete template for software development projects",
      phases: [...],  // All phases from template
      tasks: [...]    // All tasks from template
    }
  },
  message: "Project created from template successfully"
}
```

---

### 14. `GET /api/templates/tasks` - List Task Templates

**Purpose:** Get common task templates.

**File:** `src/routes/api/templates/tasks/+server.ts`

**Authentication:** Required (session-based)

#### Response: `ApiResponse<{ templates: TaskTemplate[] }>`

```typescript
{
  success: true,
  data: {
    templates: [
      {
        id: "uuid",
        title: "Code Review",
        description: "Review pull request for quality and best practices",
        category: "software",
        estimated_duration: 60,
        priority: "medium",
        checklist: [
          "Code follows style guide",
          "Tests are included",
          "Documentation updated"
        ]
      }
    ]
  }
}
```

---

## Analytics & Tracking

### 15. `POST /api/analytics/event` - Track Event

**Purpose:** Track client-side analytics events.

**File:** `src/routes/api/analytics/event/+server.ts`

**Authentication:** Required (session-based)

#### Request Body

```typescript
{
  event_name: string;  // e.g., "brain_dump_started", "task_completed"
  properties?: {
    [key: string]: any;
  };
  timestamp?: string;  // ISO date, defaults to server time
}
```

#### Response: `ApiResponse<{ tracked: true }>`

```typescript
{
  success: true,
  data: { tracked: true }
}
```

#### Common Events

- `brain_dump_started`
- `brain_dump_completed`
- `task_created`
- `task_completed`
- `project_created`
- `phase_generated`
- `calendar_connected`
- `search_performed`

---

### 16. `GET /api/analytics/user-stats` - Get User Statistics

**Purpose:** Get analytics for current user.

**File:** `src/routes/api/analytics/user-stats/+server.ts`

**Authentication:** Required (session-based)

#### Query Parameters

| Parameter | Type                              | Required | Description                  |
| --------- | --------------------------------- | -------- | ---------------------------- |
| `period`  | `'7d' \| '30d' \| '90d' \| 'all'` | No       | Time period (default: '30d') |

#### Response: `ApiResponse<{ stats: UserStats }>`

```typescript
{
  success: true,
  data: {
    stats: {
      // Activity
      total_sessions: 45,
      total_session_time_minutes: 1200,
      average_session_duration_minutes: 26.7,

      // Content created
      projects_created: 5,
      tasks_created: 45,
      brain_dumps_created: 12,
      daily_briefs_generated: 15,

      // Completion
      tasks_completed: 23,
      completion_rate: 0.51,
      average_task_completion_time_hours: 4.5,

      // Engagement
      most_active_day: "Monday",
      most_active_hour: 10,
      feature_usage: {
        brain_dump: 0.8,
        calendar_sync: 0.6,
        daily_briefs: 0.9,
        phase_generation: 0.4
      }
    }
  }
}
```

---

## File Upload

### 17. `POST /api/upload` - Upload File

**Purpose:** Upload files (images, documents, etc.).

**File:** `src/routes/api/upload/+server.ts`

**Authentication:** Required (session-based)

#### Request Body (multipart/form-data)

```typescript
{
  file: File;
  type?: 'avatar' | 'attachment' | 'screenshot';
  metadata?: {
    project_id?: string;
    task_id?: string;
    [key: string]: any;
  };
}
```

#### Response: `ApiResponse<{ file: UploadedFile }>`

```typescript
{
  success: true,
  data: {
    file: {
      id: "uuid",
      filename: "screenshot.png",
      url: "https://storage.example.com/files/uuid.png",
      size_bytes: 245760,
      mime_type: "image/png",
      uploaded_at: "2025-01-15T10:00:00Z"
    }
  }
}
```

#### Validation

- **Max file size**: 10MB
- **Allowed types**: Images (JPEG, PNG, GIF, WebP), Documents (PDF, DOC, DOCX), Text (TXT, MD)
- **Virus scanning**: Files scanned before storage
- **Storage quota**: User storage limits enforced

---

### 18. `DELETE /api/upload/[id]` - Delete File

**Purpose:** Delete uploaded file.

**File:** `src/routes/api/upload/[id]/+server.ts`

**Authentication:** Required (session-based, user must own file)

#### Response: `ApiResponse<{ deleted: true }>`

```typescript
{
  success: true,
  data: { deleted: true },
  message: "File deleted successfully"
}
```

---

## Common Patterns

### Rate Limiting

Most endpoints implement rate limiting:

```typescript
const rateLimit = {
	search: '100 requests per minute',
	feedback: '10 requests per hour',
	analytics: '1000 events per hour',
	upload: '20 uploads per hour'
};
```

### Error Handling

Standard error responses:

```typescript
{
  success: false,
  error: "Error message",
  code: "ERROR_CODE"
}
```

---

## Performance Considerations

### Search Optimization

- Full-text search indexes on all searchable fields
- Results cached for 5 minutes
- Suggestions cached for 1 hour
- Query debouncing recommended (300ms)

### Analytics Batching

- Client should batch events when possible
- Max 100 events per batch request
- Events processed asynchronously

### File Upload

- Direct-to-S3 upload available for large files
- Chunked upload for files > 5MB
- Progress tracking via WebSocket

---

**Last Updated:** 2025-01-15

**Version:** 1.0.0
