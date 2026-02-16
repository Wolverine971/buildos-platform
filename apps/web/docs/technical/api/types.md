<!-- apps/web/docs/technical/api/types.md -->

# API Types Documentation

_Auto-generated on 2025-09-27T04:23:16.655Z_

This documentation covers all TypeScript interfaces and types used in the BuildOS API.

## Table of Contents

- [ActivityLog](#activitylog)
- [ApiResponse](#apiresponse)
- [BaseSSEMessage](#basessemessage)
- [BottomSectionsData](#bottomsectionsdata)
- [BrainDump](#braindump)
- [BrainDumpLink](#braindumplink)
- [BrainDumpMetadata](#braindumpmetadata)
- [BrainDumpOptions](#braindumpoptions)
- [BrainDumpParseResult](#braindumpparseresult)
- [BrainDumpStatus](#braindumpstatus)
- [BrainDumpTableType](#braindumptabletype)
- [BriefAnalytics](#briefanalytics)
- [BriefDateRange](#briefdaterange)
- [BriefFilters](#brieffilters)
- [BriefGenerationOptions](#briefgenerationoptions)
- [BriefGenerationOptions](#briefgenerationoptions)
- [BriefGenerationResult](#briefgenerationresult)
- [BriefGenerationResult](#briefgenerationresult)
- [BriefGenerationStatus](#briefgenerationstatus)
- [BriefMetadata](#briefmetadata)
- [BriefSearchResult](#briefsearchresult)
- [BriefSummary](#briefsummary)
- [BriefTemplate](#brieftemplate)
- [BriefTemplate](#brieftemplate)
- [BriefType](#brieftype)
- [BrowserInfo](#browserinfo)
- [CalendarEvent](#calendarevent)
- [CalendarStatus](#calendarstatus)
- [CalendarStatus](#calendarstatus)
- [CleanedData](#cleaneddata)
- [CompletedBrainDump](#completedbraindump)
- [CompositeTypes](#compositetypes)
- [CreateProjectBriefTemplate](#createprojectbrieftemplate)
- [DailyBrief](#dailybrief)
- [DailyBrief](#dailybrief)
- [DailyBriefResult](#dailybriefresult)
- [DailyBriefWithRelations](#dailybriefwithrelations)
- [DashboardProps](#dashboardprops)
- [DashboardStats](#dashboardstats)
- [Database](#database)
- [DatabaseSchema](#databaseschema)
- [DatabaseWithoutInternals](#databasewithoutinternals)
- [DeepPartial](#deeppartial)
- [DefaultSchema](#defaultschema)
- [DisplayedBrainDumpQuestion](#displayedbraindumpquestion)
- [DualProcessingStatus](#dualprocessingstatus)
- [EnhancementOptions](#enhancementoptions)
- [EnrichedBraindump](#enrichedbraindump)
- [Enums](#enums)
- [ErrorContext](#errorcontext)
- [ErrorLogEntry](#errorlogentry)
- [ErrorSeverity](#errorseverity)
- [ErrorType](#errortype)
- [EventData](#eventdata)
- [ExecutionResult](#executionresult)
- [FieldConfig](#fieldconfig)
- [FilterCounts](#filtercounts)
- [FormConfig](#formconfig)
- [FormModalProps](#formmodalprops)
- [FullProjectData](#fullprojectdata)
- [GroupedSearchResults](#groupedsearchresults)
- [HighlightedText](#highlightedtext)
- [Json](#json)
- [Json](#json)
- [LLMMetadata](#llmmetadata)
- [LLMModel](#llmmodel)
- [LLMProvider](#llmprovider)
- [LLMRequest](#llmrequest)
- [LLMRequest](#llmrequest)
- [LLMResponse](#llmresponse)
- [LLMResponse](#llmresponse)
- [ModalCallbacks](#modalcallbacks)
- [ModalState](#modalstate)
- [ModalState](#modalstate)
- [Note](#note)
- [NoteCallbacks](#notecallbacks)
- [NoteCategory](#notecategory)
- [NoteCreatePayload](#notecreatepayload)
- [NoteFilters](#notefilters)
- [NoteInsert](#noteinsert)
- [NoteOperation](#noteoperation)
- [NoteUpdate](#noteupdate)
- [NudgeCard](#nudgecard)
- [Nullable](#nullable)
- [OnboardingCategory](#onboardingcategory)
- [OnboardingField](#onboardingfield)
- [OnboardingProgress](#onboardingprogress)
- [OnboardingProgressData](#onboardingprogressdata)
- [OnboardingStep](#onboardingstep)
- [OnCloseCallback](#onclosecallback)
- [OnDeleteCallback](#ondeletecallback)
- [OperationType](#operationtype)
- [PageData](#pagedata)
- [PageMetadata](#pagemetadata)
- [PaginatedResponse](#paginatedresponse)
- [ParsedOperation](#parsedoperation)
- [Phase](#phase)
- [Phase](#phase)
- [PhaseCallbacks](#phasecallbacks)
- [PhaseGenerationResult](#phasegenerationresult)
- [PhaseGenerationResult](#phasegenerationresult)
- [PhaseInsert](#phaseinsert)
- [PhaseInsert](#phaseinsert)
- [PhaseTask](#phasetask)
- [PhaseUpdate](#phaseupdate)
- [PhaseWithTasks](#phasewithtasks)
- [PhaseWithTasks](#phasewithtasks)
- [PhaseWithTasks](#phasewithtasks)
- [PrimaryCTA](#primarycta)
- [PriorityLevel](#prioritylevel)
- [ProcessedPhase](#processedphase)
- [Project](#project)
- [ProjectBriefTemplate](#projectbrieftemplate)
- [ProjectBriefTemplate](#projectbrieftemplate)
- [ProjectBriefVariables](#projectbriefvariables)
- [ProjectCallbacks](#projectcallbacks)
- [ProjectContextField](#projectcontextfield)
- [ProjectContextResult](#projectcontextresult)
- [ProjectCreatePayload](#projectcreatepayload)
- [ProjectDailyBrief](#projectdailybrief)
- [ProjectDailyBrief](#projectdailybrief)
- [ProjectDailyBriefWithProject](#projectdailybriefwithproject)
- [ProjectFilter](#projectfilter)
- [ProjectFilters](#projectfilters)
- [ProjectInsert](#projectinsert)
- [ProjectOperation](#projectoperation)
- [ProjectPageData](#projectpagedata)
- [ProjectQuestion](#projectquestion)
- [ProjectQuestionRow](#projectquestionrow)
- [ProjectsFilterState](#projectsfilterstate)
- [ProjectsPageState](#projectspagestate)
- [ProjectStatus](#projectstatus)
- [ProjectStatus](#projectstatus)
- [ProjectSynthesis](#projectsynthesis)
- [ProjectSynthesisResult](#projectsynthesisresult)
- [ProjectUpdate](#projectupdate)
- [ProjectWithRelations](#projectwithrelations)
- [PromptTemplate](#prompttemplate)
- [RequireAtLeastOne](#requireatleastone)
- [SearchResult](#searchresult)
- [SearchState](#searchstate)
- [SoftDeletable](#softdeletable)
- [SSEComplete](#ssecomplete)
- [SSEContextProgress](#ssecontextprogress)
- [SSEContextUpdateRequired](#ssecontextupdaterequired)
- [SSEError](#sseerror)
- [SSERetry](#sseretry)
- [SSEStatus](#ssestatus)
- [SSETasksProgress](#ssetasksprogress)
- [StreamEvent](#streamevent)
- [StreamEvent](#streamevent)
- [StreamingBriefData](#streamingbriefdata)
- [StreamingBriefData](#streamingbriefdata)
- [StreamingMessage](#streamingmessage)
- [StreamingState](#streamingstate)
- [StreamingStatus](#streamingstatus)
- [StreamingStatus](#streamingstatus)
- [SynthesisContent](#synthesiscontent)
- [SynthesisOption](#synthesisoption)
- [SynthesisOptions](#synthesisoptions)
- [SynthesisRequest](#synthesisrequest)
- [SystemMetric](#systemmetric)
- [TabCounts](#tabcounts)
- [TableName](#tablename)
- [Tables](#tables)
- [TablesInsert](#tablesinsert)
- [TablesUpdate](#tablesupdate)
- [TabType](#tabtype)
- [TabType](#tabtype)
- [TabType](#tabtype)
- [Task](#task)
- [TaskCalendarEvent](#taskcalendarevent)
- [TaskCallbacks](#taskcallbacks)
- [TaskComparison](#taskcomparison)
- [TaskCreatePayload](#taskcreatepayload)
- [TaskFilter](#taskfilter)
- [TaskFilters](#taskfilters)
- [TaskInsert](#taskinsert)
- [TaskNoteExtractionResult](#tasknoteextractionresult)
- [TaskOperation](#taskoperation)
- [TaskPriority](#taskpriority)
- [TaskStats](#taskstats)
- [TaskStatus](#taskstatus)
- [TaskStatus](#taskstatus)
- [TaskSynthesisConfig](#tasksynthesisconfig)
- [TaskType](#tasktype)
- [TaskUpdate](#taskupdate)
- [TaskWithCalendarEvents](#taskwithcalendarevents)
- [TemplateGenerationRequest](#templategenerationrequest)
- [TemplateGenerationResponse](#templategenerationresponse)
- [TemplateMetadata](#templatemetadata)
- [TemplateSection](#templatesection)
- [TemplateValidation](#templatevalidation)
- [TemplateValidationResult](#templatevalidationresult)
- [TemplateVariable](#templatevariable)
- [TemplateVariableMap](#templatevariablemap)
- [ThresholdCalculation](#thresholdcalculation)
- [UpdateProjectBriefTemplate](#updateprojectbrieftemplate)
- [User](#user)
- [UserContext](#usercontext)
- [UserDataResult](#userdataresult)
- [UserDataResult](#userdataresult)
- [UserFamiliarity](#userfamiliarity)
- [ValidationResult](#validationresult)

---

## ActivityLog

**File:** `src/lib/types/index.ts`

```typescript
interface ActivityLog {
	id: string;
	user_id: string;
	activity_type: string;
	metadata?: Record;
	created_at: string;
}
```

### Properties

| Property      | Type     | Optional | Description |
| ------------- | -------- | -------- | ----------- |
| id            | `string` | No       | -           |
| user_id       | `string` | No       | -           |
| activity_type | `string` | No       | -           |
| metadata      | `Record` | Yes      | -           |
| created_at    | `string` | No       | -           |

---

## ApiResponse

**File:** `src/lib/types/index.ts`

```typescript
interface ApiResponse<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
	message?: string;
	warnings?: Array<{ message: string; type: string }>;
	code?: string;
	details?: unknown;
	errorInfo?: {
		code: string;
		message: string;
		status: number;
		details?: unknown;
		field?: string;
	};
	timestamp: string;
	requestId?: string;
}
```

### Properties

| Property  | Type      | Optional | Description |
| --------- | --------- | -------- | ----------- |
| success   | `boolean` | No       | -           |
| data      | `T`       | Yes      | -           |
| error     | `string`  | Yes      | -           |
| message   | `string`  | Yes      | -           |
| warnings  | `Array`   | Yes      | -           |
| code      | `string`  | Yes      | -           |
| details   | `unknown` | Yes      | -           |
| errorInfo | `object`  | Yes      | -           |
| timestamp | `string`  | No       | -           |
| requestId | `string`  | Yes      | -           |

---

## BaseSSEMessage

**File:** `src/lib/types/sse-messages.ts`

```typescript
interface BaseSSEMessage {
	type: string;
	message?: string;
}
```

### Properties

| Property | Type     | Optional | Description |
| -------- | -------- | -------- | ----------- |
| type     | `string` | No       | -           |
| message  | `string` | Yes      | -           |

---

## BottomSectionsData

**File:** `src/lib/types/dashboard.ts`

```typescript
interface BottomSectionsData {
	todaysBrief?: any;
	stats?: Partial;
}
```

### Properties

| Property    | Type      | Optional | Description |
| ----------- | --------- | -------- | ----------- |
| todaysBrief | `any`     | Yes      | -           |
| stats       | `Partial` | Yes      | -           |

---

## BrainDump

**File:** `src/lib/types/index.ts`

```typescript
type BrainDump = unknown;
```

---

## BrainDumpLink

**File:** `src/lib/types/index.ts`

```typescript
type BrainDumpLink = unknown;
```

---

## BrainDumpMetadata

**File:** `src/lib/types/brain-dump.ts`

```typescript
interface BrainDumpMetadata {
	totalOperations: number;
	tableBreakdown: Record;
	processingTime: number;
	timestamp: string;
	processingNote?: string;
	project_info?: unknown | null;
	processingMode?: unknown | unknown;
	attemptNumber?: number;
	partialFailure?: boolean;
	projectReference?: string;
	failureDetails?: string[];
	projectCreate?: boolean;
}
```

### Properties

| Property         | Type       | Optional | Description |
| ---------------- | ---------- | -------- | ----------- | --- |
| totalOperations  | `number`   | No       | -           |
| tableBreakdown   | `Record`   | No       | -           |
| processingTime   | `number`   | No       | -           |
| timestamp        | `string`   | No       | -           |
| processingNote   | `string`   | Yes      | -           |
| project_info     | `unknown   | null`    | Yes         | -   |
| processingMode   | `unknown   | unknown` | Yes         | -   |
| attemptNumber    | `number`   | Yes      | -           |
| partialFailure   | `boolean`  | Yes      | -           |
| projectReference | `string`   | Yes      | -           |
| failureDetails   | `string[]` | Yes      | -           |
| projectCreate    | `boolean`  | Yes      | -           |

---

## BrainDumpOptions

**File:** `src/lib/types/brain-dump.ts`

```typescript
interface BrainDumpOptions {
	autoExecute?: boolean;
	streamResults?: boolean;
	useDualProcessing?: boolean;
	retryAttempts?: number;
}
```

### Properties

| Property          | Type      | Optional | Description |
| ----------------- | --------- | -------- | ----------- |
| autoExecute       | `boolean` | Yes      | -           |
| streamResults     | `boolean` | Yes      | -           |
| useDualProcessing | `boolean` | Yes      | -           |
| retryAttempts     | `number`  | Yes      | -           |

---

## BrainDumpParseResult

**File:** `src/lib/types/brain-dump.ts`

```typescript
interface BrainDumpParseResult {
	title: string;
	summary: string;
	insights: string;
	operations: ParsedOperation[];
	tags?: string[];
	metadata: BrainDumpMetadata;
	executionResult?: ExecutionResult;
	projectInfo?: unknown;
	questionAnalysis?: Record;
	projectQuestions?: Array;
	contextResult?: ProjectContextResult | null;
}
```

### Properties

| Property         | Type                  | Optional | Description |
| ---------------- | --------------------- | -------- | ----------- | --- |
| title            | `string`              | No       | -           |
| summary          | `string`              | No       | -           |
| insights         | `string`              | No       | -           |
| operations       | `ParsedOperation[]`   | No       | -           |
| tags             | `string[]`            | Yes      | -           |
| metadata         | `BrainDumpMetadata`   | No       | -           |
| executionResult  | `ExecutionResult`     | Yes      | -           |
| projectInfo      | `unknown`             | Yes      | -           |
| questionAnalysis | `Record`              | Yes      | -           |
| projectQuestions | `Array`               | Yes      | -           |
| contextResult    | `ProjectContextResult | null`    | Yes         | -   |

---

## BrainDumpStatus

**File:** `src/lib/types/search.ts`

```typescript
type BrainDumpStatus = unknown | unknown | unknown | unknown;
```

---

## BrainDumpTableType

**File:** `src/lib/types/brain-dump.ts`

```typescript
type BrainDumpTableType = unknown | unknown | unknown;
```

---

## BriefAnalytics

**File:** `src/lib/types/daily-brief.ts`

```typescript
interface BriefAnalytics {
	generation_frequency: unknown;
	engagement_metrics: unknown;
	template_usage: unknown;
}
```

### Properties

| Property             | Type      | Optional | Description |
| -------------------- | --------- | -------- | ----------- |
| generation_frequency | `unknown` | No       | -           |
| engagement_metrics   | `unknown` | No       | -           |
| template_usage       | `unknown` | No       | -           |

---

## BriefDateRange

**File:** `src/lib/types/projects-page.ts`

```typescript
type BriefDateRange = unknown | unknown | unknown | unknown;
```

---

## BriefFilters

**File:** `src/lib/types/daily-brief.ts`

```typescript
interface BriefFilters {
	dateFrom?: string;
	dateTo?: string;
	projectIds?: string[];
	templateIds?: string[];
	hasInsights?: boolean;
	hasPriorityActions?: boolean;
}
```

### Properties

| Property           | Type       | Optional | Description |
| ------------------ | ---------- | -------- | ----------- |
| dateFrom           | `string`   | Yes      | -           |
| dateTo             | `string`   | Yes      | -           |
| projectIds         | `string[]` | Yes      | -           |
| templateIds        | `string[]` | Yes      | -           |
| hasInsights        | `boolean`  | Yes      | -           |
| hasPriorityActions | `boolean`  | Yes      | -           |

---

## BriefGenerationOptions

**File:** `src/lib/types/daily-brief.ts`

```typescript
interface BriefGenerationOptions {
	briefDate?: string;
	includeProjects?: boolean;
	customTemplateIds?: unknown;
	regenerate?: boolean;
}
```

### Properties

| Property          | Type      | Optional | Description |
| ----------------- | --------- | -------- | ----------- |
| briefDate         | `string`  | Yes      | -           |
| includeProjects   | `boolean` | Yes      | -           |
| customTemplateIds | `unknown` | Yes      | -           |
| regenerate        | `boolean` | Yes      | -           |

---

## BriefGenerationOptions

**File:** `src/lib/types/index.ts`

```typescript
interface BriefGenerationOptions {
	briefDate?: string;
	includeProjects?: boolean;
	customTemplateIds?: unknown;
	regenerate?: boolean;
	streaming?: boolean;
	background?: boolean;
}
```

### Properties

| Property          | Type      | Optional | Description |
| ----------------- | --------- | -------- | ----------- |
| briefDate         | `string`  | Yes      | -           |
| includeProjects   | `boolean` | Yes      | -           |
| customTemplateIds | `unknown` | Yes      | -           |
| regenerate        | `boolean` | Yes      | -           |
| streaming         | `boolean` | Yes      | -           |
| background        | `boolean` | Yes      | -           |

---

## BriefGenerationResult

**File:** `src/lib/types/daily-brief.ts`

```typescript
interface BriefGenerationResult {
	success: boolean;
	daily_brief: unknown;
	project_briefs: Array;
	errors?: string[];
	warnings?: string[];
}
```

### Properties

| Property       | Type       | Optional | Description |
| -------------- | ---------- | -------- | ----------- |
| success        | `boolean`  | No       | -           |
| daily_brief    | `unknown`  | No       | -           |
| project_briefs | `Array`    | No       | -           |
| errors         | `string[]` | Yes      | -           |
| warnings       | `string[]` | Yes      | -           |

---

## BriefGenerationResult

**File:** `src/lib/types/index.ts`

```typescript
interface BriefGenerationResult {
	success: boolean;
	daily_brief?: unknown;
	project_briefs?: Array;
	errors?: string[];
	warnings?: string[];
	brief_id?: string;
	result?: unknown;
}
```

### Properties

| Property       | Type       | Optional | Description |
| -------------- | ---------- | -------- | ----------- |
| success        | `boolean`  | No       | -           |
| daily_brief    | `unknown`  | Yes      | -           |
| project_briefs | `Array`    | Yes      | -           |
| errors         | `string[]` | Yes      | -           |
| warnings       | `string[]` | Yes      | -           |
| brief_id       | `string`   | Yes      | -           |
| result         | `unknown`  | Yes      | -           |

---

## BriefGenerationStatus

**File:** `src/lib/types/index.ts`

```typescript
interface BriefGenerationStatus {
	isGenerating: boolean;
	briefId?: string;
	briefDate?: string;
	status?: unknown | unknown | unknown;
	progress?: unknown;
	error?: string;
	startedAt?: string;
	started_at?: string;
}
```

### Properties

| Property     | Type      | Optional | Description |
| ------------ | --------- | -------- | ----------- | --- | --- |
| isGenerating | `boolean` | No       | -           |
| briefId      | `string`  | Yes      | -           |
| briefDate    | `string`  | Yes      | -           |
| status       | `unknown  | unknown  | unknown`    | Yes | -   |
| progress     | `unknown` | Yes      | -           |
| error        | `string`  | Yes      | -           |
| startedAt    | `string`  | Yes      | -           |
| started_at   | `string`  | Yes      | -           |

---

## BriefMetadata

**File:** `src/lib/types/daily-brief.ts`

```typescript
interface BriefMetadata {
	createdBy?: string;
	tags?: string[];
	notes?: string;
}
```

### Properties

| Property  | Type       | Optional | Description |
| --------- | ---------- | -------- | ----------- |
| createdBy | `string`   | Yes      | -           |
| tags      | `string[]` | Yes      | -           |
| notes     | `string`   | Yes      | -           |

---

## BriefSearchResult

**File:** `src/lib/types/daily-brief.ts`

```typescript
interface BriefSearchResult {
	briefs: DailyBrief[];
	project_briefs: ProjectDailyBrief[];
	total: number;
	page: number;
	pageSize: number;
}
```

### Properties

| Property       | Type                  | Optional | Description |
| -------------- | --------------------- | -------- | ----------- |
| briefs         | `DailyBrief[]`        | No       | -           |
| project_briefs | `ProjectDailyBrief[]` | No       | -           |
| total          | `number`              | No       | -           |
| page           | `number`              | No       | -           |
| pageSize       | `number`              | No       | -           |

---

## BriefSummary

**File:** `src/lib/types/daily-brief.ts`

```typescript
interface BriefSummary {
	type: BriefType;
	id: string;
	date: string;
	title: string;
	preview: string;
	metadata: BriefMetadata;
}
```

### Properties

| Property | Type            | Optional | Description |
| -------- | --------------- | -------- | ----------- |
| type     | `BriefType`     | No       | -           |
| id       | `string`        | No       | -           |
| date     | `string`        | No       | -           |
| title    | `string`        | No       | -           |
| preview  | `string`        | No       | -           |
| metadata | `BriefMetadata` | No       | -           |

---

## BriefTemplate

**File:** `src/lib/types/daily-brief.ts`

```typescript
interface BriefTemplate {
	id: string;
	name: string;
	description: string | null;
	template_content: string;
	is_default: boolean | null;
	variables: any;
	created_at: string | null;
	updated_at: string | null;
}
```

### Properties

| Property         | Type     | Optional | Description |
| ---------------- | -------- | -------- | ----------- | --- |
| id               | `string` | No       | -           |
| name             | `string` | No       | -           |
| description      | `string  | null`    | No          | -   |
| template_content | `string` | No       | -           |
| is_default       | `boolean | null`    | No          | -   |
| variables        | `any`    | No       | -           |
| created_at       | `string  | null`    | No          | -   |
| updated_at       | `string  | null`    | No          | -   |

---

## BriefTemplate

**File:** `src/lib/types/index.ts`

```typescript
interface BriefTemplate {
	id: string;
	name: string;
	description: string | null;
	template_content: string;
	is_default: boolean | null;
	variables: Record;
	created_at: string | null;
	updated_at: string | null;
	user_id?: string | null;
	project_id?: string | null;
	in_use?: boolean;
}
```

### Properties

| Property         | Type      | Optional | Description |
| ---------------- | --------- | -------- | ----------- | --- |
| id               | `string`  | No       | -           |
| name             | `string`  | No       | -           |
| description      | `string   | null`    | No          | -   |
| template_content | `string`  | No       | -           |
| is_default       | `boolean  | null`    | No          | -   |
| variables        | `Record`  | No       | -           |
| created_at       | `string   | null`    | No          | -   |
| updated_at       | `string   | null`    | No          | -   |
| user_id          | `string   | null`    | Yes         | -   |
| project_id       | `string   | null`    | Yes         | -   |
| in_use           | `boolean` | Yes      | -           |

---

## BriefType

**File:** `src/lib/types/daily-brief.ts`

```typescript
type BriefType = unknown | unknown;
```

---

## BrowserInfo

**File:** `src/lib/types/error-logging.ts`

```typescript
interface BrowserInfo {
	userAgent?: string;
	platform?: string;
	language?: string;
	screenResolution?: string;
	timezone?: string;
}
```

### Properties

| Property         | Type     | Optional | Description |
| ---------------- | -------- | -------- | ----------- |
| userAgent        | `string` | Yes      | -           |
| platform         | `string` | Yes      | -           |
| language         | `string` | Yes      | -           |
| screenResolution | `string` | Yes      | -           |
| timezone         | `string` | Yes      | -           |

---

## CalendarEvent

**File:** `src/lib/types/project.ts`

```typescript
type CalendarEvent = unknown;
```

---

## CalendarStatus

**File:** `src/lib/types/dashboard.ts`

```typescript
interface CalendarStatus {
	isConnected: boolean;
	loading: boolean;
	error: string | null;
}
```

### Properties

| Property    | Type      | Optional | Description |
| ----------- | --------- | -------- | ----------- | --- |
| isConnected | `boolean` | No       | -           |
| loading     | `boolean` | No       | -           |
| error       | `string   | null`    | No          | -   |

---

## CalendarStatus

**File:** `src/lib/types/project-page.types.ts`

```typescript
interface CalendarStatus {
	isConnected: boolean;
	needsRefresh: boolean;
	scope: string | null;
	lastSync: string | null;
}
```

### Properties

| Property     | Type      | Optional | Description |
| ------------ | --------- | -------- | ----------- | --- |
| isConnected  | `boolean` | No       | -           |
| needsRefresh | `boolean` | No       | -           |
| scope        | `string   | null`    | No          | -   |
| lastSync     | `string   | null`    | No          | -   |

---

## CleanedData

**File:** `src/lib/types/index.ts`

```typescript
interface CleanedData {
	data: T;
	validation: ValidationResult;
}
```

### Properties

| Property   | Type               | Optional | Description |
| ---------- | ------------------ | -------- | ----------- |
| data       | `T`                | No       | -           |
| validation | `ValidationResult` | No       | -           |

---

## CompletedBrainDump

**File:** `src/lib/types/brain-dump.ts`

```typescript
interface CompletedBrainDump {
	executionResult: ExecutionResult;
	brainDumpId: string;
}
```

### Properties

| Property        | Type              | Optional | Description |
| --------------- | ----------------- | -------- | ----------- |
| executionResult | `ExecutionResult` | No       | -           |
| brainDumpId     | `string`          | No       | -           |

---

## CompositeTypes

**File:** `src/lib/database.types.ts`

```typescript
type CompositeTypes = unknown;
```

---

## CreateProjectBriefTemplate

**File:** `src/lib/types/daily-brief.ts`

```typescript
interface CreateProjectBriefTemplate {
	name: string;
	description?: string;
	template_content: string;
	is_default?: boolean;
	variables?: string[];
}
```

### Properties

| Property         | Type       | Optional | Description |
| ---------------- | ---------- | -------- | ----------- |
| name             | `string`   | No       | -           |
| description      | `string`   | Yes      | -           |
| template_content | `string`   | No       | -           |
| is_default       | `boolean`  | Yes      | -           |
| variables        | `string[]` | Yes      | -           |

---

## DailyBrief

**File:** `src/lib/types/daily-brief.ts`

```typescript
interface DailyBrief {
	id: string;
	user_id: string;
	brief_date: string;
	summary_content: string;
	project_brief_ids?: string[];
	insights?: string;
	priority_actions?: string[];
	generation_status?: unknown | unknown | unknown;
	generation_error?: string;
	generation_started_at?: string;
	generation_completed_at?: string;
	generation_progress?: any;
	metadata?: any;
	created_at?: string;
	updated_at?: string;
}
```

### Properties

| Property                | Type       | Optional | Description |
| ----------------------- | ---------- | -------- | ----------- | --- | --- |
| id                      | `string`   | No       | -           |
| user_id                 | `string`   | No       | -           |
| brief_date              | `string`   | No       | -           |
| summary_content         | `string`   | No       | -           |
| project_brief_ids       | `string[]` | Yes      | -           |
| insights                | `string`   | Yes      | -           |
| priority_actions        | `string[]` | Yes      | -           |
| generation_status       | `unknown   | unknown  | unknown`    | Yes | -   |
| generation_error        | `string`   | Yes      | -           |
| generation_started_at   | `string`   | Yes      | -           |
| generation_completed_at | `string`   | Yes      | -           |
| generation_progress     | `any`      | Yes      | -           |
| metadata                | `any`      | Yes      | -           |
| created_at              | `string`   | Yes      | -           |
| updated_at              | `string`   | Yes      | -           |

---

## DailyBrief

**File:** `src/lib/types/index.ts`

```typescript
type DailyBrief = unknown;
```

---

## DailyBriefResult

**File:** `src/lib/types/daily-brief.ts`

```typescript
interface DailyBriefResult {
	project_briefs: Array;
	main_brief?: unknown;
}
```

### Properties

| Property       | Type      | Optional | Description |
| -------------- | --------- | -------- | ----------- |
| project_briefs | `Array`   | No       | -           |
| main_brief     | `unknown` | Yes      | -           |

---

## DailyBriefWithRelations

**File:** `src/lib/types/index.ts`

```typescript
interface DailyBriefWithRelations {
	project_daily_briefs?: ProjectDailyBriefWithProject[];
}
```

### Properties

| Property             | Type                             | Optional | Description |
| -------------------- | -------------------------------- | -------- | ----------- |
| project_daily_briefs | `ProjectDailyBriefWithProject[]` | Yes      | -           |

---

## DashboardProps

**File:** `src/lib/types/dashboard.ts`

```typescript
interface DashboardProps {
	user: User;
	initialData: DashboardData | null;
	isLoadingDashboard?: boolean;
	dashboardError?: string | null;
}
```

### Properties

| Property           | Type           | Optional | Description |
| ------------------ | -------------- | -------- | ----------- | --- |
| user               | `User`         | No       | -           |
| initialData        | `DashboardData | null`    | No          | -   |
| isLoadingDashboard | `boolean`      | Yes      | -           |
| dashboardError     | `string        | null`    | Yes         | -   |

---

## DashboardStats

**File:** `src/lib/types/dashboard.ts`

```typescript
interface DashboardStats {
	totalProjects: number;
	activeTasks: number;
	completedToday: number;
	upcomingDeadlines: number;
	weeklyProgress?: unknown;
}
```

### Properties

| Property          | Type      | Optional | Description |
| ----------------- | --------- | -------- | ----------- |
| totalProjects     | `number`  | No       | -           |
| activeTasks       | `number`  | No       | -           |
| completedToday    | `number`  | No       | -           |
| upcomingDeadlines | `number`  | No       | -           |
| weeklyProgress    | `unknown` | Yes      | -           |

---

## Database

**File:** `src/lib/database.types.ts`

```typescript
type Database = unknown;
```

---

## DatabaseSchema

**File:** `src/lib/database.schema.ts`

```typescript
type DatabaseSchema = unknown;
```

---

## DatabaseWithoutInternals

**File:** `src/lib/database.types.ts`

```typescript
type DatabaseWithoutInternals = Omit;
```

---

## DeepPartial

**File:** `src/lib/types/index.ts`

```typescript
type DeepPartial = unknown;
```

---

## DefaultSchema

**File:** `src/lib/database.types.ts`

```typescript
type DefaultSchema = unknown;
```

---

## DisplayedBrainDumpQuestion

**File:** `src/lib/types/brain-dump.ts`

```typescript
type DisplayedBrainDumpQuestion = unknown;
```

---

## DualProcessingStatus

**File:** `src/lib/types/brain-dump.ts`

```typescript
interface DualProcessingStatus {
	type: unknown | unknown | unknown | unknown | unknown | unknown | unknown;
	message?: string;
	data?: any;
	attempt?: number;
	maxAttempts?: number;
	processName?: string;
	result?: BrainDumpParseResult;
	error?: string;
}
```

### Properties

| Property    | Type                   | Optional | Description |
| ----------- | ---------------------- | -------- | ----------- | ------- | ------- | ------- | -------- | --- | --- |
| type        | `unknown               | unknown  | unknown     | unknown | unknown | unknown | unknown` | No  | -   |
| message     | `string`               | Yes      | -           |
| data        | `any`                  | Yes      | -           |
| attempt     | `number`               | Yes      | -           |
| maxAttempts | `number`               | Yes      | -           |
| processName | `string`               | Yes      | -           |
| result      | `BrainDumpParseResult` | Yes      | -           |
| error       | `string`               | Yes      | -           |

---

## EnhancementOptions

**File:** `src/lib/types/index.ts`

```typescript
interface EnhancementOptions {
	useEnhancedContext?: boolean;
	includeTimeContext?: boolean;
	includeActivityMetrics?: boolean;
	includeUpcomingEvents?: boolean;
	includeMotivationalContext?: boolean;
	includeEnergyAssessment?: boolean;
}
```

### Properties

| Property                   | Type      | Optional | Description |
| -------------------------- | --------- | -------- | ----------- |
| useEnhancedContext         | `boolean` | Yes      | -           |
| includeTimeContext         | `boolean` | Yes      | -           |
| includeActivityMetrics     | `boolean` | Yes      | -           |
| includeUpcomingEvents      | `boolean` | Yes      | -           |
| includeMotivationalContext | `boolean` | Yes      | -           |
| includeEnergyAssessment    | `boolean` | Yes      | -           |

---

## EnrichedBraindump

**File:** `src/lib/types/brain-dump.ts`

```typescript
interface EnrichedBraindump {
	brain_dump_links: any;
	isNote: boolean;
	isNewProject: boolean;
	linkedProject: any;
	linkedTypes: BrainDumpTableType[];
}
```

### Properties

| Property         | Type                   | Optional | Description |
| ---------------- | ---------------------- | -------- | ----------- |
| brain_dump_links | `any`                  | No       | -           |
| isNote           | `boolean`              | No       | -           |
| isNewProject     | `boolean`              | No       | -           |
| linkedProject    | `any`                  | No       | -           |
| linkedTypes      | `BrainDumpTableType[]` | No       | -           |

---

## Enums

**File:** `src/lib/database.types.ts`

```typescript
type Enums = unknown;
```

---

## ErrorContext

**File:** `src/lib/types/error-logging.ts`

```typescript
interface ErrorContext {
	userId?: string;
	projectId?: string;
	brainDumpId?: string;
	endpoint?: string;
	httpMethod?: string;
	requestId?: string;
	operationType?: string;
	tableName?: string;
	recordId?: string;
	operationPayload?: Record;
	llmMetadata?: LLMMetadata;
	browserInfo?: BrowserInfo;
	metadata?: Record;
}
```

### Properties

| Property         | Type          | Optional | Description |
| ---------------- | ------------- | -------- | ----------- |
| userId           | `string`      | Yes      | -           |
| projectId        | `string`      | Yes      | -           |
| brainDumpId      | `string`      | Yes      | -           |
| endpoint         | `string`      | Yes      | -           |
| httpMethod       | `string`      | Yes      | -           |
| requestId        | `string`      | Yes      | -           |
| operationType    | `string`      | Yes      | -           |
| tableName        | `string`      | Yes      | -           |
| recordId         | `string`      | Yes      | -           |
| operationPayload | `Record`      | Yes      | -           |
| llmMetadata      | `LLMMetadata` | Yes      | -           |
| browserInfo      | `BrowserInfo` | Yes      | -           |
| metadata         | `Record`      | Yes      | -           |

---

## ErrorLogEntry

**File:** `src/lib/types/error-logging.ts`

```typescript
interface ErrorLogEntry {
	id?: string;
	error_type?: ErrorType;
	errorType?: ErrorType;
	error_code?: string;
	errorCode?: string;
	error_message?: string;
	errorMessage?: string;
	error_stack?: string;
	errorStack?: string;
	severity?: ErrorSeverity;
	user_id?: string;
	userId?: string;
	user?: unknown;
	project_id?: string;
	projectId?: string;
	brain_dump_id?: string;
	brainDumpId?: string;
	endpoint?: string;
	http_method?: string;
	httpMethod?: string;
	request_id?: string;
	requestId?: string;
	user_agent?: string;
	userAgent?: string;
	ip_address?: string;
	ipAddress?: string;
	llm_provider?: string;
	llmProvider?: string;
	llm_model?: string;
	llmModel?: string;
	prompt_tokens?: number;
	promptTokens?: number;
	completion_tokens?: number;
	completionTokens?: number;
	total_tokens?: number;
	totalTokens?: number;
	response_time_ms?: number;
	responseTimeMs?: number;
	llm_temperature?: number;
	llmTemperature?: number;
	llm_max_tokens?: number;
	llmMaxTokens?: number;
	operation_type?: string;
	operationType?: string;
	table_name?: string;
	tableName?: string;
	record_id?: string;
	recordId?: string;
	operation_payload?: Record;
	operationPayload?: Record;
	metadata?: Record;
	environment?: unknown | unknown | unknown;
	app_version?: string;
	appVersion?: string;
	browser_info?: BrowserInfo;
	browserInfo?: BrowserInfo;
	resolved?: boolean;
	resolved_at?: string;
	resolvedAt?: string;
	resolved_by?: string;
	resolvedBy?: string;
	resolution_notes?: string;
	resolutionNotes?: string;
	created_at?: string;
	createdAt?: string;
	updated_at?: string;
	updatedAt?: string;
}
```

### Properties

| Property          | Type            | Optional | Description |
| ----------------- | --------------- | -------- | ----------- | --- | --- |
| id                | `string`        | Yes      | -           |
| error_type        | `ErrorType`     | Yes      | -           |
| errorType         | `ErrorType`     | Yes      | -           |
| error_code        | `string`        | Yes      | -           |
| errorCode         | `string`        | Yes      | -           |
| error_message     | `string`        | Yes      | -           |
| errorMessage      | `string`        | Yes      | -           |
| error_stack       | `string`        | Yes      | -           |
| errorStack        | `string`        | Yes      | -           |
| severity          | `ErrorSeverity` | Yes      | -           |
| user_id           | `string`        | Yes      | -           |
| userId            | `string`        | Yes      | -           |
| user              | `unknown`       | Yes      | -           |
| project_id        | `string`        | Yes      | -           |
| projectId         | `string`        | Yes      | -           |
| brain_dump_id     | `string`        | Yes      | -           |
| brainDumpId       | `string`        | Yes      | -           |
| endpoint          | `string`        | Yes      | -           |
| http_method       | `string`        | Yes      | -           |
| httpMethod        | `string`        | Yes      | -           |
| request_id        | `string`        | Yes      | -           |
| requestId         | `string`        | Yes      | -           |
| user_agent        | `string`        | Yes      | -           |
| userAgent         | `string`        | Yes      | -           |
| ip_address        | `string`        | Yes      | -           |
| ipAddress         | `string`        | Yes      | -           |
| llm_provider      | `string`        | Yes      | -           |
| llmProvider       | `string`        | Yes      | -           |
| llm_model         | `string`        | Yes      | -           |
| llmModel          | `string`        | Yes      | -           |
| prompt_tokens     | `number`        | Yes      | -           |
| promptTokens      | `number`        | Yes      | -           |
| completion_tokens | `number`        | Yes      | -           |
| completionTokens  | `number`        | Yes      | -           |
| total_tokens      | `number`        | Yes      | -           |
| totalTokens       | `number`        | Yes      | -           |
| response_time_ms  | `number`        | Yes      | -           |
| responseTimeMs    | `number`        | Yes      | -           |
| llm_temperature   | `number`        | Yes      | -           |
| llmTemperature    | `number`        | Yes      | -           |
| llm_max_tokens    | `number`        | Yes      | -           |
| llmMaxTokens      | `number`        | Yes      | -           |
| operation_type    | `string`        | Yes      | -           |
| operationType     | `string`        | Yes      | -           |
| table_name        | `string`        | Yes      | -           |
| tableName         | `string`        | Yes      | -           |
| record_id         | `string`        | Yes      | -           |
| recordId          | `string`        | Yes      | -           |
| operation_payload | `Record`        | Yes      | -           |
| operationPayload  | `Record`        | Yes      | -           |
| metadata          | `Record`        | Yes      | -           |
| environment       | `unknown        | unknown  | unknown`    | Yes | -   |
| app_version       | `string`        | Yes      | -           |
| appVersion        | `string`        | Yes      | -           |
| browser_info      | `BrowserInfo`   | Yes      | -           |
| browserInfo       | `BrowserInfo`   | Yes      | -           |
| resolved          | `boolean`       | Yes      | -           |
| resolved_at       | `string`        | Yes      | -           |
| resolvedAt        | `string`        | Yes      | -           |
| resolved_by       | `string`        | Yes      | -           |
| resolvedBy        | `string`        | Yes      | -           |
| resolution_notes  | `string`        | Yes      | -           |
| resolutionNotes   | `string`        | Yes      | -           |
| created_at        | `string`        | Yes      | -           |
| createdAt         | `string`        | Yes      | -           |
| updated_at        | `string`        | Yes      | -           |
| updatedAt         | `string`        | Yes      | -           |

---

## ErrorSeverity

**File:** `src/lib/types/error-logging.ts`

```typescript
type ErrorSeverity = unknown | unknown | unknown | unknown;
```

---

## ErrorType

**File:** `src/lib/types/error-logging.ts`

```typescript
type ErrorType =
	| unknown
	| unknown
	| unknown
	| unknown
	| unknown
	| unknown
	| unknown
	| unknown
	| unknown;
```

---

## EventData

**File:** `src/lib/types/events.ts`

```typescript
interface EventData {
	type: unknown | unknown | unknown;
	entity: unknown | unknown | unknown | unknown;
	data: T;
	id?: string;
	timestamp: string;
}
```

### Properties

| Property  | Type     | Optional | Description |
| --------- | -------- | -------- | ----------- | -------- | --- | --- |
| type      | `unknown | unknown  | unknown`    | No       | -   |
| entity    | `unknown | unknown  | unknown     | unknown` | No  | -   |
| data      | `T`      | No       | -           |
| id        | `string` | Yes      | -           |
| timestamp | `string` | No       | -           |

---

## ExecutionResult

**File:** `src/lib/types/brain-dump.ts`

```typescript
interface ExecutionResult {
	successful: ParsedOperation[];
	failed: Array;
	results?: Array;
	error?: string;
}
```

### Properties

| Property   | Type                | Optional | Description |
| ---------- | ------------------- | -------- | ----------- |
| successful | `ParsedOperation[]` | No       | -           |
| failed     | `Array`             | No       | -           |
| results    | `Array`             | Yes      | -           |
| error      | `string`            | Yes      | -           |

---

## FieldConfig

**File:** `src/lib/types/form.ts`

```typescript
interface FieldConfig {
	type:
		| unknown
		| unknown
		| unknown
		| unknown
		| unknown
		| unknown
		| unknown
		| unknown
		| unknown
		| unknown;
	label: string;
	required?: boolean;
	placeholder?: string;
	description?: string;
	options?: string[];
	min?: number;
	max?: number;
	rows?: number;
	markdown?: boolean;
	defaultValue?: any;
	copyButton?: boolean;
}
```

### Properties

| Property     | Type       | Optional | Description |
| ------------ | ---------- | -------- | ----------- | ------- | ------- | ------- | ------- | ------- | ------- | -------- | --- | --- |
| type         | `unknown   | unknown  | unknown     | unknown | unknown | unknown | unknown | unknown | unknown | unknown` | No  | -   |
| label        | `string`   | No       | -           |
| required     | `boolean`  | Yes      | -           |
| placeholder  | `string`   | Yes      | -           |
| description  | `string`   | Yes      | -           |
| options      | `string[]` | Yes      | -           |
| min          | `number`   | Yes      | -           |
| max          | `number`   | Yes      | -           |
| rows         | `number`   | Yes      | -           |
| markdown     | `boolean`  | Yes      | -           |
| defaultValue | `any`      | Yes      | -           |
| copyButton   | `boolean`  | Yes      | -           |

---

## FilterCounts

**File:** `src/lib/types/projects-page.ts`

```typescript
interface FilterCounts {
	all: number;
	active: number;
	paused: number;
	completed: number;
	archived: number;
}
```

### Properties

| Property  | Type     | Optional | Description |
| --------- | -------- | -------- | ----------- |
| all       | `number` | No       | -           |
| active    | `number` | No       | -           |
| paused    | `number` | No       | -           |
| completed | `number` | No       | -           |
| archived  | `number` | No       | -           |

---

## FormConfig

**File:** `src/lib/types/form.ts`

```typescript
interface FormConfig {
;
}
```

---

## FormModalProps

**File:** `src/lib/types/form.ts`

```typescript
interface FormModalProps {
	isOpen: boolean;
	title: string;
	submitText: string;
	loadingText: string;
	formConfig: FormConfig;
	initialData?: Record;
	onSubmit: unknown;
	onClose: unknown;
	size?: unknown | unknown | unknown | unknown;
}
```

### Properties

| Property    | Type         | Optional | Description |
| ----------- | ------------ | -------- | ----------- | -------- | --- | --- |
| isOpen      | `boolean`    | No       | -           |
| title       | `string`     | No       | -           |
| submitText  | `string`     | No       | -           |
| loadingText | `string`     | No       | -           |
| formConfig  | `FormConfig` | No       | -           |
| initialData | `Record`     | Yes      | -           |
| onSubmit    | `unknown`    | No       | -           |
| onClose     | `unknown`    | No       | -           |
| size        | `unknown     | unknown  | unknown     | unknown` | Yes | -   |

---

## FullProjectData

**File:** `src/lib/types/brain-dump.ts`

```typescript
interface FullProjectData {
	user_id: string;
	fullProjectWithRelations: ProjectWithRelations | null;
	timestamp: string;
}
```

### Properties

| Property                 | Type                  | Optional | Description |
| ------------------------ | --------------------- | -------- | ----------- | --- |
| user_id                  | `string`              | No       | -           |
| fullProjectWithRelations | `ProjectWithRelations | null`    | No          | -   |
| timestamp                | `string`              | No       | -           |

---

## GroupedSearchResults

**File:** `src/lib/types/search.ts`

```typescript
interface GroupedSearchResults {
	braindumps: SearchResult[];
	projects: SearchResult[];
	tasks: SearchResult[];
}
```

### Properties

| Property   | Type             | Optional | Description |
| ---------- | ---------------- | -------- | ----------- |
| braindumps | `SearchResult[]` | No       | -           |
| projects   | `SearchResult[]` | No       | -           |
| tasks      | `SearchResult[]` | No       | -           |

---

## HighlightedText

**File:** `src/lib/types/search.ts`

```typescript
interface HighlightedText {
	text: string;
	highlighted: boolean;
}
```

### Properties

| Property    | Type      | Optional | Description |
| ----------- | --------- | -------- | ----------- |
| text        | `string`  | No       | -           |
| highlighted | `boolean` | No       | -           |

---

## Json

**File:** `src/lib/database.types.ts`

```typescript
type Json = string | number | boolean | null | unknown | Json[];
```

---

## Json

**File:** `src/lib/database.schema.ts`

```typescript
type Json = string | number | boolean | null | unknown | Json[];
```

---

## LLMMetadata

**File:** `src/lib/types/error-logging.ts`

```typescript
interface LLMMetadata {
	provider?: string;
	model?: string;
	promptTokens?: number;
	completionTokens?: number;
	totalTokens?: number;
	responseTimeMs?: number;
	temperature?: number;
	maxTokens?: number;
}
```

### Properties

| Property         | Type     | Optional | Description |
| ---------------- | -------- | -------- | ----------- |
| provider         | `string` | Yes      | -           |
| model            | `string` | Yes      | -           |
| promptTokens     | `number` | Yes      | -           |
| completionTokens | `number` | Yes      | -           |
| totalTokens      | `number` | Yes      | -           |
| responseTimeMs   | `number` | Yes      | -           |
| temperature      | `number` | Yes      | -           |
| maxTokens        | `number` | Yes      | -           |

---

## LLMModel

**File:** `src/lib/types/llm.ts`

```typescript
interface LLMModel {
	id: string;
	name: string;
	maxOutputTokens?: number;
	supportsJsonMode?: boolean;
	defaultTemperature?: number;
	supportsSystemPrompt?: boolean;
	supportsTemperature?: boolean;
	description?: string;
	smartness?: number;
	inputCost?: number;
	outputCost?: number;
	maxContextTokens: number;
	recommendedMaxTokens: number;
	isReasoningModel?: boolean;
	timeoutMs?: number;
	knowledgeCutoff?: string;
}
```

### Properties

| Property             | Type      | Optional | Description |
| -------------------- | --------- | -------- | ----------- |
| id                   | `string`  | No       | -           |
| name                 | `string`  | No       | -           |
| maxOutputTokens      | `number`  | Yes      | -           |
| supportsJsonMode     | `boolean` | Yes      | -           |
| defaultTemperature   | `number`  | Yes      | -           |
| supportsSystemPrompt | `boolean` | Yes      | -           |
| supportsTemperature  | `boolean` | Yes      | -           |
| description          | `string`  | Yes      | -           |
| smartness            | `number`  | Yes      | -           |
| inputCost            | `number`  | Yes      | -           |
| outputCost           | `number`  | Yes      | -           |
| maxContextTokens     | `number`  | No       | -           |
| recommendedMaxTokens | `number`  | No       | -           |
| isReasoningModel     | `boolean` | Yes      | -           |
| timeoutMs            | `number`  | Yes      | -           |
| knowledgeCutoff      | `string`  | Yes      | -           |

---

## LLMProvider

**File:** `src/lib/types/llm.ts`

```typescript
interface LLMProvider {
	id: string;
	name: string;
	url: string;
	apiKey?: string;
	models: LLMModel[];
	stream: boolean;
	priority: number;
	timeout?: number;
	healthCheckEndpoint?: string;
}
```

### Properties

| Property            | Type         | Optional | Description |
| ------------------- | ------------ | -------- | ----------- |
| id                  | `string`     | No       | -           |
| name                | `string`     | No       | -           |
| url                 | `string`     | No       | -           |
| apiKey              | `string`     | Yes      | -           |
| models              | `LLMModel[]` | No       | -           |
| stream              | `boolean`    | No       | -           |
| priority            | `number`     | No       | -           |
| timeout             | `number`     | Yes      | -           |
| healthCheckEndpoint | `string`     | Yes      | -           |

---

## LLMRequest

**File:** `src/lib/types/index.ts`

```typescript
interface LLMRequest {
	systemPrompt: string;
	userPrompt: string;
	userId?: string;
	responseFormat?: unknown | unknown;
	temperature?: number;
	preferredModels?: string[];
}
```

### Properties

| Property        | Type       | Optional | Description |
| --------------- | ---------- | -------- | ----------- | --- |
| systemPrompt    | `string`   | No       | -           |
| userPrompt      | `string`   | No       | -           |
| userId          | `string`   | Yes      | -           |
| responseFormat  | `unknown   | unknown` | Yes         | -   |
| temperature     | `number`   | Yes      | -           |
| preferredModels | `string[]` | Yes      | -           |

---

## LLMRequest

**File:** `src/lib/types/llm.ts`

```typescript
interface LLMRequest {
	systemPrompt: string;
	userPrompt: string;
	userId: string | null;
	temperature?: number;
	responseFormat?: unknown | unknown;
	preferredModels?: string[];
	maxRetries?: number;
}
```

### Properties

| Property        | Type       | Optional | Description |
| --------------- | ---------- | -------- | ----------- | --- |
| systemPrompt    | `string`   | No       | -           |
| userPrompt      | `string`   | No       | -           |
| userId          | `string    | null`    | No          | -   |
| temperature     | `number`   | Yes      | -           |
| responseFormat  | `unknown   | unknown` | Yes         | -   |
| preferredModels | `string[]` | Yes      | -           |
| maxRetries      | `number`   | Yes      | -           |

---

## LLMResponse

**File:** `src/lib/types/index.ts`

```typescript
interface LLMResponse {
	result: any;
	model: string;
	tokensUsed?: number;
	duration?: number;
}
```

### Properties

| Property   | Type     | Optional | Description |
| ---------- | -------- | -------- | ----------- |
| result     | `any`    | No       | -           |
| model      | `string` | No       | -           |
| tokensUsed | `number` | Yes      | -           |
| duration   | `number` | Yes      | -           |

---

## LLMResponse

**File:** `src/lib/types/llm.ts`

```typescript
interface LLMResponse {
	result: T;
	provider: string;
	model: string;
	duration: number;
	attemptedProviders: string[];
	tokenUsage?: unknown;
}
```

### Properties

| Property           | Type       | Optional | Description |
| ------------------ | ---------- | -------- | ----------- |
| result             | `T`        | No       | -           |
| provider           | `string`   | No       | -           |
| model              | `string`   | No       | -           |
| duration           | `number`   | No       | -           |
| attemptedProviders | `string[]` | No       | -           |
| tokenUsage         | `unknown`  | Yes      | -           |

---

## ModalCallbacks

**File:** `src/lib/types/events.ts`

```typescript
interface ModalCallbacks {
	onUpdate?: unknown | null;
	onDelete?: OnDeleteCallback | null;
	onClose: OnCloseCallback;
}
```

### Properties

| Property | Type              | Optional | Description |
| -------- | ----------------- | -------- | ----------- | --- |
| onUpdate | `unknown          | null`    | Yes         | -   |
| onDelete | `OnDeleteCallback | null`    | Yes         | -   |
| onClose  | `OnCloseCallback` | No       | -           |

---

## ModalState

**File:** `src/lib/types/index.ts`

```typescript
interface ModalState {
	show: boolean;
	type: unknown | unknown | unknown | unknown | unknown | string;
	data: any;
}
```

### Properties

| Property | Type      | Optional | Description |
| -------- | --------- | -------- | ----------- | ------- | ------- | ------- | --- | --- |
| show     | `boolean` | No       | -           |
| type     | `unknown  | unknown  | unknown     | unknown | unknown | string` | No  | -   |
| data     | `any`     | No       | -           |

---

## ModalState

**File:** `src/lib/types/project.ts`

```typescript
interface ModalState {
	show: boolean;
	type: unknown | unknown | unknown | unknown | unknown | unknown | unknown;
	data: any;
}
```

### Properties

| Property | Type      | Optional | Description |
| -------- | --------- | -------- | ----------- | ------- | ------- | ------- | -------- | --- | --- |
| show     | `boolean` | No       | -           |
| type     | `unknown  | unknown  | unknown     | unknown | unknown | unknown | unknown` | No  | -   |
| data     | `any`     | No       | -           |

---

## Note

**File:** `src/lib/types/project.ts`

```typescript
type Note = unknown;
```

---

## NoteCallbacks

**File:** `src/lib/types/events.ts`

```typescript
interface NoteCallbacks {
	onUpdate?: unknown | null;
	onDelete?: OnDeleteCallback | null;
	onClose: OnCloseCallback;
}
```

### Properties

| Property | Type              | Optional | Description |
| -------- | ----------------- | -------- | ----------- | --- |
| onUpdate | `unknown          | null`    | Yes         | -   |
| onDelete | `OnDeleteCallback | null`    | Yes         | -   |
| onClose  | `OnCloseCallback` | No       | -           |

---

## NoteCategory

**File:** `src/lib/types/project.ts`

```typescript
type NoteCategory = unknown | unknown | unknown | unknown | unknown | unknown;
```

---

## NoteCreatePayload

**File:** `src/lib/types/project.ts`

```typescript
interface NoteCreatePayload {
;
}
```

---

## NoteFilters

**File:** `src/lib/types/project.ts`

```typescript
interface NoteFilters {
	category?: NoteCategory[];
	tags?: string[];
	search?: string;
}
```

### Properties

| Property | Type             | Optional | Description |
| -------- | ---------------- | -------- | ----------- |
| category | `NoteCategory[]` | Yes      | -           |
| tags     | `string[]`       | Yes      | -           |
| search   | `string`         | Yes      | -           |

---

## NoteInsert

**File:** `src/lib/types/project.ts`

```typescript
type NoteInsert = unknown;
```

---

## NoteOperation

**File:** `src/lib/types/brain-dump.ts`

```typescript
interface NoteOperation {
	table: unknown;
	operation: unknown | unknown;
	data: unknown;
}
```

### Properties

| Property  | Type      | Optional | Description |
| --------- | --------- | -------- | ----------- | --- |
| table     | `unknown` | No       | -           |
| operation | `unknown  | unknown` | No          | -   |
| data      | `unknown` | No       | -           |

---

## NoteUpdate

**File:** `src/lib/types/project.ts`

```typescript
type NoteUpdate = unknown;
```

---

## NudgeCard

**File:** `src/lib/types/dashboard.ts`

```typescript
interface NudgeCard {
	type: string;
	title: string;
	description: string;
	action: unknown;
	icon: any;
	color: string;
}
```

### Properties

| Property    | Type      | Optional | Description |
| ----------- | --------- | -------- | ----------- |
| type        | `string`  | No       | -           |
| title       | `string`  | No       | -           |
| description | `string`  | No       | -           |
| action      | `unknown` | No       | -           |
| icon        | `any`     | No       | -           |
| color       | `string`  | No       | -           |

---

## Nullable

**File:** `src/lib/types/index.ts`

```typescript
type Nullable = T | null;
```

---

## OnboardingCategory

**File:** `src/lib/types/index.ts`

```typescript
interface OnboardingCategory {
	id: unknown | unknown | unknown | unknown | unknown | unknown;
	title: string;
	description: string;
	fields: string[];
}
```

### Properties

| Property    | Type       | Optional | Description |
| ----------- | ---------- | -------- | ----------- | ------- | ------- | -------- | --- | --- |
| id          | `unknown   | unknown  | unknown     | unknown | unknown | unknown` | No  | -   |
| title       | `string`   | No       | -           |
| description | `string`   | No       | -           |
| fields      | `string[]` | No       | -           |

---

## OnboardingField

**File:** `src/lib/types/user-context.ts`

```typescript
interface OnboardingField {
	key: unknown;
	label: string;
	placeholder: string;
	type: unknown | unknown | unknown;
	required?: boolean;
	helpText?: string;
	examples?: string[];
}
```

### Properties

| Property    | Type       | Optional | Description |
| ----------- | ---------- | -------- | ----------- | --- | --- |
| key         | `unknown`  | No       | -           |
| label       | `string`   | No       | -           |
| placeholder | `string`   | No       | -           |
| type        | `unknown   | unknown  | unknown`    | No  | -   |
| required    | `boolean`  | Yes      | -           |
| helpText    | `string`   | Yes      | -           |
| examples    | `string[]` | Yes      | -           |

---

## OnboardingProgress

**File:** `src/lib/types/user-context.ts`

```typescript
interface OnboardingProgress {
	currentStep: number;
	totalSteps: number;
	completedSteps: string[];
	skippedSteps: string[];
}
```

### Properties

| Property       | Type       | Optional | Description |
| -------------- | ---------- | -------- | ----------- |
| currentStep    | `number`   | No       | -           |
| totalSteps     | `number`   | No       | -           |
| completedSteps | `string[]` | No       | -           |
| skippedSteps   | `string[]` | No       | -           |

---

## OnboardingProgressData

**File:** `src/lib/types/index.ts`

```typescript
interface OnboardingProgressData {
	completed: boolean;
	progress: number;
	missingFields: string[];
	completedFields: string[];
	missingRequiredFields: string[];
	categoryProgress: Record;
}
```

### Properties

| Property              | Type       | Optional | Description |
| --------------------- | ---------- | -------- | ----------- |
| completed             | `boolean`  | No       | -           |
| progress              | `number`   | No       | -           |
| missingFields         | `string[]` | No       | -           |
| completedFields       | `string[]` | No       | -           |
| missingRequiredFields | `string[]` | No       | -           |
| categoryProgress      | `Record`   | No       | -           |

---

## OnboardingStep

**File:** `src/lib/types/user-context.ts`

```typescript
interface OnboardingStep {
	id: string;
	title: string;
	subtitle: string;
	category: unknown | unknown | unknown | unknown | unknown | unknown;
	fields: OnboardingField[];
	icon?: string;
	voicePrompt?: string;
}
```

### Properties

| Property    | Type                | Optional | Description |
| ----------- | ------------------- | -------- | ----------- | ------- | ------- | -------- | --- | --- |
| id          | `string`            | No       | -           |
| title       | `string`            | No       | -           |
| subtitle    | `string`            | No       | -           |
| category    | `unknown            | unknown  | unknown     | unknown | unknown | unknown` | No  | -   |
| fields      | `OnboardingField[]` | No       | -           |
| icon        | `string`            | Yes      | -           |
| voicePrompt | `string`            | Yes      | -           |

---

## OnCloseCallback

**File:** `src/lib/types/events.ts`

```typescript
type OnCloseCallback = unknown;
```

---

## OnDeleteCallback

**File:** `src/lib/types/events.ts`

```typescript
type OnDeleteCallback = unknown;
```

---

## OperationType

**File:** `src/lib/types/brain-dump.ts`

```typescript
type OperationType = unknown | unknown | unknown;
```

---

## PageData

**File:** `src/lib/types/project-page.types.ts`

```typescript
type PageData = ProjectPageData;
```

---

## PageMetadata

**File:** `src/lib/types/project-page.types.ts`

```typescript
interface PageMetadata {
	activeTab: string;
	loadedAt: string;
	dataSize: unknown;
	loadStrategy: string;
	calendarConnected: boolean;
}
```

### Properties

| Property          | Type      | Optional | Description |
| ----------------- | --------- | -------- | ----------- |
| activeTab         | `string`  | No       | -           |
| loadedAt          | `string`  | No       | -           |
| dataSize          | `unknown` | No       | -           |
| loadStrategy      | `string`  | No       | -           |
| calendarConnected | `boolean` | No       | -           |

---

## PaginatedResponse

**File:** `src/lib/types/index.ts`

```typescript
interface PaginatedResponse {
	data: T[];
	total: number;
	page: number;
	pageSize: number;
	hasMore: boolean;
}
```

### Properties

| Property | Type      | Optional | Description |
| -------- | --------- | -------- | ----------- |
| data     | `T[]`     | No       | -           |
| total    | `number`  | No       | -           |
| page     | `number`  | No       | -           |
| pageSize | `number`  | No       | -           |
| hasMore  | `boolean` | No       | -           |

---

## ParsedOperation

**File:** `src/lib/types/brain-dump.ts`

```typescript
interface ParsedOperation {
	id: string;
	table: TableName;
	operation: OperationType;
	data: unknown;
	ref?: string;
	searchQuery?: string;
	conditions?: Record;
	enabled: boolean;
	error?: string;
	reasoning?: string;
	result?: Record;
}
```

### Properties

| Property    | Type            | Optional | Description |
| ----------- | --------------- | -------- | ----------- |
| id          | `string`        | No       | -           |
| table       | `TableName`     | No       | -           |
| operation   | `OperationType` | No       | -           |
| data        | `unknown`       | No       | -           |
| ref         | `string`        | Yes      | -           |
| searchQuery | `string`        | Yes      | -           |
| conditions  | `Record`        | Yes      | -           |
| enabled     | `boolean`       | No       | -           |
| error       | `string`        | Yes      | -           |
| reasoning   | `string`        | Yes      | -           |
| result      | `Record`        | Yes      | -           |

---

## Phase

**File:** `src/lib/types/index.ts`

```typescript
type Phase = unknown;
```

---

## Phase

**File:** `src/lib/types/project.ts`

```typescript
type Phase = unknown;
```

---

## PhaseCallbacks

**File:** `src/lib/types/events.ts`

```typescript
interface PhaseCallbacks {
	onUpdate?: unknown | null;
	onDelete?: OnDeleteCallback | null;
	onClose: OnCloseCallback;
	onPhasesUpdate?: unknown | null;
	onTasksUpdate?: unknown | null;
	onProjectUpdate?: unknown | null;
}
```

### Properties

| Property        | Type              | Optional | Description |
| --------------- | ----------------- | -------- | ----------- | --- |
| onUpdate        | `unknown          | null`    | Yes         | -   |
| onDelete        | `OnDeleteCallback | null`    | Yes         | -   |
| onClose         | `OnCloseCallback` | No       | -           |
| onPhasesUpdate  | `unknown          | null`    | Yes         | -   |
| onTasksUpdate   | `unknown          | null`    | Yes         | -   |
| onProjectUpdate | `unknown          | null`    | Yes         | -   |

---

## PhaseGenerationResult

**File:** `src/lib/types/index.ts`

```typescript
interface PhaseGenerationResult {
	phases: Array;
	task_assignments: unknown;
	recurring_tasks: string[];
	backlog_tasks: string[];
	summary: string;
}
```

### Properties

| Property         | Type       | Optional | Description |
| ---------------- | ---------- | -------- | ----------- |
| phases           | `Array`    | No       | -           |
| task_assignments | `unknown`  | No       | -           |
| recurring_tasks  | `string[]` | No       | -           |
| backlog_tasks    | `string[]` | No       | -           |
| summary          | `string`   | No       | -           |

---

## PhaseGenerationResult

**File:** `src/lib/types/project.ts`

```typescript
interface PhaseGenerationResult {
	phases: Array;
	task_assignments: unknown;
	recurring_tasks: string[];
	backlog_tasks: string[];
	summary: string;
	recurring_task_suggestions?: unknown;
	recurring_task_warnings?: string[];
}
```

### Properties

| Property                   | Type       | Optional | Description |
| -------------------------- | ---------- | -------- | ----------- |
| phases                     | `Array`    | No       | -           |
| task_assignments           | `unknown`  | No       | -           |
| recurring_tasks            | `string[]` | No       | -           |
| backlog_tasks              | `string[]` | No       | -           |
| summary                    | `string`   | No       | -           |
| recurring_task_suggestions | `unknown`  | Yes      | -           |
| recurring_task_warnings    | `string[]` | Yes      | -           |

---

## PhaseInsert

**File:** `src/lib/types/index.ts`

```typescript
type PhaseInsert = unknown;
```

---

## PhaseInsert

**File:** `src/lib/types/project.ts`

```typescript
type PhaseInsert = unknown;
```

---

## PhaseTask

**File:** `src/lib/types/project-page.types.ts`

```typescript
interface PhaseTask {
	suggested_start_date?: string | null;
	assignment_reason?: string | null;
}
```

### Properties

| Property             | Type    | Optional | Description |
| -------------------- | ------- | -------- | ----------- | --- |
| suggested_start_date | `string | null`    | Yes         | -   |
| assignment_reason    | `string | null`    | Yes         | -   |

---

## PhaseUpdate

**File:** `src/lib/types/project.ts`

```typescript
type PhaseUpdate = unknown;
```

---

## PhaseWithTasks

**File:** `src/lib/types/index.ts`

```typescript
interface PhaseWithTasks {
	tasks: Task[];
	task_count: number;
	completed_tasks: number;
}
```

### Properties

| Property        | Type     | Optional | Description |
| --------------- | -------- | -------- | ----------- |
| tasks           | `Task[]` | No       | -           |
| task_count      | `number` | No       | -           |
| completed_tasks | `number` | No       | -           |

---

## PhaseWithTasks

**File:** `src/lib/types/project-page.types.ts`

```typescript
type PhaseWithTasks = ProcessedPhase;
```

---

## PhaseWithTasks

**File:** `src/lib/types/project.ts`

```typescript
interface PhaseWithTasks {
	tasks: Task[];
	task_count: number;
	completed_tasks: number;
}
```

### Properties

| Property        | Type     | Optional | Description |
| --------------- | -------- | -------- | ----------- |
| tasks           | `Task[]` | No       | -           |
| task_count      | `number` | No       | -           |
| completed_tasks | `number` | No       | -           |

---

## PrimaryCTA

**File:** `src/lib/types/dashboard.ts`

```typescript
interface PrimaryCTA {
	title: string;
	subtitle?: string;
	description: string;
	primaryAction: unknown;
}
```

### Properties

| Property      | Type      | Optional | Description |
| ------------- | --------- | -------- | ----------- |
| title         | `string`  | No       | -           |
| subtitle      | `string`  | Yes      | -           |
| description   | `string`  | No       | -           |
| primaryAction | `unknown` | No       | -           |

---

## PriorityLevel

**File:** `src/lib/types/search.ts`

```typescript
type PriorityLevel = unknown | unknown | unknown;
```

---

## ProcessedPhase

**File:** `src/lib/types/project-page.types.ts`

```typescript
interface ProcessedPhase {
	tasks: PhaseTask[];
	task_count: number;
	completed_tasks: number;
}
```

### Properties

| Property        | Type          | Optional | Description |
| --------------- | ------------- | -------- | ----------- |
| tasks           | `PhaseTask[]` | No       | -           |
| task_count      | `number`      | No       | -           |
| completed_tasks | `number`      | No       | -           |

---

## Project

**File:** `src/lib/types/project.ts`

```typescript
type Project = unknown;
```

---

## ProjectBriefTemplate

**File:** `src/lib/types/index.ts`

```typescript
type ProjectBriefTemplate = unknown;
```

---

## ProjectBriefTemplate

**File:** `src/lib/types/project-brief-template.ts`

```typescript
interface ProjectBriefTemplate {
	id: string;
	name: string;
	description: string | null;
	template_content: string;
	variables: ProjectBriefVariables | null;
	project_id: string | null;
	user_id: string | null;
	in_use: boolean | null;
	is_default: boolean | null;
	created_at: string | null;
	updated_at: string | null;
}
```

### Properties

| Property         | Type                   | Optional | Description |
| ---------------- | ---------------------- | -------- | ----------- | --- |
| id               | `string`               | No       | -           |
| name             | `string`               | No       | -           |
| description      | `string                | null`    | No          | -   |
| template_content | `string`               | No       | -           |
| variables        | `ProjectBriefVariables | null`    | No          | -   |
| project_id       | `string                | null`    | No          | -   |
| user_id          | `string                | null`    | No          | -   |
| in_use           | `boolean               | null`    | No          | -   |
| is_default       | `boolean               | null`    | No          | -   |
| created_at       | `string                | null`    | No          | -   |
| updated_at       | `string                | null`    | No          | -   |

---

## ProjectBriefVariables

**File:** `src/lib/types/project-brief-template.ts`

```typescript
interface ProjectBriefVariables {
	project_name?: string;
	project_description?: string;
	brief_date?: string;
	executive_summary?: string;
	task_summary?: string;
	active_tasks?: string;
	blocked_tasks?: string;
	high_priority_tasks?: string;
	upcoming_tasks?: string;
	recent_notes?: string;
	key_context?: Record;
	progress_metrics?: string;
	next_actions?: string;
}
```

### Properties

| Property            | Type     | Optional | Description |
| ------------------- | -------- | -------- | ----------- |
| project_name        | `string` | Yes      | -           |
| project_description | `string` | Yes      | -           |
| brief_date          | `string` | Yes      | -           |
| executive_summary   | `string` | Yes      | -           |
| task_summary        | `string` | Yes      | -           |
| active_tasks        | `string` | Yes      | -           |
| blocked_tasks       | `string` | Yes      | -           |
| high_priority_tasks | `string` | Yes      | -           |
| upcoming_tasks      | `string` | Yes      | -           |
| recent_notes        | `string` | Yes      | -           |
| key_context         | `Record` | Yes      | -           |
| progress_metrics    | `string` | Yes      | -           |
| next_actions        | `string` | Yes      | -           |

---

## ProjectCallbacks

**File:** `src/lib/types/events.ts`

```typescript
interface ProjectCallbacks {
	onUpdate?: unknown | null;
	onDelete?: OnDeleteCallback | null;
	onClose: OnCloseCallback;
}
```

### Properties

| Property | Type              | Optional | Description |
| -------- | ----------------- | -------- | ----------- | --- |
| onUpdate | `unknown          | null`    | Yes         | -   |
| onDelete | `OnDeleteCallback | null`    | Yes         | -   |
| onClose  | `OnCloseCallback` | No       | -           |

---

## ProjectContextField

**File:** `src/lib/types/project-brief-template.ts`

```typescript
interface ProjectContextField {
	key: string;
	value: string;
	metadata?: unknown;
}
```

### Properties

| Property | Type      | Optional | Description |
| -------- | --------- | -------- | ----------- |
| key      | `string`  | No       | -           |
| value    | `string`  | No       | -           |
| metadata | `unknown` | Yes      | -           |

---

## ProjectContextResult

**File:** `src/lib/types/brain-dump.ts`

```typescript
interface ProjectContextResult {
	title?: string;
	summary?: string;
	insights?: string;
	tags?: string[];
	projectUpdate?: unknown;
	projectCreate?: unknown;
}
```

### Properties

| Property      | Type       | Optional | Description |
| ------------- | ---------- | -------- | ----------- |
| title         | `string`   | Yes      | -           |
| summary       | `string`   | Yes      | -           |
| insights      | `string`   | Yes      | -           |
| tags          | `string[]` | Yes      | -           |
| projectUpdate | `unknown`  | Yes      | -           |
| projectCreate | `unknown`  | Yes      | -           |

---

## ProjectCreatePayload

**File:** `src/lib/types/project.ts`

```typescript
interface ProjectCreatePayload {
;
}
```

---

## ProjectDailyBrief

**File:** `src/lib/types/daily-brief.ts`

```typescript
interface ProjectDailyBrief {
	id: string;
	user_id: string;
	project_id: string;
	template_id?: string;
	brief_content: string;
	brief_date: string;
	generation_status?: unknown | unknown | unknown;
	metadata?: any;
	created_at?: string;
	updated_at?: string;
	projects?: unknown;
}
```

### Properties

| Property          | Type      | Optional | Description |
| ----------------- | --------- | -------- | ----------- | --- | --- |
| id                | `string`  | No       | -           |
| user_id           | `string`  | No       | -           |
| project_id        | `string`  | No       | -           |
| template_id       | `string`  | Yes      | -           |
| brief_content     | `string`  | No       | -           |
| brief_date        | `string`  | No       | -           |
| generation_status | `unknown  | unknown  | unknown`    | Yes | -   |
| metadata          | `any`     | Yes      | -           |
| created_at        | `string`  | Yes      | -           |
| updated_at        | `string`  | Yes      | -           |
| projects          | `unknown` | Yes      | -           |

---

## ProjectDailyBrief

**File:** `src/lib/types/index.ts`

```typescript
type ProjectDailyBrief = unknown;
```

---

## ProjectDailyBriefWithProject

**File:** `src/lib/types/index.ts`

```typescript
interface ProjectDailyBriefWithProject {
	projects?: unknown;
}
```

### Properties

| Property | Type      | Optional | Description |
| -------- | --------- | -------- | ----------- |
| projects | `unknown` | Yes      | -           |

---

## ProjectFilter

**File:** `src/lib/types/projects-page.ts`

```typescript
type ProjectFilter = unknown | unknown | unknown | unknown | unknown;
```

---

## ProjectFilters

**File:** `src/lib/types/project.ts`

```typescript
interface ProjectFilters {
	status?: ProjectStatus[];
	tags?: string[];
	dateRange?: unknown;
	search?: string;
}
```

### Properties

| Property  | Type              | Optional | Description |
| --------- | ----------------- | -------- | ----------- |
| status    | `ProjectStatus[]` | Yes      | -           |
| tags      | `string[]`        | Yes      | -           |
| dateRange | `unknown`         | Yes      | -           |
| search    | `string`          | Yes      | -           |

---

## ProjectInsert

**File:** `src/lib/types/project.ts`

```typescript
type ProjectInsert = unknown;
```

---

## ProjectOperation

**File:** `src/lib/types/brain-dump.ts`

```typescript
interface ProjectOperation {
	table: unknown;
	operation: unknown | unknown;
	ref?: string;
	data: unknown;
}
```

### Properties

| Property  | Type      | Optional | Description |
| --------- | --------- | -------- | ----------- | --- |
| table     | `unknown` | No       | -           |
| operation | `unknown  | unknown` | No          | -   |
| ref       | `string`  | Yes      | -           |
| data      | `unknown` | No       | -           |

---

## ProjectPageData

**File:** `src/lib/types/project-page.types.ts`

```typescript
interface ProjectPageData {
	project: Project;
	tasks: TaskWithCalendarEvents[];
	doneTasks: TaskWithCalendarEvents[];
	deletedTasks: TaskWithCalendarEvents[];
	backlogTasks: TaskWithCalendarEvents[];
	scheduledTasks: TaskWithCalendarEvents[];
	notes: Note[];
	phases: ProcessedPhase[];
	calendarStatus: CalendarStatus;
	user: unknown;
	isFirstProject: boolean;
	taskStats: TaskStats;
	tabCounts: TabCounts;
	__meta: PageMetadata;
}
```

### Properties

| Property       | Type                       | Optional | Description |
| -------------- | -------------------------- | -------- | ----------- |
| project        | `Project`                  | No       | -           |
| tasks          | `TaskWithCalendarEvents[]` | No       | -           |
| doneTasks      | `TaskWithCalendarEvents[]` | No       | -           |
| deletedTasks   | `TaskWithCalendarEvents[]` | No       | -           |
| backlogTasks   | `TaskWithCalendarEvents[]` | No       | -           |
| scheduledTasks | `TaskWithCalendarEvents[]` | No       | -           |
| notes          | `Note[]`                   | No       | -           |
| phases         | `ProcessedPhase[]`         | No       | -           |
| calendarStatus | `CalendarStatus`           | No       | -           |
| user           | `unknown`                  | No       | -           |
| isFirstProject | `boolean`                  | No       | -           |
| taskStats      | `TaskStats`                | No       | -           |
| tabCounts      | `TabCounts`                | No       | -           |
| \_\_meta       | `PageMetadata`             | No       | -           |

---

## ProjectQuestion

**File:** `src/lib/types/project.ts`

```typescript
type ProjectQuestion = unknown;
```

---

## ProjectQuestionRow

**File:** `src/lib/types/brain-dump.ts`

```typescript
type ProjectQuestionRow = unknown;
```

---

## ProjectsFilterState

**File:** `src/lib/types/projects-page.ts`

```typescript
interface ProjectsFilterState {
	projectFilter: ProjectFilter;
	briefDateRange: BriefDateRange;
	selectedProjectFilter: string;
	searchQuery: string;
}
```

### Properties

| Property              | Type             | Optional | Description |
| --------------------- | ---------------- | -------- | ----------- |
| projectFilter         | `ProjectFilter`  | No       | -           |
| briefDateRange        | `BriefDateRange` | No       | -           |
| selectedProjectFilter | `string`         | No       | -           |
| searchQuery           | `string`         | No       | -           |

---

## ProjectsPageState

**File:** `src/lib/types/projects-page.ts`

```typescript
interface ProjectsPageState {
	activeTab: TabType;
	filters: ProjectsFilterState;
	briefsLoaded: boolean;
	loadingBriefs: boolean;
	projectBriefs: any[];
	selectedBrief: any | null;
	showBriefModal: boolean;
	showNewProjectModal: boolean;
	creatingProject: boolean;
	loadingProjectId: string;
}
```

### Properties

| Property            | Type                  | Optional | Description |
| ------------------- | --------------------- | -------- | ----------- | --- |
| activeTab           | `TabType`             | No       | -           |
| filters             | `ProjectsFilterState` | No       | -           |
| briefsLoaded        | `boolean`             | No       | -           |
| loadingBriefs       | `boolean`             | No       | -           |
| projectBriefs       | `any[]`               | No       | -           |
| selectedBrief       | `any                  | null`    | No          | -   |
| showBriefModal      | `boolean`             | No       | -           |
| showNewProjectModal | `boolean`             | No       | -           |
| creatingProject     | `boolean`             | No       | -           |
| loadingProjectId    | `string`              | No       | -           |

---

## ProjectStatus

**File:** `src/lib/types/project.ts`

```typescript
type ProjectStatus = unknown | unknown | unknown | unknown;
```

---

## ProjectStatus

**File:** `src/lib/types/search.ts`

```typescript
type ProjectStatus = unknown | unknown | unknown | unknown;
```

---

## ProjectSynthesis

**File:** `src/lib/types/index.ts`

```typescript
type ProjectSynthesis = unknown;
```

---

## ProjectSynthesisResult

**File:** `src/lib/types/index.ts`

```typescript
interface ProjectSynthesisResult {
	id: string;
	operations: ParsedOperation[];
	insights: string;
	comparison: TaskComparison[];
	summary: string;
}
```

### Properties

| Property   | Type                | Optional | Description |
| ---------- | ------------------- | -------- | ----------- |
| id         | `string`            | No       | -           |
| operations | `ParsedOperation[]` | No       | -           |
| insights   | `string`            | No       | -           |
| comparison | `TaskComparison[]`  | No       | -           |
| summary    | `string`            | No       | -           |

---

## ProjectUpdate

**File:** `src/lib/types/project.ts`

```typescript
type ProjectUpdate = unknown;
```

---

## ProjectWithRelations

**File:** `src/lib/types/project.ts`

```typescript
interface ProjectWithRelations {
	tasks: Task[];
	notes: Note[];
	phases?: PhaseWithTasks[];
}
```

### Properties

| Property | Type               | Optional | Description |
| -------- | ------------------ | -------- | ----------- |
| tasks    | `Task[]`           | No       | -           |
| notes    | `Note[]`           | No       | -           |
| phases   | `PhaseWithTasks[]` | Yes      | -           |

---

## PromptTemplate

**File:** `src/lib/types/index.ts`

```typescript
interface PromptTemplate {
	id: string;
	name: string;
	description?: string;
	template_content: string;
	variables?: string[];
	is_default?: boolean;
	user_id?: string;
}
```

### Properties

| Property         | Type       | Optional | Description |
| ---------------- | ---------- | -------- | ----------- |
| id               | `string`   | No       | -           |
| name             | `string`   | No       | -           |
| description      | `string`   | Yes      | -           |
| template_content | `string`   | No       | -           |
| variables        | `string[]` | Yes      | -           |
| is_default       | `boolean`  | Yes      | -           |
| user_id          | `string`   | Yes      | -           |

---

## RequireAtLeastOne

**File:** `src/lib/types/index.ts`

```typescript
type RequireAtLeastOne = unknown;
```

---

## SearchResult

**File:** `src/lib/types/search.ts`

```typescript
interface SearchResult {
	item_type: unknown | unknown | unknown;
	item_id: string;
	title: string;
	description: string;
	tags: string[] | null;
	status: string;
	project_id: string | null;
	created_at: string;
	updated_at: string;
	relevance_score: number;
	is_completed: boolean;
	is_deleted: boolean;
	matched_fields: string[];
}
```

### Properties

| Property        | Type       | Optional | Description |
| --------------- | ---------- | -------- | ----------- | --- | --- |
| item_type       | `unknown   | unknown  | unknown`    | No  | -   |
| item_id         | `string`   | No       | -           |
| title           | `string`   | No       | -           |
| description     | `string`   | No       | -           |
| tags            | `string[]  | null`    | No          | -   |
| status          | `string`   | No       | -           |
| project_id      | `string    | null`    | No          | -   |
| created_at      | `string`   | No       | -           |
| updated_at      | `string`   | No       | -           |
| relevance_score | `number`   | No       | -           |
| is_completed    | `boolean`  | No       | -           |
| is_deleted      | `boolean`  | No       | -           |
| matched_fields  | `string[]` | No       | -           |

---

## SearchState

**File:** `src/lib/types/search.ts`

```typescript
interface SearchState {
	query: string;
	results: GroupedSearchResults;
	isLoading: boolean;
	error: string | null;
	hasMore: unknown;
}
```

### Properties

| Property  | Type                   | Optional | Description |
| --------- | ---------------------- | -------- | ----------- | --- |
| query     | `string`               | No       | -           |
| results   | `GroupedSearchResults` | No       | -           |
| isLoading | `boolean`              | No       | -           |
| error     | `string                | null`    | No          | -   |
| hasMore   | `unknown`              | No       | -           |

---

## SoftDeletable

**File:** `src/lib/types/index.ts`

```typescript
interface SoftDeletable {
	deleted_at: string | null;
}
```

### Properties

| Property   | Type    | Optional | Description |
| ---------- | ------- | -------- | ----------- | --- |
| deleted_at | `string | null`    | No          | -   |

---

## SSEComplete

**File:** `src/lib/types/sse-messages.ts`

```typescript
interface SSEComplete {
	type: unknown;
	message: string;
	result: BrainDumpParseResult;
}
```

### Properties

| Property | Type                   | Optional | Description |
| -------- | ---------------------- | -------- | ----------- |
| type     | `unknown`              | No       | -           |
| message  | `string`               | No       | -           |
| result   | `BrainDumpParseResult` | No       | -           |

---

## SSEContextProgress

**File:** `src/lib/types/sse-messages.ts`

```typescript
interface SSEContextProgress {
	type: unknown;
	message: string;
	data: unknown;
}
```

### Properties

| Property | Type      | Optional | Description |
| -------- | --------- | -------- | ----------- |
| type     | `unknown` | No       | -           |
| message  | `string`  | No       | -           |
| data     | `unknown` | No       | -           |

---

## SSEContextUpdateRequired

**File:** `src/lib/types/sse-messages.ts`

```typescript
interface SSEContextUpdateRequired {
	type: unknown;
	message: string;
	data: unknown;
}
```

### Properties

| Property | Type      | Optional | Description |
| -------- | --------- | -------- | ----------- |
| type     | `unknown` | No       | -           |
| message  | `string`  | No       | -           |
| data     | `unknown` | No       | -           |

---

## SSEError

**File:** `src/lib/types/sse-messages.ts`

```typescript
interface SSEError {
	type: unknown;
	message: string;
	error: string;
	context?: unknown | unknown | unknown;
	recoverable?: boolean;
}
```

### Properties

| Property    | Type      | Optional | Description |
| ----------- | --------- | -------- | ----------- | --- | --- |
| type        | `unknown` | No       | -           |
| message     | `string`  | No       | -           |
| error       | `string`  | No       | -           |
| context     | `unknown  | unknown  | unknown`    | Yes | -   |
| recoverable | `boolean` | Yes      | -           |

---

## SSERetry

**File:** `src/lib/types/sse-messages.ts`

```typescript
interface SSERetry {
	type: unknown;
	message: string;
	attempt: number;
	maxAttempts: number;
	processName: string;
}
```

### Properties

| Property    | Type      | Optional | Description |
| ----------- | --------- | -------- | ----------- |
| type        | `unknown` | No       | -           |
| message     | `string`  | No       | -           |
| attempt     | `number`  | No       | -           |
| maxAttempts | `number`  | No       | -           |
| processName | `string`  | No       | -           |

---

## SSEStatus

**File:** `src/lib/types/sse-messages.ts`

```typescript
interface SSEStatus {
	type: unknown;
	message: string;
	data: unknown;
}
```

### Properties

| Property | Type      | Optional | Description |
| -------- | --------- | -------- | ----------- |
| type     | `unknown` | No       | -           |
| message  | `string`  | No       | -           |
| data     | `unknown` | No       | -           |

---

## SSETasksProgress

**File:** `src/lib/types/sse-messages.ts`

```typescript
interface SSETasksProgress {
	type: unknown;
	message: string;
	data: unknown;
}
```

### Properties

| Property | Type      | Optional | Description |
| -------- | --------- | -------- | ----------- |
| type     | `unknown` | No       | -           |
| message  | `string`  | No       | -           |
| data     | `unknown` | No       | -           |

---

## StreamEvent

**File:** `src/lib/types/daily-brief.ts`

```typescript
interface StreamEvent {
	type: unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown;
	data: any;
}
```

### Properties

| Property | Type     | Optional | Description |
| -------- | -------- | -------- | ----------- | ------- | ------- | ------- | ------- | -------- | --- | --- |
| type     | `unknown | unknown  | unknown     | unknown | unknown | unknown | unknown | unknown` | No  | -   |
| data     | `any`    | No       | -           |

---

## StreamEvent

**File:** `src/lib/types/index.ts`

```typescript
interface StreamEvent {
	type: unknown | unknown | unknown | unknown | unknown | unknown;
	data: any;
}
```

### Properties

| Property | Type     | Optional | Description |
| -------- | -------- | -------- | ----------- | ------- | ------- | -------- | --- | --- |
| type     | `unknown | unknown  | unknown     | unknown | unknown | unknown` | No  | -   |
| data     | `any`    | No       | -           |

---

## StreamingBriefData

**File:** `src/lib/types/daily-brief.ts`

```typescript
interface StreamingBriefData {
	projectBriefs: ProjectDailyBrief[];
	mainBrief?: unknown;
}
```

### Properties

| Property      | Type                  | Optional | Description |
| ------------- | --------------------- | -------- | ----------- |
| projectBriefs | `ProjectDailyBrief[]` | No       | -           |
| mainBrief     | `unknown`             | Yes      | -           |

---

## StreamingBriefData

**File:** `src/lib/types/index.ts`

```typescript
interface StreamingBriefData {
	projectBriefs: ProjectDailyBrief[];
	mainBrief?: unknown;
}
```

### Properties

| Property      | Type                  | Optional | Description |
| ------------- | --------------------- | -------- | ----------- |
| projectBriefs | `ProjectDailyBrief[]` | No       | -           |
| mainBrief     | `unknown`             | Yes      | -           |

---

## StreamingMessage

**File:** `src/lib/types/sse-messages.ts`

```typescript
type StreamingMessage =
	| SSEContextProgress
	| SSETasksProgress
	| SSEStatus
	| SSEContextUpdateRequired
	| SSERetry
	| SSEComplete
	| SSEError;
```

---

## StreamingState

**File:** `src/lib/types/sse-messages.ts`

```typescript
interface StreamingState {
	contextStatus: unknown | unknown | unknown | unknown | unknown;
	tasksStatus: unknown | unknown | unknown | unknown;
	contextResult?: ProjectContextResult;
	tasksResult?: TaskNoteExtractionResult;
	contextProgress?: string;
	tasksProgress?: string;
	isShortBraindump?: boolean;
	isDualProcessing?: boolean;
	showContextPanel?: boolean;
}
```

### Properties

| Property         | Type                       | Optional | Description |
| ---------------- | -------------------------- | -------- | ----------- | -------- | -------- | --- | --- |
| contextStatus    | `unknown                   | unknown  | unknown     | unknown  | unknown` | No  | -   |
| tasksStatus      | `unknown                   | unknown  | unknown     | unknown` | No       | -   |
| contextResult    | `ProjectContextResult`     | Yes      | -           |
| tasksResult      | `TaskNoteExtractionResult` | Yes      | -           |
| contextProgress  | `string`                   | Yes      | -           |
| tasksProgress    | `string`                   | Yes      | -           |
| isShortBraindump | `boolean`                  | Yes      | -           |
| isDualProcessing | `boolean`                  | Yes      | -           |
| showContextPanel | `boolean`                  | Yes      | -           |

---

## StreamingStatus

**File:** `src/lib/types/daily-brief.ts`

```typescript
interface StreamingStatus {
	isGenerating: boolean;
	currentStep:
		| unknown
		| unknown
		| unknown
		| unknown
		| unknown
		| unknown
		| unknown
		| unknown
		| unknown
		| unknown
		| unknown
		| unknown
		| unknown
		| string;
	message: string;
	progress: unknown;
	error?: string;
}
```

### Properties

| Property     | Type      | Optional | Description |
| ------------ | --------- | -------- | ----------- | ------- | ------- | ------- | ------- | ------- | ------- | ------- | ------- | ------- | ------- | ------- | --- | --- |
| isGenerating | `boolean` | No       | -           |
| currentStep  | `unknown  | unknown  | unknown     | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | string` | No  | -   |
| message      | `string`  | No       | -           |
| progress     | `unknown` | No       | -           |
| error        | `string`  | Yes      | -           |

---

## StreamingStatus

**File:** `src/lib/types/index.ts`

```typescript
interface StreamingStatus {
	isGenerating: boolean;
	currentStep: unknown | unknown | unknown | unknown | unknown | unknown | unknown;
	message: string;
	progress: unknown;
	error?: string;
}
```

### Properties

| Property     | Type      | Optional | Description |
| ------------ | --------- | -------- | ----------- | ------- | ------- | ------- | -------- | --- | --- |
| isGenerating | `boolean` | No       | -           |
| currentStep  | `unknown  | unknown  | unknown     | unknown | unknown | unknown | unknown` | No  | -   |
| message      | `string`  | No       | -           |
| progress     | `unknown` | No       | -           |
| error        | `string`  | Yes      | -           |

---

## SynthesisContent

**File:** `src/lib/types/index.ts`

```typescript
interface SynthesisContent {
	operations: ParsedOperation[];
	insights: string;
	comparison: TaskComparison[];
	summary: string;
}
```

### Properties

| Property   | Type                | Optional | Description |
| ---------- | ------------------- | -------- | ----------- |
| operations | `ParsedOperation[]` | No       | -           |
| insights   | `string`            | No       | -           |
| comparison | `TaskComparison[]`  | No       | -           |
| summary    | `string`            | No       | -           |

---

## SynthesisOption

**File:** `src/lib/types/synthesis.ts`

```typescript
interface SynthesisOption {
	id: string;
	name: string;
	description: string;
	detailedDescription?: string;
	enabled: boolean;
	available: boolean;
	config?: any;
	icon?: string;
}
```

### Properties

| Property            | Type      | Optional | Description |
| ------------------- | --------- | -------- | ----------- |
| id                  | `string`  | No       | -           |
| name                | `string`  | No       | -           |
| description         | `string`  | No       | -           |
| detailedDescription | `string`  | Yes      | -           |
| enabled             | `boolean` | No       | -           |
| available           | `boolean` | No       | -           |
| config              | `any`     | Yes      | -           |
| icon                | `string`  | Yes      | -           |

---

## SynthesisOptions

**File:** `src/lib/types/synthesis.ts`

```typescript
interface SynthesisOptions {
	selectedModules: string[];
	config: unknown;
}
```

### Properties

| Property        | Type       | Optional | Description |
| --------------- | ---------- | -------- | ----------- |
| selectedModules | `string[]` | No       | -           |
| config          | `unknown`  | No       | -           |

---

## SynthesisRequest

**File:** `src/lib/types/synthesis.ts`

```typescript
interface SynthesisRequest {
	projectId: string;
	options: SynthesisOptions;
	regenerate?: boolean;
	includeDeleted?: boolean;
}
```

### Properties

| Property       | Type               | Optional | Description |
| -------------- | ------------------ | -------- | ----------- |
| projectId      | `string`           | No       | -           |
| options        | `SynthesisOptions` | No       | -           |
| regenerate     | `boolean`          | Yes      | -           |
| includeDeleted | `boolean`          | Yes      | -           |

---

## SystemMetric

**File:** `src/lib/types/index.ts`

```typescript
interface SystemMetric {
	metric_name: string;
	value: number;
	unit?: string;
	description?: string;
	timestamp: string;
}
```

### Properties

| Property    | Type     | Optional | Description |
| ----------- | -------- | -------- | ----------- |
| metric_name | `string` | No       | -           |
| value       | `number` | No       | -           |
| unit        | `string` | Yes      | -           |
| description | `string` | Yes      | -           |
| timestamp   | `string` | No       | -           |

---

## TabCounts

**File:** `src/lib/types/project-page.types.ts`

```typescript
interface TabCounts {
	tasks: number;
	notes: number;
	deletedTasks: number;
	doneTasks: number;
	phases: number;
	scheduled: number;
	briefs: number;
}
```

### Properties

| Property     | Type     | Optional | Description |
| ------------ | -------- | -------- | ----------- |
| tasks        | `number` | No       | -           |
| notes        | `number` | No       | -           |
| deletedTasks | `number` | No       | -           |
| doneTasks    | `number` | No       | -           |
| phases       | `number` | No       | -           |
| scheduled    | `number` | No       | -           |
| briefs       | `number` | No       | -           |

---

## TableName

**File:** `src/lib/types/brain-dump.ts`

```typescript
type TableName =
	| unknown
	| unknown
	| unknown
	| unknown
	| unknown
	| unknown
	| unknown
	| unknown
	| unknown;
```

---

## Tables

**File:** `src/lib/database.types.ts`

```typescript
type Tables = unknown;
```

---

## TablesInsert

**File:** `src/lib/database.types.ts`

```typescript
type TablesInsert = unknown;
```

---

## TablesUpdate

**File:** `src/lib/database.types.ts`

```typescript
type TablesUpdate = unknown;
```

---

## TabType

**File:** `src/lib/types/index.ts`

```typescript
type TabType = unknown | unknown | unknown | unknown;
```

---

## TabType

**File:** `src/lib/types/project.ts`

```typescript
type TabType = unknown | unknown | unknown | unknown;
```

---

## TabType

**File:** `src/lib/types/projects-page.ts`

```typescript
type TabType = unknown | unknown;
```

---

## Task

**File:** `src/lib/types/project.ts`

```typescript
type Task = unknown;
```

---

## TaskCalendarEvent

**File:** `src/lib/types/project-page.types.ts`

```typescript
interface TaskCalendarEvent {
	id: string;
	calendar_event_id: string;
	calendar_id: string;
	event_start: string;
	event_end: string;
	event_link: string | null;
	event_title: string | null;
	sync_status: unknown | unknown | unknown | unknown;
	sync_error: string | null;
	last_synced_at: string | null;
}
```

### Properties

| Property          | Type     | Optional | Description |
| ----------------- | -------- | -------- | ----------- | -------- | --- | --- |
| id                | `string` | No       | -           |
| calendar_event_id | `string` | No       | -           |
| calendar_id       | `string` | No       | -           |
| event_start       | `string` | No       | -           |
| event_end         | `string` | No       | -           |
| event_link        | `string  | null`    | No          | -        |
| event_title       | `string  | null`    | No          | -        |
| sync_status       | `unknown | unknown  | unknown     | unknown` | No  | -   |
| sync_error        | `string  | null`    | No          | -        |
| last_synced_at    | `string  | null`    | No          | -        |

---

## TaskCallbacks

**File:** `src/lib/types/events.ts`

```typescript
interface TaskCallbacks {
	onUpdate?: unknown | null;
	onDelete?: OnDeleteCallback | null;
	onClose: OnCloseCallback;
}
```

### Properties

| Property | Type              | Optional | Description |
| -------- | ----------------- | -------- | ----------- | --- |
| onUpdate | `unknown          | null`    | Yes         | -   |
| onDelete | `OnDeleteCallback | null`    | Yes         | -   |
| onClose  | `OnCloseCallback` | No       | -           |

---

## TaskComparison

**File:** `src/lib/types/index.ts`

```typescript
interface TaskComparison {
	type: unknown | unknown | unknown;
	originalTasks?: string[] | Task[];
	newTask?: Partial;
	reasoning: string;
}
```

### Properties

| Property      | Type      | Optional | Description |
| ------------- | --------- | -------- | ----------- | --- | --- |
| type          | `unknown  | unknown  | unknown`    | No  | -   |
| originalTasks | `string[] | Task[]`  | Yes         | -   |
| newTask       | `Partial` | Yes      | -           |
| reasoning     | `string`  | No       | -           |

---

## TaskCreatePayload

**File:** `src/lib/types/project.ts`

```typescript
interface TaskCreatePayload {
;
}
```

---

## TaskFilter

**File:** `src/lib/types/index.ts`

```typescript
type TaskFilter = unknown | unknown | unknown | unknown | unknown | unknown;
```

---

## TaskFilters

**File:** `src/lib/types/project.ts`

```typescript
interface TaskFilters {
	status?: TaskStatus[];
	priority?: TaskPriority[];
	type?: TaskType[];
	phaseId?: string;
	search?: string;
}
```

### Properties

| Property | Type             | Optional | Description |
| -------- | ---------------- | -------- | ----------- |
| status   | `TaskStatus[]`   | Yes      | -           |
| priority | `TaskPriority[]` | Yes      | -           |
| type     | `TaskType[]`     | Yes      | -           |
| phaseId  | `string`         | Yes      | -           |
| search   | `string`         | Yes      | -           |

---

## TaskInsert

**File:** `src/lib/types/project.ts`

```typescript
type TaskInsert = unknown;
```

---

## TaskNoteExtractionResult

**File:** `src/lib/types/brain-dump.ts`

```typescript
interface TaskNoteExtractionResult {
	tasks: Array;
	notes: Array;
}
```

### Properties

| Property | Type    | Optional | Description |
| -------- | ------- | -------- | ----------- |
| tasks    | `Array` | No       | -           |
| notes    | `Array` | No       | -           |

---

## TaskOperation

**File:** `src/lib/types/brain-dump.ts`

```typescript
interface TaskOperation {
	table: unknown;
	operation: unknown | unknown;
	data: unknown;
}
```

### Properties

| Property  | Type      | Optional | Description |
| --------- | --------- | -------- | ----------- | --- |
| table     | `unknown` | No       | -           |
| operation | `unknown  | unknown` | No          | -   |
| data      | `unknown` | No       | -           |

---

## TaskPriority

**File:** `src/lib/types/project.ts`

```typescript
type TaskPriority = unknown | unknown | unknown;
```

---

## TaskStats

**File:** `src/lib/types/project-page.types.ts`

```typescript
interface TaskStats {
	total: number;
	completed: number;
	inProgress: number;
	blocked: number;
	deleted: number;
	active: number;
	backlog: number;
	scheduled: number;
}
```

### Properties

| Property   | Type     | Optional | Description |
| ---------- | -------- | -------- | ----------- |
| total      | `number` | No       | -           |
| completed  | `number` | No       | -           |
| inProgress | `number` | No       | -           |
| blocked    | `number` | No       | -           |
| deleted    | `number` | No       | -           |
| active     | `number` | No       | -           |
| backlog    | `number` | No       | -           |
| scheduled  | `number` | No       | -           |

---

## TaskStatus

**File:** `src/lib/types/project.ts`

```typescript
type TaskStatus = unknown | unknown | unknown | unknown;
```

---

## TaskStatus

**File:** `src/lib/types/search.ts`

```typescript
type TaskStatus = unknown | unknown | unknown | unknown;
```

---

## TaskSynthesisConfig

**File:** `src/lib/types/synthesis.ts`

```typescript
interface TaskSynthesisConfig {
	consolidation: unknown;
	sequencing: unknown;
	grouping: unknown;
	timeEstimation: unknown;
	gapAnalysis: unknown;
	dependencies: unknown;
}
```

### Properties

| Property       | Type      | Optional | Description |
| -------------- | --------- | -------- | ----------- |
| consolidation  | `unknown` | No       | -           |
| sequencing     | `unknown` | No       | -           |
| grouping       | `unknown` | No       | -           |
| timeEstimation | `unknown` | No       | -           |
| gapAnalysis    | `unknown` | No       | -           |
| dependencies   | `unknown` | No       | -           |

---

## TaskType

**File:** `src/lib/types/project.ts`

```typescript
type TaskType = unknown | unknown;
```

---

## TaskUpdate

**File:** `src/lib/types/project.ts`

```typescript
type TaskUpdate = unknown;
```

---

## TaskWithCalendarEvents

**File:** `src/lib/types/project-page.types.ts`

```typescript
interface TaskWithCalendarEvents {
	task_calendar_events?: TaskCalendarEvent[];
}
```

### Properties

| Property             | Type                  | Optional | Description |
| -------------------- | --------------------- | -------- | ----------- |
| task_calendar_events | `TaskCalendarEvent[]` | Yes      | -           |

---

## TemplateGenerationRequest

**File:** `src/lib/types/project-brief-template.ts`

```typescript
interface TemplateGenerationRequest {
	projectId: string;
	userId: string;
	templateName?: string;
	description?: string;
}
```

### Properties

| Property     | Type     | Optional | Description |
| ------------ | -------- | -------- | ----------- |
| projectId    | `string` | No       | -           |
| userId       | `string` | No       | -           |
| templateName | `string` | Yes      | -           |
| description  | `string` | Yes      | -           |

---

## TemplateGenerationResponse

**File:** `src/lib/types/project-brief-template.ts`

```typescript
interface TemplateGenerationResponse {
	success: boolean;
	template?: ProjectBriefTemplate;
	error?: string;
	details?: string;
	regenerated?: boolean;
}
```

### Properties

| Property    | Type                   | Optional | Description |
| ----------- | ---------------------- | -------- | ----------- |
| success     | `boolean`              | No       | -           |
| template    | `ProjectBriefTemplate` | Yes      | -           |
| error       | `string`               | Yes      | -           |
| details     | `string`               | Yes      | -           |
| regenerated | `boolean`              | Yes      | -           |

---

## TemplateMetadata

**File:** `src/lib/types/project-brief-template.ts`

```typescript
interface TemplateMetadata {
	projectType?: unknown | unknown | unknown | unknown | unknown | unknown;
	focusAreas?: string[];
	updateFrequency?: unknown | unknown | unknown;
	complexity?: unknown | unknown | unknown;
	generatedAt?: string;
	lastUsed?: string;
	usageCount?: number;
}
```

### Properties

| Property        | Type       | Optional | Description |
| --------------- | ---------- | -------- | ----------- | ------- | ------- | -------- | --- | --- |
| projectType     | `unknown   | unknown  | unknown     | unknown | unknown | unknown` | Yes | -   |
| focusAreas      | `string[]` | Yes      | -           |
| updateFrequency | `unknown   | unknown  | unknown`    | Yes     | -       |
| complexity      | `unknown   | unknown  | unknown`    | Yes     | -       |
| generatedAt     | `string`   | Yes      | -           |
| lastUsed        | `string`   | Yes      | -           |
| usageCount      | `number`   | Yes      | -           |

---

## TemplateSection

**File:** `src/lib/types/project-brief-template.ts`

```typescript
interface TemplateSection {
	title: string;
	icon?: string;
	condition?: string;
	content: string;
	order: number;
}
```

### Properties

| Property  | Type     | Optional | Description |
| --------- | -------- | -------- | ----------- |
| title     | `string` | No       | -           |
| icon      | `string` | Yes      | -           |
| condition | `string` | Yes      | -           |
| content   | `string` | No       | -           |
| order     | `number` | No       | -           |

---

## TemplateValidation

**File:** `src/lib/types/project-brief-template.ts`

```typescript
interface TemplateValidation {
	isValid: boolean;
	errors?: string[];
	warnings?: string[];
	requiredVariables?: string[];
	availableVariables?: string[];
}
```

### Properties

| Property           | Type       | Optional | Description |
| ------------------ | ---------- | -------- | ----------- |
| isValid            | `boolean`  | No       | -           |
| errors             | `string[]` | Yes      | -           |
| warnings           | `string[]` | Yes      | -           |
| requiredVariables  | `string[]` | Yes      | -           |
| availableVariables | `string[]` | Yes      | -           |

---

## TemplateValidationResult

**File:** `src/lib/types/daily-brief.ts`

```typescript
interface TemplateValidationResult {
	isValid: boolean;
	errors: string[];
	warnings: string[];
	variables: TemplateVariable[];
}
```

### Properties

| Property  | Type                 | Optional | Description |
| --------- | -------------------- | -------- | ----------- |
| isValid   | `boolean`            | No       | -           |
| errors    | `string[]`           | No       | -           |
| warnings  | `string[]`           | No       | -           |
| variables | `TemplateVariable[]` | No       | -           |

---

## TemplateVariable

**File:** `src/lib/types/daily-brief.ts`

```typescript
interface TemplateVariable {
	name: string;
	description: string;
	required: boolean;
	type: unknown | unknown | unknown | unknown;
	defaultValue?: string | number | boolean | any[];
}
```

### Properties

| Property     | Type      | Optional | Description |
| ------------ | --------- | -------- | ----------- | -------- | --- | --- |
| name         | `string`  | No       | -           |
| description  | `string`  | No       | -           |
| required     | `boolean` | No       | -           |
| type         | `unknown  | unknown  | unknown     | unknown` | No  | -   |
| defaultValue | `string   | number   | boolean     | any[]`   | Yes | -   |

---

## TemplateVariableMap

**File:** `src/lib/types/project-brief-template.ts`

```typescript
type TemplateVariableMap = Map;
```

---

## ThresholdCalculation

**File:** `src/lib/types/brain-dump.ts`

```typescript
interface ThresholdCalculation {
	brainDumpLength: number;
	existingProjectContextLength: number;
	totalLength: number;
	shouldUseDualProcessing: boolean;
	reason?: string;
}
```

### Properties

| Property                     | Type      | Optional | Description |
| ---------------------------- | --------- | -------- | ----------- |
| brainDumpLength              | `number`  | No       | -           |
| existingProjectContextLength | `number`  | No       | -           |
| totalLength                  | `number`  | No       | -           |
| shouldUseDualProcessing      | `boolean` | No       | -           |
| reason                       | `string`  | Yes      | -           |

---

## UpdateProjectBriefTemplate

**File:** `src/lib/types/daily-brief.ts`

```typescript
interface UpdateProjectBriefTemplate {
	id: string;
}
```

### Properties

| Property | Type     | Optional | Description |
| -------- | -------- | -------- | ----------- |
| id       | `string` | No       | -           |

---

## User

**File:** `src/lib/types/dashboard.ts`

```typescript
type User = unknown;
```

---

## UserContext

**File:** `src/lib/types/user-context.ts`

```typescript
type UserContext = unknown;
```

---

## UserDataResult

**File:** `src/lib/types/index.ts`

```typescript
interface UserDataResult {
	projects: ProjectWithRelations[];
	userContext: UserContext | null;
}
```

### Properties

| Property    | Type                     | Optional | Description |
| ----------- | ------------------------ | -------- | ----------- | --- |
| projects    | `ProjectWithRelations[]` | No       | -           |
| userContext | `UserContext             | null`    | No          | -   |

---

## UserDataResult

**File:** `src/lib/types/project.ts`

```typescript
interface UserDataResult {
	projects: ProjectWithRelations[];
	userContext: UserContext | null;
}
```

### Properties

| Property    | Type                     | Optional | Description |
| ----------- | ------------------------ | -------- | ----------- | --- |
| projects    | `ProjectWithRelations[]` | No       | -           |
| userContext | `UserContext             | null`    | No          | -   |

---

## UserFamiliarity

**File:** `src/lib/types/dashboard.ts`

```typescript
interface UserFamiliarity {
	tier: unknown | unknown | unknown;
	level: unknown | unknown | unknown;
	projectCount: number;
	taskCount: number;
	isStale: boolean;
	isVeryStale: boolean;
}
```

### Properties

| Property     | Type      | Optional | Description |
| ------------ | --------- | -------- | ----------- | --- | --- |
| tier         | `unknown  | unknown  | unknown`    | No  | -   |
| level        | `unknown  | unknown  | unknown`    | No  | -   |
| projectCount | `number`  | No       | -           |
| taskCount    | `number`  | No       | -           |
| isStale      | `boolean` | No       | -           |
| isVeryStale  | `boolean` | No       | -           |

---

## ValidationResult

**File:** `src/lib/types/index.ts`

```typescript
interface ValidationResult {
	isValid: boolean;
	errors?: string[];
	warnings?: string[];
	missingFields?: string[];
}
```

### Properties

| Property      | Type       | Optional | Description |
| ------------- | ---------- | -------- | ----------- |
| isValid       | `boolean`  | No       | -           |
| errors        | `string[]` | Yes      | -           |
| warnings      | `string[]` | Yes      | -           |
| missingFields | `string[]` | Yes      | -           |

---
