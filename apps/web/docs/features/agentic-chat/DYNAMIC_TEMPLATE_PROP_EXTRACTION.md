# Dynamic Template Property Extraction

## Overview

The BuildOS agentic chat system now includes **intelligent property extraction** during project creation. When a user describes a project, the AI agent:

1. Selects or creates an appropriate template
2. **Extracts relevant property values** from the user's message
3. Populates the project's `props` field with template-specific data
4. Creates a fully-populated project with real user data

This eliminates manual data entry and makes project creation truly conversational.

---

## How It Works

### Architecture Flow

```
User Message: "Wedding for 200 guests, budget $80k, venue is Grand Hall"
      ↓
Agent selects/suggests template: "project.event.wedding"
Template has properties: { venue_details, guest_count, budget, vendor_list }
      ↓
Agent extracts from message:
  - "200 guests" → guest_count: 200
  - "$80k" → budget: 80000
  - "Grand Hall" → venue_details: { name: "Grand Hall", status: "tentative" }
      ↓
Agent calls create_onto_project with:
  props: {
    facets: { context: "personal", scale: "medium", stage: "planning" },
    venue_details: { name: "Grand Hall", status: "tentative" },
    guest_count: 200,
    budget: 80000,
    vendor_list: []
  }
      ↓
Instantiation service merges:
  - Template default_props (if any)
  - User-provided props (extracted values)
      ↓
Final project created with fully populated properties
```

---

## Implementation Details

### Prompt Engineering

**File:** `/apps/web/src/lib/services/agentic-chat/prompts/prompt-generation-service.ts`

**Step 4: Infer Project Details** now includes:

```typescript
- **props**: ⚠️ CRITICAL - Extract template-specific property values from user's message:
  1. Review the template's property schema (from suggest_template or list_onto_templates)
  2. For EACH property in the template schema, search the user's message for relevant information
  3. Extract and populate specific values mentioned by the user
  4. Use intelligent defaults for properties not explicitly mentioned but inferable from context
  5. ALWAYS include facets in props, then add all template-specific properties
```

**Examples provided in prompt:**
- Wedding planning: Extract venue, guest count, budget
- Software projects: Extract tech stack, deployment target, framework
- Research projects: Extract hypothesis, methodology, research question

### Tool Definitions

**File:** `/apps/web/src/lib/services/agentic-chat/tools/core/tool-definitions.ts`

#### `create_onto_project` Tool

Updated `project.props` description to emphasize extraction:

```typescript
props: {
  type: 'object',
  description: `⚠️ CRITICAL: Template-specific properties extracted from user's message.

This object MUST contain:
1. facets (context, scale, stage) - Standard project facets
2. ALL template-specific properties with values from the user's message

**Extraction Process**:
- Review the template schema (from suggest_template or list_onto_templates)
- For EACH property in the schema, extract relevant info from user's message
- Populate with specific values the user mentioned
- Use intelligent defaults for properties inferable from context

**Examples**: [see tool definition for full examples]
DO NOT leave template properties empty if information is available in the conversation!`
}
```

#### `suggest_template` Tool

Updated `example_props` to clarify it contains extracted values:

```typescript
example_props: {
  type: 'object',
  description: `Example property values for this specific project instance extracted from the user's message.

This should contain actual values from the conversation that will be used when creating the project.

Example: If user mentions "200 guests, $80k budget", set:
{ guest_count: 200, budget: 80000, venue_details: { status: "searching" } }

These values will be passed to create_onto_project as the initial props.`
}
```

### Template Merging

**File:** `/apps/web/src/lib/services/ontology/template-props-merger.service.ts`

The `resolveAndMergeTemplateProps` function performs deep merging:

```typescript
// Merge props: template defaults first, then provided props override
const mergedProps = deepMergeProps(resolvedTemplate.default_props || {}, providedProps);
```

**Merge Logic:**
1. Template `default_props` provides base values
2. User-provided props (AI-extracted) override defaults
3. Nested objects are merged recursively
4. Final props contain both template defaults and user-specific values

---

## Examples

### Example 1: Wedding Planning

**User Input:**
> "Create a wedding planning project. The ceremony will be at Grand Hall, we're expecting 200 guests, and our budget is $80,000."

**AI Processing:**
1. Selects/suggests template: `project.event.wedding`
2. Template properties: `venue_details`, `guest_count`, `budget`, `vendor_list`, `timeline`
3. Extracts from message:
   - "Grand Hall" → `venue_details: { name: "Grand Hall", status: "booked" }`
   - "200 guests" → `guest_count: 200`
   - "$80,000" → `budget: 80000`
4. Creates project with:

```json
{
  "project": {
    "name": "Wedding Planning",
    "type_key": "project.event.wedding",
    "props": {
      "facets": {
        "context": "personal",
        "scale": "medium",
        "stage": "planning"
      },
      "venue_details": {
        "name": "Grand Hall",
        "status": "booked"
      },
      "guest_count": 200,
      "budget": 80000,
      "vendor_list": [],
      "timeline": {}
    }
  }
}
```

---

### Example 2: Software Project

**User Input:**
> "I want to build a Next.js app with TypeScript and deploy it to Vercel. It should have authentication and a dashboard."

**AI Processing:**
1. Selects/suggests template: `project.software.web_app`
2. Template properties: `tech_stack`, `deployment_target`, `features`, `framework`
3. Extracts from message:
   - "Next.js" → `framework: "Next.js"`
   - "TypeScript" → `tech_stack: ["Next.js", "TypeScript"]`
   - "Vercel" → `deployment_target: "Vercel"`
   - "authentication and dashboard" → `features: ["authentication", "dashboard"]`
4. Creates project with:

```json
{
  "project": {
    "name": "Next.js Web Application",
    "type_key": "project.software.web_app",
    "props": {
      "facets": {
        "context": "personal",
        "scale": "small",
        "stage": "discovery"
      },
      "tech_stack": ["Next.js", "TypeScript"],
      "deployment_target": "Vercel",
      "framework": "Next.js",
      "features": ["authentication", "dashboard"]
    }
  }
}
```

---

### Example 3: Research Project

**User Input:**
> "Research project to test if daily meditation reduces stress levels. I'll use a randomized controlled trial with 100 participants over 8 weeks."

**AI Processing:**
1. Selects/suggests template: `project.research.experimental`
2. Template properties: `hypothesis`, `methodology`, `sample_size`, `duration`, `research_question`
3. Extracts from message:
   - "meditation reduces stress" → `hypothesis: "Daily meditation reduces stress levels"`
   - "randomized controlled trial" → `methodology: "randomized_controlled_trial"`
   - "100 participants" → `sample_size: 100`
   - "8 weeks" → `duration: "8 weeks"`
4. Creates project with:

```json
{
  "project": {
    "name": "Meditation and Stress Research",
    "type_key": "project.research.experimental",
    "props": {
      "facets": {
        "context": "academic",
        "scale": "medium",
        "stage": "planning"
      },
      "hypothesis": "Daily meditation reduces stress levels",
      "methodology": "randomized_controlled_trial",
      "sample_size": 100,
      "duration": "8 weeks",
      "research_question": "Does daily meditation reduce stress levels?"
    }
  }
}
```

---

## Benefits

### For Users
- **Zero data re-entry**: Mention details once, they're captured automatically
- **Conversational UX**: Natural language → structured data
- **Smart defaults**: AI infers missing information from context
- **Complete projects**: Projects start with real data, not empty fields

### For Developers
- **Consistent structure**: All projects follow template schema
- **Type safety**: Template schemas define expected properties
- **Deep merging**: Template defaults + user values = complete data
- **Inheritance**: Child templates extend parent properties

### For the System
- **Data quality**: Extracted values validated against schema
- **Template reuse**: Same template, different instance data
- **Search/filter**: Populated properties enable better queries
- **Analytics**: Richer data for insights and reporting

---

## Technical Details

### Property Extraction Algorithm

The AI uses this decision tree:

```
For each template property:
  1. Check user message for explicit mentions
     → If found: Extract and validate type

  2. Check for implicit/contextual clues
     → If inferable: Apply intelligent default

  3. Check template default_props
     → If default exists: Use template default

  4. Use empty/null based on property type
     → Arrays: [], Objects: {}, Numbers: null, Strings: ""
```

### Type Inference

The AI infers types from context:

| User Says | Template Property | Extracted Value |
|-----------|-------------------|-----------------|
| "200 guests" | `guest_count: number` | `200` |
| "$80k budget" | `budget: number` | `80000` |
| "Grand Hall" | `venue_details: object` | `{ name: "Grand Hall" }` |
| "React + TypeScript" | `tech_stack: array` | `["React", "TypeScript"]` |
| "June 20, 2026" | `ceremony_date: string (date)` | `"2026-06-20"` |
| "booked the venue" | `venue_status: string` | `"booked"` |

### Validation

Properties are validated at multiple stages:

1. **AI extraction**: Types must match schema
2. **Template merging**: Deep merge validates nested structures
3. **Instantiation**: Database constraints enforce data integrity
4. **JSON Schema**: Template schema provides validation rules

---

## Future Enhancements

### Potential Improvements

1. **LLM-powered extraction**: Use dedicated LLM call for complex extractions
2. **Multi-turn clarification**: Ask follow-up questions for missing critical props
3. **Entity recognition**: Better NER for dates, numbers, names, locations
4. **Confidence scoring**: Track extraction confidence per property
5. **Prop suggestions**: Suggest additional properties based on context
6. **Validation feedback**: Return validation errors to AI for correction
7. **Template learning**: Improve extraction based on user corrections

### Related Features

- **Template inheritance**: Child templates extend parent properties
- **Dynamic templates**: AI-suggested templates with custom properties
- **Property evolution**: Update props over project lifecycle
- **Bulk extraction**: Extract props for tasks, goals, outputs too

---

## Testing

### Manual Testing

Test with diverse project types:

```bash
# Wedding planning
"Create a wedding for 150 guests, venue TBD, $50k budget"

# Software project
"Build a React Native app for iOS/Android, deploy to App Store"

# Research project
"Study impact of sleep on productivity with 200 subjects"

# Business project
"Launch SaaS product targeting SMBs, freemium model, $100k ARR goal"
```

### Validation Checklist

- [ ] Props extracted from user message
- [ ] Template defaults applied where not specified
- [ ] Nested objects handled correctly
- [ ] Arrays populated with extracted items
- [ ] Numbers parsed correctly (budget: "$80k" → 80000)
- [ ] Dates converted to ISO format
- [ ] Facets always included
- [ ] Empty props have appropriate defaults

---

## Troubleshooting

### Props Not Being Extracted

**Symptom:** Project created with empty props

**Causes:**
1. AI didn't follow the prompt instructions
2. Template schema not available during extraction
3. User message too vague to extract values

**Solutions:**
- Check prompt is loaded correctly
- Verify template has `properties` in schema
- Add more specific examples to prompt
- Improve template property descriptions

### Incorrect Values Extracted

**Symptom:** Wrong values in props (e.g., budget: "80k" instead of 80000)

**Causes:**
1. AI didn't parse/normalize values correctly
2. Type inference failed
3. Template schema doesn't specify format

**Solutions:**
- Add normalization examples to prompt
- Update template schema with explicit formats
- Add validation in instantiation service

### Template Defaults Overriding User Values

**Symptom:** User-specified values replaced by defaults

**Causes:**
1. Merge order reversed
2. Deep merge not working for nested objects

**Solutions:**
- Verify `deepMergeProps` puts user props last
- Check nested object merging logic
- Ensure AI populates props at correct level

---

## Related Documentation

- **Template System**: `/apps/web/docs/features/ontology/README.md`
- **Project Creation**: `/apps/web/docs/features/agentic-chat/IMPLEMENTATION_SUMMARY.md`
- **Dynamic Templates**: `/apps/web/docs/features/agentic-chat/DYNAMIC_TEMPLATE_SYSTEM.md`
- **Tool Definitions**: Source code reference
- **Prompt Engineering**: `/apps/web/src/lib/services/agentic-chat/prompts/`

---

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2025-11-20 | 1.0 | Initial implementation of prop extraction |
| | | - Updated prompt with extraction instructions |
| | | - Enhanced tool definitions with examples |
| | | - Documented merge behavior |
| | | - Added comprehensive examples |
