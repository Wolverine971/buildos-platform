---
title: 'CRUD Operation Patterns Research'
date: 2025-11-04
status: 'completed'
focus: 'ontology_entity_management'
---

# CRUD Operation Patterns - BuildOS Platform Analysis

## Executive Summary

This document provides a comprehensive analysis of existing CRUD (Create, Read, Update, Delete) operation patterns in the BuildOS codebase. These patterns can be applied to ontology entity management, including entity creation, editing, deletion, and listing with action buttons.

---

## 1. CREATE OPERATIONS

### Pattern 1A: Create Modal with Template Selection

**Location:** `/apps/web/src/lib/components/ontology/OutputCreateModal.svelte`

**Key Characteristics:**

- Two-stage creation process (template selection → entity details)
- Template metadata display (name, description, typical users)
- Dynamic default naming based on selected template
- Comprehensive error handling with retry capability

**Architecture:**

```
Stage 1: Template Selection
├─ Load available templates from API
├─ Display template grid (high information density)
├─ Show template metadata (description, personas)
└─ Handle loading/error states

Stage 2: Entity Details Input
├─ Pre-populate name based on selected template
├─ Allow manual name editing
├─ Show selected template as confirmation
├─ Submit with project context
└─ Handle creation errors with user-friendly messages
```

**Error Handling Pattern:**

- Try/catch blocks around API calls
- Error state display with retry button
- Clear error messages from API responses
- User feedback during submission (loading state)

**Key Implementations:**

```javascript
// Clear error on retry
error = null;

// Handle both response format variations
const templateList = data.data?.templates || data.templates || [];

// Better error parsing for ApiResponse format
let errorMessage = 'Failed to create output';
try {
	const errorData = await response.json();
	errorMessage = errorData.error || errorData.message || errorMessage;
} catch {
	errorMessage = `${errorMessage} (${response.status})`;
}
```

**UI Patterns:**

- Mobile-responsive backdrop blur modal with Card component
- Dark mode support with proper contrast
- Clear visual hierarchy (header, content, actions)
- Accessibility attributes (aria-modal, aria-labelledby, etc.)
- Loading spinner with status messages

---

### Pattern 1B: Quick Create Modal with Options

**Location:** `/apps/web/src/lib/components/projects/NewProjectModal.svelte`

**Key Characteristics:**

- Multiple creation paths (Brain Dump, Quick Form, etc.)
- Context-aware messaging (first-time vs. experienced users)
- Option cards with icons and descriptions
- Event-based communication with parent component

**Architecture:**

```
Modal Display
├─ Conditional help text based on user experience
├─ Option cards with:
│  ├─ Icon (Brain, FileText, etc.)
│  ├─ Title and description
│  ├─ Context-specific messaging
│  └─ Click handlers that dispatch events
└─ Footer with Cancel action
```

**Event Pattern:**

```javascript
const dispatch = createEventDispatcher<{
    close: void;
    brainDump: void;
    createEmpty: void;
    quickForm: void;
}>();
```

**UI Patterns:**

- Card-based options with color-coded borders
- Responsive grid layout
- Hover states with subtle color changes
- Support for first-time user onboarding

---

### Pattern 1C: API Endpoint for Creation

**Location:** `/apps/web/src/routes/api/onto/outputs/create/+server.ts`

**Key Characteristics:**

- POST endpoint with validation
- Security check (project ownership via actor ID)
- Template validation and instantiation
- Proper error responses (ApiResponse format)

**Architecture:**

```
POST /api/onto/outputs/create
├─ Authentication check (user session required)
├─ Body validation (project_id, type_key, name required)
├─ Security: Verify project ownership
│  ├─ Fetch project with created_by
│  ├─ Get user's actor ID
│  └─ Compare for authorization
├─ Template validation
├─ Props merging (defaults + user input)
├─ Database insertion
├─ Edge creation (project → output relationship)
└─ Return created entity with full data
```

**Error Responses:**

```
401: Unauthorized (missing auth)
400: Bad Request (missing required fields)
403: Forbidden (user doesn't own project)
404: Not Found (project or template not found)
500: Database/Internal errors
```

**Security Pattern:**

```javascript
// Get user's actor ID
const { data: actorId } = await supabase.rpc('ensure_actor_for_user', {
	p_user_id: user.id
});

// Verify ownership
if (project.created_by !== actorId) {
	return ApiResponse.forbidden('You do not have permission');
}
```

---

## 2. READ OPERATIONS

### Pattern 2A: Get Single Entity

**Location:** `/apps/web/src/routes/api/onto/outputs/[id]/+server.ts`

**Key Characteristics:**

- GET endpoint with authorization check
- Nested data selection for relationships
- Security verification before returning data

**Architecture:**

```
GET /api/onto/outputs/[id]
├─ Authentication check
├─ ID validation
├─ Fetch with relationships (SELECT * with joins)
├─ Security: Verify project ownership
└─ Return full entity data
```

**Implementation:**

```javascript
// Fetch with relationship
const { data: output } = await supabase
	.from('onto_outputs')
	.select('*, project:onto_projects!inner(id, created_by)')
	.eq('id', id)
	.maybeSingle();
```

---

### Pattern 2B: Caching in Service Layer

**Location:** `/apps/web/src/lib/services/projectService.ts`

**Key Characteristics:**

- Cache manager with TTL (5 minutes)
- Cache invalidation on mutations
- Pattern-based cache clearing
- LRU-style cache (50 item limit)

**Architecture:**

```
Service Layer Caching
├─ Initialize cache: new CacheManager(50, 5 * 60 * 1000)
├─ Check cache before API call
├─ Store successful responses
├─ Invalidate on mutations:
│  ├─ Exact key deletion: cache.delete(key)
│  ├─ Pattern-based: cache.invalidatePattern(/^projects:/)
│  └─ Full clear: cache.clear()
└─ Update store after cache
```

**Implementation:**

```javascript
async getProject(projectId: string): Promise<ProjectResponse> {
    const cacheKey = `project:${projectId}`;

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached) {
        return { success: true, data: cached as Project };
    }

    // Fetch from API
    const result = await this.get<Project>(`/projects/${projectId}`);

    // Cache and update store
    if (result.success && result.data) {
        this.cache.set(cacheKey, result.data);
        projectStoreV2.updateStoreState({ project: result.data });
    }

    return result;
}
```

---

## 3. UPDATE OPERATIONS

### Pattern 3A: Update Modal

**Location:** `/apps/web/src/lib/components/project/ProjectEditModal.svelte`

**Key Characteristics:**

- FormModal wrapper with complex multi-section layout
- Sidebar metadata with calculated values (duration, progress)
- Rich text editors for certain fields (markdown toggle)
- Advanced field types (core dimensions, tags, dates)
- Deep cloning to preserve form state

**Architecture:**

```
Edit Modal Structure
├─ Header (title + close button)
├─ Main content area (3 columns on desktop)
│  ├─ Large content section
│  │  ├─ Project Name (featured input)
│  │  ├─ Description (textarea)
│  │  ├─ Executive Summary (markdown toggle)
│  │  ├─ Detailed Context (large markdown editor)
│  │  ├─ Core Dimensions (complex nested component)
│  │  └─ Character count indicators
│  └─ Sidebar metadata
│     ├─ Status dropdown
│     ├─ Timeline section (start/end dates)
│     ├─ Duration/progress calculator
│     ├─ Tags management
│     └─ Activity indicators
└─ Footer (Save/Cancel buttons)
```

**Form Data Pattern:**

```javascript
// Individual field bindings for reactivity
let nameValue = '';
let descriptionValue = '';
let statusValue = 'active';
// ... etc for each field

// Initialize from project on modal open
$: if (project && isOpen) {
	nameValue = project.name || '';
	descriptionValue = project.description || '';
	// ... copy all fields
}
```

**Validation Pattern:**

```javascript
// Validate required fields
if (!nameValue.trim()) {
	throw new Error('Project name is required');
}
```

**Update API Call:**

```javascript
const projectResponse = await fetch(`/api/projects/${project.id}`, {
	method: 'PUT',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(projectData)
});
```

**Advanced Features:**

- Date formatting/parsing helpers
- Tag input with Enter key detection
- Copy to clipboard functionality
- PDF export integration
- Core dimensions field with custom update handler

---

### Pattern 3B: Update API Endpoint

**Location:** `/apps/web/src/routes/api/projects/[id]/+server.ts`

**Key Characteristics:**

- PUT endpoint with partial updates
- Ownership verification before update
- Data cleaning/validation
- Automatic timestamp updates
- Side effect handling (cascading updates)

**Architecture:**

```
PUT /api/projects/[id]
├─ Authentication check
├─ Ownership verification
├─ Request body parsing and cleaning
├─ Field validation
├─ Add updated_at timestamp
├─ Update in database
├─ Handle side effects
│  └─ If status changed to 'archived'/'paused':
│     ├─ Fetch all project tasks with calendar events
│     ├─ Bulk delete calendar events
│     └─ Log any warnings
└─ Return updated entity
```

**Data Cleaning Pattern:**

```javascript
const cleanedData = cleanDataForTable('projects', data);
const validation = validateRequiredFields('projects', cleanedData, 'update');

// Add/update timestamp
cleanedData.updated_at = new Date().toISOString();

// Update in database
const { data: updatedProject } = await supabase
	.from('projects')
	.update(cleanedData)
	.eq('id', params.id)
	.select()
	.single();
```

---

## 4. DELETE OPERATIONS

### Pattern 4A: Delete Confirmation Modal

**Location:** `/apps/web/src/lib/components/project/DeleteConfirmationModal.svelte`

**Key Characteristics:**

- Built on ConfirmationModal component
- Shows impact details (what will be deleted)
- Red/danger variant button styling
- Loading state during deletion

**Architecture:**

```
Delete Confirmation
├─ Title with entity name
├─ Warning message
├─ Details of cascade deletions:
│  ├─ Project and settings
│  ├─ Count of tasks (conditional display)
│  ├─ Count of notes (conditional display)
│  ├─ Context and daily briefs
│  └─ Synthesis data
├─ Cancel button
└─ Delete button (danger variant, disabled while loading)
```

**Implementation:**

```javascript
// Props for modal configuration
export let projectName = '';
export let taskCount = 0;
export let noteCount = 0;
export let isDeleting = false;

// Display deletion items conditionally
{#if taskCount > 0}
    <li>{taskCount} task{taskCount !== 1 ? 's' : ''}</li>
{/if}
```

**Event Dispatch:**

```javascript
const dispatch = createEventDispatcher();

function handleConfirm() {
	dispatch('confirm');
}
```

---

### Pattern 4B: Base Confirmation Modal

**Location:** `/apps/web/src/lib/components/ui/ConfirmationModal.svelte`

**Key Characteristics:**

- Reusable confirmation pattern
- Icon support (warning, danger, info, success)
- Loading state prevents closing
- Slots for custom content and details
- Color-coded icon styling

**Architecture:**

```
ConfirmationModal
├─ Icon (optional, color-coded)
├─ Main content slot (custom HTML)
├─ Details slot (additional information)
└─ Footer
   ├─ Cancel button (disabled during loading)
   └─ Confirm button (configurable variant, disabled during loading)
```

**Icon Colors:**

```javascript
const iconColors = {
	warning: 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30',
	danger: 'text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-900/30',
	info: 'text-primary-600 dark:text-primary-400 bg-primary-100 dark:bg-primary-900/30',
	success: 'text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30'
};
```

**Loading Pattern:**

```javascript
closeOnBackdrop={!loading}
closeOnEscape={!loading}
persistent={loading}
disabled={loading}
loading={loading}
```

---

### Pattern 4C: Delete API Endpoint

**Location:** `/apps/web/src/routes/api/projects/[id]/+server.ts`

**Key Characteristics:**

- DELETE endpoint with ownership check
- Cascade deletion (tasks first, then project)
- Error handling for cascade operations
- Clear success response

**Architecture:**

```
DELETE /api/projects/[id]
├─ Authentication check
├─ Ownership verification
├─ Cascade delete:
│  ├─ Delete tasks (children first)
│  └─ Delete project (parent)
└─ Return success message
```

**Implementation:**

```javascript
// Delete cascade - children first
const { error: tasksError } = await supabase.from('tasks').delete().eq('project_id', params.id);

// Then delete parent
const { error: deleteError } = await supabase
	.from('projects')
	.delete()
	.eq('id', params.id)
	.eq('user_id', user.id);
```

---

## 5. LIST VIEWS WITH ACTIONS

### Pattern 5A: Complex List with Filters and Bulk Actions

**Location:** `/apps/web/src/lib/components/project/TasksList.svelte`

**Key Characteristics:**

- Advanced filtering (multiple filter types)
- Sorting with direction control
- Bulk selection with select-all checkbox
- Bulk action dropdowns (status, priority)
- Task categorization (active, scheduled, deleted, completed, overdue, recurring)
- Memoized performance optimizations

**Architecture:**

```
TasksList Component
├─ Filter Controls
│  ├─ Multiple active filters (Set<TaskFilter>)
│  ├─ Tab-style presentation
│  └─ Dynamic task counts
├─ Sort Controls
│  ├─ Sort field selector (created_at, updated_at, start_date)
│  ├─ Sort direction toggle (asc/desc)
│  └─ Dropdown UI
├─ Bulk Selection
│  ├─ Select-all checkbox
│  ├─ Individual task checkboxes
│  ├─ Bulk action buttons (status, priority, remove dates, delete)
│  └─ Visual feedback (toolbar appears on selection)
├─ Task Display
│  ├─ Filtered and sorted task list
│  ├─ Task type indicator styling
│  ├─ Action buttons per task (edit, calendar, delete)
│  └─ Calendar status indicators
└─ Confirmation Modals
   ├─ Bulk remove dates confirmation
   ├─ Bulk delete confirmation
   └─ Individual task delete confirmation
```

**Filter Implementation:**

```javascript
// Filter state
let activeFilters: Set<TaskFilter> = $state(new Set(['active']));

// Apply filters using derived
let filteredTasks = $derived(
    allTasksFromStore
        .filter((task) => activeFilters.has(getTaskType(task)))
        .sort((a, b) => { /* sorting logic */ })
);

// Toggle filter
function toggleFilter(filter: TaskFilter) {
    if (activeFilters.has(filter)) {
        activeFilters.delete(filter);
    } else {
        activeFilters.add(filter);
    }
}
```

**Bulk Selection:**

```javascript
let selectedTaskIds = $state(new Set<string>());

// Derived computed properties
let allTasksSelected = $derived(
    filteredTasks.length > 0 &&
    filteredTasks.every((task) => selectedTaskIds.has(task.id))
);

// Select all handler
function selectAll() {
    filteredTasks.forEach(task => selectedTaskIds.add(task.id));
}
```

**Bulk Action Pattern:**

```javascript
async function bulkUpdateStatus(newStatus: string) {
    bulkActionInProgress = true;
    let successCount = 0;
    let failures: string[] = [];

    try {
        for (const task of selectedTasks) {
            try {
                await updateTask(task.id, { status: newStatus });
                successCount++;
            } catch (error) {
                failures.push(task.name);
            }
        }

        if (successCount > 0) {
            toastService.add({
                type: 'success',
                message: `Updated ${successCount} task(s)`
            });
        }

        if (failures.length > 0) {
            bulkActionWarnings = failures;
        }

        selectedTaskIds.clear();
    } finally {
        bulkActionInProgress = false;
    }
}
```

**Performance Optimization - Memoization:**

```javascript
// Memoization cache for task type calculations
const taskTypeCache = new Map<string, string>();

function getTaskTypeMemoized(task: any) {
    const cacheKey = `${task.id}-${task.task_type}-${task.status}-...`;

    if (taskTypeCache.has(cacheKey)) {
        return taskTypeCache.get(cacheKey);
    }

    const taskType = calculateType(task);

    // Keep cache small
    if (taskTypeCache.size > 100) {
        const firstKey = taskTypeCache.keys().next().value;
        taskTypeCache.delete(firstKey);
    }

    taskTypeCache.set(cacheKey, taskType);
    return taskType;
}
```

---

## 6. FORM VALIDATION PATTERNS

### Pattern 6A: FormModal Component

**Location:** `/apps/web/src/lib/components/ui/FormModal.svelte`

**Key Characteristics:**

- Generic form wrapper with validation
- Support for various field types
- Required field validation
- Error display
- Deep cloning for form state isolation
- Delete operation support

**Architecture:**

```
FormModal
├─ Initialization
│  ├─ Deep clone initial data
│  ├─ Track initialization state
│  └─ Reset on modal close
├─ Validation
│  ├─ Required field checking
│  ├─ Empty value detection
│  └─ Array and string handling
├─ Error Display
│  ├─ Field-level error messages
│  ├─ Clear formatting
│  └─ Error persistence during editing
└─ Submission
   ├─ Validation before submit
   ├─ Error collection
   ├─ Submit handler execution
   └─ Modal close on success
```

**Initialization Pattern:**

```javascript
// Deep clone helper
function deepClone(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (Array.isArray(obj)) return obj.map((item) => deepClone(item));
    if (typeof obj === 'object') {
        const cloned: Record<string, any> = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                cloned[key] = deepClone(obj[key]);
            }
        }
        return cloned;
    }
    return obj;
}

// Initialize when modal opens
$: if (isOpen) {
    const hasData = Object.keys(initialData).length > 0;
    const isFirstOpen = !lastOpenState;
    const dataChanged = hasData && !hasInitialized;

    if (isFirstOpen || dataChanged) {
        formData = deepClone(initialData);
        errors = [];
        hasInitialized = hasData;
    }
}
```

**Validation Pattern:**

```javascript
const validationErrors: string[] = [];
for (const [field, config] of Object.entries(formConfig)) {
    if (config.required) {
        const value = formData[field];
        const isEmpty =
            value === undefined ||
            value === null ||
            value === '' ||
            (Array.isArray(value) && value.length === 0) ||
            (typeof value === 'string' && !value.trim());

        if (isEmpty) {
            validationErrors.push(`${config.label} is required`);
        }
    }
}

if (validationErrors.length > 0) {
    errors = validationErrors;
    loading = false;
    return;
}
```

---

## 7. ERROR AND SUCCESS HANDLING PATTERNS

### Pattern 7A: ApiResponse Wrapper

**Location:** `/apps/web/src/lib/utils/api-response.ts`

**Key Characteristics:**

- Standardized response format for all APIs
- Helper methods for common response types
- Consistent error codes
- Support for caching headers
- ETag generation for conditional requests

**Response Format:**

```javascript
// Success response
{
    success: true,
    data?: T,
    message?: string
}

// Error response
{
    error: string,
    code?: string,
    details?: any
}
```

**Helper Methods:**

```javascript
// Success responses
ApiResponse.success(data, message); // 200
ApiResponse.created(data, message); // 201
ApiResponse.cached(data, message, maxAge); // 200 with cache headers

// Error responses
ApiResponse.error(message, status, code, details);
ApiResponse.badRequest(message, details); // 400
ApiResponse.unauthorized(message); // 401
ApiResponse.forbidden(message); // 403
ApiResponse.notFound(resource); // 404
ApiResponse.conflict(message); // 409
ApiResponse.validationError(field, message); // 422
ApiResponse.internalError(error, message); // 500
ApiResponse.databaseError(error); // 500
ApiResponse.timeout(message); // 408
```

**Usage in API Endpoints:**

```javascript
export const POST: RequestHandler = async ({ request, locals }) => {
    try {
        const { user } = await locals.safeGetSession();
        if (!user) {
            return ApiResponse.unauthorized('Authentication required');
        }

        const body = await request.json();
        if (!body.required_field) {
            return ApiResponse.badRequest('required_field is required');
        }

        // ... operation logic

        return ApiResponse.success({ data: result });
    } catch (err) {
        return ApiResponse.internalError(err);
    }
};
```

### Pattern 7B: Toast Service for User Feedback

**Location:** Throughout components (e.g., ProjectEditModal.svelte)

**Key Characteristics:**

- Toast notifications for user feedback
- Type support (success, error, info)
- Message display
- Service-based pattern

**Usage:**

```javascript
// Success feedback
toastService.add({
	type: 'success',
	message: 'Project updated successfully'
});

// Error feedback
toastService.add({
	type: 'error',
	message: 'Failed to update project'
});

// Info feedback
toastService.add({
	type: 'info',
	message: 'No context to copy'
});
```

---

## 8. SERVICE LAYER PATTERNS

### Pattern 8A: API Service Base Class

**Location:** `/apps/web/src/lib/services/base/api-service.ts`

**Key Characteristics:**

- Generic HTTP methods (GET, POST, PATCH, DELETE)
- Automatic error handling
- Type-safe responses
- Base URL configuration

**Methods:**

```javascript
async get<T>(endpoint: string, params?: Record<string, any>): Promise<ServiceResponse<T>>
async post<T>(endpoint: string, data: any): Promise<ServiceResponse<T>>
async patch<T>(endpoint: string, data: any): Promise<ServiceResponse<T>>
async delete(endpoint: string): Promise<ServiceResponse<void>>
```

**Response Type:**

```javascript
interface ServiceResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    status?: number;
}
```

### Pattern 8B: Service Methods for CRUD

**Location:** `/apps/web/src/lib/services/projectService.ts`

**Architecture:**

```javascript
export class ProjectService extends ApiService {
    // Singleton pattern
    private static instance: ProjectService;

    static getInstance(): ProjectService {
        if (!ProjectService.instance) {
            ProjectService.instance = new ProjectService();
        }
        return ProjectService.instance;
    }

    // CRUD methods with cache integration
    async getProject(projectId: string): Promise<ProjectResponse> { }
    async getUserProjects(options: {}): Promise<ProjectsResponse> { }
    async createProject(projectData: Partial<Project>): Promise<ProjectResponse> { }
    async updateProject(projectId: string, updates: Partial<Project>): Promise<ProjectResponse> { }
    async deleteProject(projectId: string): Promise<ServiceResponse<void>> { }
}
```

---

## 9. KEY UI/UX PATTERNS

### Pattern 9A: Dark Mode Support

**All components follow consistent dark mode pattern:**

```svelte
<!-- Light mode -->
<div class="bg-white text-gray-900 border-gray-200">

<!-- Dark mode -->
<div class="dark:bg-gray-800 dark:text-white dark:border-gray-700">
```

### Pattern 9B: Responsive Design

**All components use Tailwind breakpoints:**

```svelte
<!-- Mobile first -->
<div class="p-4 sm:p-6 lg:p-8">
	<h1 class="text-lg sm:text-xl lg:text-2xl">Title</h1>
	<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
		<!-- content -->
	</div>
</div>
```

### Pattern 9C: Loading and Disabled States

**Consistent loading pattern:**

```svelte
<Button disabled={!outputName.trim() || isCreating} loading={isCreating} variant="primary">
	{isCreating ? 'Creating...' : 'Create & Edit'}
</Button>
```

---

## 10. SUMMARY TABLE

| Operation          | Component/API                  | Key Features                               |
| ------------------ | ------------------------------ | ------------------------------------------ |
| **CREATE**         | OutputCreateModal.svelte       | Two-stage, template selection, error retry |
| **CREATE**         | POST /api/onto/outputs/create  | Security, validation, edge creation        |
| **READ**           | GET /api/onto/outputs/[id]     | Auth check, relationship loading           |
| **READ (LIST)**    | TasksList.svelte               | Filtering, sorting, bulk selection         |
| **UPDATE**         | ProjectEditModal.svelte        | Multi-section form, sidebar metadata       |
| **UPDATE**         | PUT /api/projects/[id]         | Validation, timestamps, side effects       |
| **DELETE**         | DeleteConfirmationModal.svelte | Impact preview, cascade info               |
| **DELETE**         | DELETE /api/projects/[id]      | Cascade deletion, error handling           |
| **VALIDATE**       | FormModal.svelte               | Required fields, deep cloning, errors      |
| **ERROR HANDLING** | ApiResponse utility            | Standard format, helper methods            |
| **CACHING**        | ProjectService                 | TTL cache, pattern invalidation            |

---

## 11. IMPLEMENTATION RECOMMENDATIONS FOR ONTOLOGY

### For Ontology Entity Creation:

1. Adopt the OutputCreateModal pattern (template selection + details)
2. Use ApiResponse wrapper for all endpoints
3. Implement security checks (user ownership via actor ID)
4. Add proper error handling with user feedback

### For Ontology Entity Editing:

1. Use FormModal or ProjectEditModal pattern
2. Implement form state isolation with deep cloning
3. Support batch updates where applicable
4. Add timestamp tracking for updates

### For Ontology Entity Deletion:

1. Use ConfirmationModal with impact preview
2. Implement cascade deletion handling
3. Add bulkActionWarnings for affected relationships
4. Include loading state to prevent double-clicks

### For Ontology Entity Lists:

1. Implement filtering by entity type/status
2. Add sorting capabilities
3. Support bulk selection and actions
4. Include action buttons (edit, delete, etc.)
5. Use memoization for performance

### General Best Practices:

- Always use ApiResponse wrapper for API endpoints
- Implement proper error handling with try/catch
- Use toastService for user feedback
- Support dark mode and responsive design
- Add keyboard shortcuts (Escape to close modals)
- Use Svelte 5 runes ($state, $derived) for reactivity
- Implement caching in service layer
- Add accessibility attributes to modal components
