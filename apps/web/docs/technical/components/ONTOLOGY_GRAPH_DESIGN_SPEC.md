<!-- apps/web/docs/technical/components/ONTOLOGY_GRAPH_DESIGN_SPEC.md -->
# Ontology Graph Visualization Design Spec

> **Version:** 1.0
> **Last Updated:** 2025-12-20
> **Status:** Draft - Ready for Implementation

---

## Table of Contents

1. [Overview](#1-overview)
2. [Design Philosophy](#2-design-philosophy)
3. [Node Type Specifications](#3-node-type-specifications)
4. [Color System](#4-color-system)
5. [Shape Language](#5-shape-language)
6. [State-Based Styling](#6-state-based-styling)
7. [Edge Design](#7-edge-design)
8. [Interaction States](#8-interaction-states)
9. [Dark Mode Considerations](#9-dark-mode-considerations)
10. [Implementation Guide](#10-implementation-guide)

---

## 1. Overview

This spec defines the visual language for the Ontology Graph visualization in BuildOS. The goal is to create a **semantically intuitive** graph where users can instantly recognize entity types, their states, and relationships without reading labels.

### Design Constraints

- Must align with **Inkprint Design System**
- Must support **light and dark modes**
- Must be **scannable at a glance** (3-second rule)
- Must work at **various zoom levels**
- Node types must be **instantly distinguishable**

### Current Entity Types

| Entity    | Icon (Project Page)                   | Current Shape   | Current Color                             |
| --------- | ------------------------------------- | --------------- | ----------------------------------------- |
| Project   | -                                     | roundrectangle  | State-based gray/green/blue               |
| Task      | ListChecks/CheckCircle2/Circle        | ellipse         | State-based green/amber/gray              |
| Output    | FileText/Calendar/Layers/ExternalLink | diamond         | Primitive-based blue/purple/amber/emerald |
| Document  | FileText                              | rectangle       | cyan                                      |
| Plan      | Calendar                              | round-rectangle | indigo                                    |
| Goal      | Target                                | star            | amber                                     |
| Milestone | Flag                                  | triangle        | emerald                                   |

---

## 2. Design Philosophy

### 2.1 The Graph as a "Printed Map"

Following Inkprint principles, the graph should feel like a **field notes diagram** or **architectural blueprint**:

- **Ink on paper** - Nodes are stamps, edges are drawn lines
- **High information density** - Many nodes visible, still scannable
- **Semantic texture** - Shape and color carry meaning, not decoration

### 2.2 Visual Hierarchy

```
Priority 1: Entity Type (Shape)
  ↓ Instantly recognizable silhouette

Priority 2: Entity State (Color Intensity/Border)
  ↓ Active vs. completed vs. blocked

Priority 3: Entity Scale/Importance (Size)
  ↓ Larger = more central or larger scope

Priority 4: Relationships (Edge color/weight)
  ↓ What connects to what
```

### 2.3 The "3-Second Scan" Test

A user looking at the graph should be able to answer within 3 seconds:

- "Where are the goals?" (Star shapes, amber)
- "What's blocked?" (Red borders, static texture)
- "What's completed?" (Green fill, solid borders)

---

## 3. Node Type Specifications

### 3.1 Project Node

**Semantic Role:** The container, the "universe" of work

```typescript
{
  shape: 'round-rectangle',
  width: 'data(size)',      // 35-60px based on facet_scale
  height: 'data(size)',
  'background-color': 'data(stateColor)',
  'border-width': 3,
  'border-color': '#1f2937', // Dark border for "frame" feel
  'border-style': 'solid',
  'font-size': '12px',
  'font-weight': 600,
  'text-valign': 'center',
  'text-halign': 'center',
  'text-wrap': 'wrap',
  'text-max-width': '90px'
}
```

**Size Mapping:**
| Scale | Size |
|-------|------|
| micro | 35px |
| small | 40px |
| medium | 50px |
| large | 60px |
| epic | 70px |

**State Colors:**
| State | Color | Hex |
|-------|-------|-----|
| draft | Muted Gray | `#94a3b8` (slate-400) |
| active | Accent Orange | `#ea580c` (orange-600) |
| complete | Emerald | `#10b981` |
| archived | Gray | `#6b7280` |

---

### 3.2 Goal Node

**Semantic Role:** The north star, what success looks like

```typescript
{
  shape: 'star',
  width: 40,
  height: 40,
  'background-color': '#f59e0b', // amber-500
  'background-opacity': 0.9,
  'border-width': 2,
  'border-color': '#d97706',     // amber-600
  'font-size': '10px',
  'font-weight': 600,
  'text-valign': 'bottom',
  'text-margin-y': 8,
  color: '#1f2937'               // Label color
}
```

**Why Star?**

- Instantly recognizable as "target/goal"
- Matches the `Target` icon's semantic meaning
- Visible even at small sizes

**State Variations:**
| State | Background | Border |
|-------|------------|--------|
| draft | `#fde68a` (amber-200) | `#f59e0b` |
| active | `#f59e0b` (amber-500) | `#d97706` |
| achieved | `#10b981` (emerald-500) | `#059669` |
| deferred | `#94a3b8` (slate-400) | `#64748b` |

---

### 3.3 Task Node

**Semantic Role:** The atomic unit of work

```typescript
{
  shape: 'ellipse',
  width: 28,
  height: 28,
  'background-color': 'data(stateColor)',
  'border-width': 2,
  'border-color': 'data(borderColor)',
  'font-size': '9px',
  'text-valign': 'bottom',
  'text-margin-y': 6,
}
```

**Why Ellipse?**

- Clean, minimal shape for the most numerous entity type
- Matches the `Circle`/`CheckCircle2` icons
- Doesn't compete visually with goals/milestones

**State Colors (matching project page):**
| State | Background | Border | Meaning |
|-------|------------|--------|---------|
| todo/draft | `#e2e8f0` (slate-200) | `#94a3b8` | Not started |
| in_progress | `#fef3c7` (amber-100) | `#f59e0b` | Active work |
| done/complete | `#d1fae5` (emerald-100) | `#10b981` | Finished |
| blocked | `#fee2e2` (red-100) | `#ef4444` | Needs attention |

**Priority Ring (optional enhancement):**
| Priority | Border Width | Border Style |
|----------|--------------|--------------|
| low | 1px | solid |
| medium | 2px | solid |
| high | 3px | solid |
| urgent | 3px | double |

---

### 3.4 Plan Node

**Semantic Role:** Execution scaffolding, temporal structure

```typescript
{
  shape: 'round-rectangle',
  width: 36,
  height: 28,
  'background-color': 'data(stateColor)',
  'border-width': 2,
  'border-color': '#4f46e5',     // indigo-600
  'border-style': 'dashed',      // Dashed = "in progress/planned"
  'font-size': '10px',
  'text-valign': 'center',
}
```

**Why Dashed Border?**

- Visually differentiates from solid "project" rectangles
- Suggests "work in progress" / "to be executed"
- Aligns with calendar/temporal semantics

**State Colors:**
| State | Background | Border |
|-------|------------|--------|
| draft | `#e0e7ff` (indigo-100) | `#a5b4fc` |
| active | `#c7d2fe` (indigo-200) | `#6366f1` |
| complete | `#d1fae5` (emerald-100) | `#10b981` |

---

### 3.5 Output Node

**Semantic Role:** Deliverables - what gets produced

```typescript
{
  shape: 'diamond',
  width: 32,
  height: 32,
  'background-color': 'data(primitiveColor)',
  'border-width': 2,
  'border-color': 'data(borderColor)',
  'font-size': '9px',
  'text-valign': 'bottom',
  'text-margin-y': 8,
}
```

**Why Diamond?**

- Represents a "deliverable/artifact"
- Distinct silhouette from tasks and plans
- Points in 4 directions = multifaceted output

**Primitive Colors (matching project page):**
| Primitive | Background | Border | Icon Equivalent |
|-----------|------------|--------|-----------------|
| document | `#dbeafe` (blue-100) | `#3b82f6` | FileText |
| event | `#ede9fe` (violet-100) | `#8b5cf6` | Calendar |
| collection | `#fef3c7` (amber-100) | `#f59e0b` | Layers |
| external | `#d1fae5` (emerald-100) | `#10b981` | ExternalLink |

**State Overlay (via border style):**
| State | Border Style |
|-------|--------------|
| draft | dotted |
| review | dashed |
| approved | solid |
| published | double (2px solid + 1px gap + 2px solid) |

---

### 3.6 Document Node

**Semantic Role:** Knowledge artifacts, context, notes

```typescript
{
  shape: 'rectangle',
  width: 24,
  height: 30,               // Slightly taller = "document" feel
  'background-color': '#e0f2fe', // sky-100
  'border-width': 1,
  'border-color': '#0ea5e9',     // sky-500
  'font-size': '8px',
  'text-valign': 'bottom',
  'text-margin-y': 4,
}
```

**Why Rectangle (portrait)?**

- Universal "document/page" shape
- Smaller than outputs (supporting role)
- Matches `FileText` icon aspect ratio

**Type Variations:**
| Type Key | Background Tint |
|----------|-----------------|
| note | `#f0fdf4` (green-50) |
| research | `#eff6ff` (blue-50) |
| draft | `#fefce8` (yellow-50) |
| reference | `#f5f5f5` (neutral-100) |

---

### 3.7 Milestone Node

**Semantic Role:** Temporal markers, checkpoints

```typescript
{
  shape: 'polygon',
  'shape-polygon-points': '-0.5 0.5, 0 -0.5, 0.5 0.5, 0 0.25',  // Flag/pennant
  width: 28,
  height: 32,
  'background-color': 'data(stateColor)',
  'border-width': 2,
  'border-color': '#059669',     // emerald-600
  'font-size': '9px',
  'text-valign': 'bottom',
  'text-margin-y': 6,
}
```

**Alternative: Use `triangle` pointing up**

```typescript
{
  shape: 'triangle',
  width: 26,
  height: 30,
}
```

**Why Triangle/Flag?**

- Matches `Flag` icon from project page
- Points upward = progress marker
- Distinct from goal's star shape

**State Colors:**
| State | Background | Border |
|-------|------------|--------|
| pending | `#e2e8f0` (slate-200) | `#64748b` |
| in_progress | `#bfdbfe` (blue-200) | `#3b82f6` |
| achieved | `#a7f3d0` (emerald-200) | `#10b981` |
| missed | `#fecaca` (red-200) | `#ef4444` |
| deferred | `#fed7aa` (orange-200) | `#f97316` |

---

### 3.8 Risk Node (Future Enhancement)

**Semantic Role:** What could go wrong

```typescript
{
  shape: 'hexagon',
  width: 28,
  height: 28,
  'background-color': 'data(impactColor)',
  'border-width': 2,
  'border-color': '#dc2626',
  'font-size': '9px',
}
```

**Impact Colors:**
| Impact | Background | Border |
|--------|------------|--------|
| low | `#fef9c3` (yellow-100) | `#ca8a04` |
| medium | `#fed7aa` (orange-200) | `#ea580c` |
| high | `#fecaca` (red-200) | `#dc2626` |
| critical | `#fca5a5` (red-300) | `#b91c1c` |

---

## 4. Color System

### 4.1 Inkprint-Aligned Palette

All colors should work in both light and dark modes. Use these semantic mappings:

```typescript
const GRAPH_COLORS = {
	// Entity Type Base Colors
	project: {
		light: { bg: '#f8fafc', border: '#1e293b' },
		dark: { bg: '#1e293b', border: '#f8fafc' }
	},
	goal: {
		light: { bg: '#fef3c7', border: '#d97706' },
		dark: { bg: '#78350f', border: '#fbbf24' }
	},
	task: {
		light: { bg: '#f1f5f9', border: '#475569' },
		dark: { bg: '#334155', border: '#cbd5e1' }
	},
	plan: {
		light: { bg: '#e0e7ff', border: '#4f46e5' },
		dark: { bg: '#312e81', border: '#a5b4fc' }
	},
	output: {
		light: { bg: '#ede9fe', border: '#7c3aed' },
		dark: { bg: '#4c1d95', border: '#c4b5fd' }
	},
	document: {
		light: { bg: '#e0f2fe', border: '#0284c7' },
		dark: { bg: '#0c4a6e', border: '#7dd3fc' }
	},
	milestone: {
		light: { bg: '#d1fae5', border: '#059669' },
		dark: { bg: '#064e3b', border: '#6ee7b7' }
	},

	// State Colors (cross-entity)
	states: {
		draft: { light: '#e2e8f0', dark: '#475569' },
		active: { light: '#fef3c7', dark: '#78350f' },
		complete: { light: '#d1fae5', dark: '#064e3b' },
		blocked: { light: '#fee2e2', dark: '#7f1d1d' },
		archived: { light: '#f1f5f9', dark: '#334155' }
	},

	// Accent (BuildOS signal color)
	accent: {
		light: '#ea580c', // orange-600
		dark: '#fb923c' // orange-400
	}
};
```

### 4.2 Label Colors

```typescript
const LABEL_COLORS = {
	light: {
		primary: '#1e293b', // slate-800
		secondary: '#64748b', // slate-500
		onDark: '#f8fafc' // For labels on dark backgrounds
	},
	dark: {
		primary: '#f1f5f9', // slate-100
		secondary: '#94a3b8', // slate-400
		onLight: '#1e293b' // For labels on light backgrounds
	}
};
```

---

## 5. Shape Language

### 5.1 Shape Semantics Quick Reference

| Shape                    | Entity    | Semantic Meaning         | Mnemonic                    |
| ------------------------ | --------- | ------------------------ | --------------------------- |
| Round Rectangle          | Project   | Container, bounded scope | "The box that holds it all" |
| Star                     | Goal      | North star, destination  | "Aim for the stars"         |
| Ellipse                  | Task      | Atomic work unit         | "Rolling ball of work"      |
| Round Rectangle (dashed) | Plan      | Temporal scaffolding     | "Calendar block"            |
| Diamond                  | Output    | Deliverable artifact     | "Polished gem"              |
| Rectangle (portrait)     | Document  | Knowledge page           | "Sheet of paper"            |
| Triangle/Flag            | Milestone | Progress checkpoint      | "Flag in the ground"        |
| Hexagon                  | Risk      | Warning/caution          | "Stop sign shape"           |

### 5.2 Visual Distinction Matrix

Nodes must be distinguishable even when:

- Zoomed out (shape silhouette)
- In grayscale (shape + size)
- Colorblind-friendly (shape carries primary meaning)

```
Shape Distinctiveness Score (1-5):
Star ★★★★★ - Unique, instantly recognizable
Diamond ★★★★☆ - Distinct but similar to rotated square
Triangle ★★★★☆ - Good, directional
Hexagon ★★★★☆ - Good, uncommon
Round-Rectangle ★★★☆☆ - Common, needs color/border help
Ellipse ★★☆☆☆ - Very common, relies on context
Rectangle ★★☆☆☆ - Common, aspect ratio helps
```

---

## 6. State-Based Styling

### 6.1 Universal State Indicators

Every node type can express these states through consistent visual treatment:

| State         | Border Treatment       | Fill Treatment   | Opacity |
| ------------- | ---------------------- | ---------------- | ------- |
| draft         | Dotted, 1px            | 30% saturation   | 0.8     |
| todo          | Solid, 1px             | 40% saturation   | 0.9     |
| in_progress   | Solid, 2px, warm color | 60% saturation   | 1.0     |
| blocked       | Solid, 3px, red        | Red tint overlay | 1.0     |
| done/complete | Solid, 2px, green      | Green tint       | 1.0     |
| archived      | Dashed, 1px, gray      | Desaturated      | 0.6     |

### 6.2 State Style Implementation

```typescript
function getStateStyle(state: string, entityType: string) {
	const baseState = normalizeState(state);

	const stateStyles = {
		draft: {
			'border-style': 'dotted',
			'border-width': 1,
			'background-opacity': 0.6
		},
		todo: {
			'border-style': 'solid',
			'border-width': 1,
			'background-opacity': 0.8
		},
		in_progress: {
			'border-style': 'solid',
			'border-width': 2,
			'border-color': '#f59e0b',
			'background-opacity': 1
		},
		blocked: {
			'border-style': 'solid',
			'border-width': 3,
			'border-color': '#ef4444',
			'background-opacity': 1
		},
		complete: {
			'border-style': 'solid',
			'border-width': 2,
			'border-color': '#10b981',
			'background-opacity': 1
		},
		archived: {
			'border-style': 'dashed',
			'border-width': 1,
			'background-opacity': 0.5,
			opacity: 0.6
		}
	};

	return stateStyles[baseState] || stateStyles.draft;
}
```

---

## 7. Edge Design

### 7.1 Edge Semantic Colors

Edges should communicate relationship type through color, matching the project page's icon colors:

```typescript
const EDGE_STYLES = {
	// Hierarchical (structural, gray)
	hierarchical: {
		rels: ['belongs_to_plan', 'has_task', 'contains', 'has_plan', 'part_of'],
		color: { light: '#94a3b8', dark: '#64748b' },
		width: 1,
		style: 'solid',
		arrow: 'triangle'
	},

	// Goal-oriented (amber, matching Target icon)
	goalSupport: {
		rels: ['supports_goal', 'requires', 'achieved_by', 'has_goal'],
		color: { light: '#d97706', dark: '#fbbf24' },
		width: 2,
		style: 'solid',
		arrow: 'triangle-backcurve'
	},

	// Dependencies (orange-red, warning)
	dependency: {
		rels: ['depends_on', 'blocks', 'blocked_by'],
		color: { light: '#ea580c', dark: '#fb923c' },
		width: 2,
		style: 'dashed',
		arrow: 'vee'
	},

	// Temporal (emerald, matching Flag icon)
	temporal: {
		rels: ['targets_milestone', 'has_milestone', 'scheduled_for'],
		color: { light: '#059669', dark: '#34d399' },
		width: 2,
		style: 'solid',
		arrow: 'triangle'
	},

	// Knowledge (sky blue, matching FileText icon)
	knowledge: {
		rels: ['references', 'referenced_by', 'has_document', 'has_context_document'],
		color: { light: '#0284c7', dark: '#38bdf8' },
		width: 1,
		style: 'dotted',
		arrow: 'circle'
	},

	// Production (purple, matching Layers icon)
	production: {
		rels: ['produces', 'produced_by', 'has_output', 'contributes_to'],
		color: { light: '#7c3aed', dark: '#a78bfa' },
		width: 2,
		style: 'solid',
		arrow: 'diamond'
	}
};
```

### 7.2 Edge Labels

Edge labels should be:

- Small (`font-size: 8px`)
- Background-colored for readability (`text-background-color`, `text-background-opacity: 0.9`)
- Hidden at zoom < 1.5 to reduce clutter

```typescript
{
  selector: 'edge',
  style: {
    'font-size': '8px',
    'text-background-color': 'data(bgColor)',
    'text-background-opacity': 0.9,
    'text-background-padding': '2px',
    'color': '#475569',
    // Only show labels when zoomed in
    'label': 'data(label)',
    'text-opacity': 'mapData(zoom, 1, 2, 0, 1)'
  }
}
```

---

## 8. Interaction States

### 8.1 Hover State

```typescript
{
  selector: 'node:hover',
  style: {
    'border-width': (ele) => ele.data('border-width') + 2,
    'border-color': '#ea580c', // Accent color
    'z-index': 999,
    'shadow-blur': 8,
    'shadow-color': 'rgba(234, 88, 12, 0.3)',
    'shadow-offset-x': 0,
    'shadow-offset-y': 2
  }
}
```

### 8.2 Selected State

```typescript
{
  selector: 'node:selected',
  style: {
    'border-width': 4,
    'border-color': '#ea580c', // Accent
    'background-color': '#fff7ed', // orange-50
    'shadow-blur': 12,
    'shadow-color': 'rgba(234, 88, 12, 0.4)',
    'z-index': 1000
  }
}
```

### 8.3 Highlight State (Search/Focus)

```typescript
{
  selector: '.highlight',
  style: {
    'border-width': 4,
    'border-color': '#fbbf24', // amber-400
    'background-color': '#fef3c7', // amber-100
    // Pulsing animation
    'transition-property': 'border-color, background-color',
    'transition-duration': '300ms'
  }
}
```

### 8.4 Dimmed State (Filtering)

```typescript
{
  selector: '.dimmed',
  style: {
    'opacity': 0.25,
    'z-index': 0
  }
}
```

### 8.5 Connected Highlight

When a node is selected, highlight its connected edges and neighbors:

```typescript
{
  selector: 'node:selected ~ edge',
  style: {
    'line-color': '#ea580c',
    'target-arrow-color': '#ea580c',
    'opacity': 1,
    'z-index': 998
  }
},
{
  selector: 'node:selected ~ node',
  style: {
    'border-color': '#ea580c',
    'border-width': 2,
    'opacity': 1
  }
}
```

---

## 9. Dark Mode Considerations

### 9.1 Color Adjustments

In dark mode:

- **Increase saturation** slightly for visibility
- **Swap to lighter tints** of colors
- **Borders become lighter** than backgrounds
- **Labels use light text** on dark backgrounds

### 9.2 Dark Mode Node Styles

```typescript
{
  selector: 'node',
  style: {
    'background-color': 'data(darkBgColor)',
    'border-color': 'data(darkBorderColor)',
    'color': '#f1f5f9' // Light label text
  }
}
```

### 9.3 Dark Mode Edge Styles

```typescript
{
  selector: 'edge',
  style: {
    'line-color': 'data(darkColor)',
    'target-arrow-color': 'data(darkColor)',
    'text-background-color': '#1e293b',
    'color': '#cbd5e1'
  }
}
```

---

## 10. Implementation Guide

### 10.1 Updated `graph.service.ts` Structure

```typescript
// New color configuration object
export const GRAPH_NODE_CONFIG: Record<NodeType, NodeConfig> = {
	project: {
		shape: 'round-rectangle',
		baseSize: { width: 50, height: 40 },
		sizeScale: { micro: 0.7, small: 0.85, medium: 1, large: 1.2, epic: 1.4 },
		colors: {
			light: { bg: '#f8fafc', border: '#1e293b' },
			dark: { bg: '#1e293b', border: '#e2e8f0' }
		},
		stateColors: {
			draft: { bg: '#f1f5f9', border: '#94a3b8' },
			active: { bg: '#fff7ed', border: '#ea580c' },
			complete: { bg: '#ecfdf5', border: '#10b981' },
			archived: { bg: '#f1f5f9', border: '#64748b' }
		},
		labelPosition: { valign: 'center', halign: 'center' },
		fontSize: 12,
		fontWeight: 600
	},

	goal: {
		shape: 'star',
		baseSize: { width: 40, height: 40 },
		colors: {
			light: { bg: '#fef3c7', border: '#d97706' },
			dark: { bg: '#78350f', border: '#fbbf24' }
		},
		stateColors: {
			draft: { bg: '#fef9c3', border: '#eab308' },
			active: { bg: '#fef3c7', border: '#d97706' },
			achieved: { bg: '#d1fae5', border: '#10b981' },
			deferred: { bg: '#f1f5f9', border: '#64748b' }
		},
		labelPosition: { valign: 'bottom', marginY: 8 },
		fontSize: 10,
		fontWeight: 600
	},

	task: {
		shape: 'ellipse',
		baseSize: { width: 28, height: 28 },
		colors: {
			light: { bg: '#f1f5f9', border: '#64748b' },
			dark: { bg: '#334155', border: '#94a3b8' }
		},
		stateColors: {
			todo: { bg: '#f1f5f9', border: '#94a3b8' },
			in_progress: { bg: '#fef3c7', border: '#f59e0b' },
			done: { bg: '#d1fae5', border: '#10b981' },
			blocked: { bg: '#fee2e2', border: '#ef4444' }
		},
		labelPosition: { valign: 'bottom', marginY: 6 },
		fontSize: 9
	},

	plan: {
		shape: 'round-rectangle',
		baseSize: { width: 36, height: 28 },
		borderStyle: 'dashed',
		colors: {
			light: { bg: '#e0e7ff', border: '#6366f1' },
			dark: { bg: '#312e81', border: '#a5b4fc' }
		},
		stateColors: {
			draft: { bg: '#e0e7ff', border: '#a5b4fc' },
			active: { bg: '#c7d2fe', border: '#6366f1' },
			complete: { bg: '#d1fae5', border: '#10b981' }
		},
		labelPosition: { valign: 'center', halign: 'center' },
		fontSize: 10
	},

	output: {
		shape: 'diamond',
		baseSize: { width: 32, height: 32 },
		primitiveColors: {
			document: {
				light: { bg: '#dbeafe', border: '#3b82f6' },
				dark: { bg: '#1e3a8a', border: '#93c5fd' }
			},
			event: {
				light: { bg: '#ede9fe', border: '#8b5cf6' },
				dark: { bg: '#4c1d95', border: '#c4b5fd' }
			},
			collection: {
				light: { bg: '#fef3c7', border: '#f59e0b' },
				dark: { bg: '#78350f', border: '#fcd34d' }
			},
			external: {
				light: { bg: '#d1fae5', border: '#10b981' },
				dark: { bg: '#064e3b', border: '#6ee7b7' }
			}
		},
		labelPosition: { valign: 'bottom', marginY: 8 },
		fontSize: 9
	},

	document: {
		shape: 'rectangle',
		baseSize: { width: 24, height: 30 },
		colors: {
			light: { bg: '#e0f2fe', border: '#0ea5e9' },
			dark: { bg: '#0c4a6e', border: '#7dd3fc' }
		},
		labelPosition: { valign: 'bottom', marginY: 4 },
		fontSize: 8
	},

	milestone: {
		shape: 'triangle',
		baseSize: { width: 26, height: 30 },
		colors: {
			light: { bg: '#d1fae5', border: '#10b981' },
			dark: { bg: '#064e3b', border: '#6ee7b7' }
		},
		stateColors: {
			pending: { bg: '#e2e8f0', border: '#64748b' },
			in_progress: { bg: '#bfdbfe', border: '#3b82f6' },
			achieved: { bg: '#a7f3d0', border: '#10b981' },
			missed: { bg: '#fecaca', border: '#ef4444' },
			deferred: { bg: '#fed7aa', border: '#f97316' }
		},
		labelPosition: { valign: 'bottom', marginY: 6 },
		fontSize: 9
	}
};
```

### 10.2 Migration Checklist

- [ ] Update `graph.service.ts` with new `GRAPH_NODE_CONFIG`
- [ ] Add dark mode color variants to all node types
- [ ] Update `OntologyGraph.svelte` Cytoscape styles
- [ ] Add state-based styling selectors
- [ ] Implement edge semantic colors
- [ ] Add interaction states (hover, selected, highlight)
- [ ] Test in light and dark modes
- [ ] Verify colorblind accessibility (shape-first design)
- [ ] Add zoom-based label visibility

### 10.3 Files to Modify

1. `apps/web/src/lib/components/ontology/graph/lib/graph.service.ts`
    - Add `GRAPH_NODE_CONFIG` constant
    - Update `*ToNodes` methods to use config
    - Add `getStateStyle()` helper

2. `apps/web/src/lib/components/ontology/graph/OntologyGraph.svelte`
    - Update Cytoscape `style` array with new selectors
    - Add interaction state classes
    - Implement dark mode detection and color switching

3. `apps/web/src/lib/components/ontology/graph/lib/graph.types.ts`
    - Add `NodeConfig` interface
    - Add state type enums

---

## Related Documentation

- **Inkprint Design System:** `/apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md`
- **Ontology Data Models:** `/apps/web/docs/features/ontology/DATA_MODELS.md`
- **Graph Component:** `/apps/web/src/lib/components/ontology/graph/OntologyGraph.svelte`

---

## Appendix: Visual Reference

```
╭──────────────────────────────────────────────────────────────╮
│  SHAPE REFERENCE                                             │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   ╭─────────╮     Project (round-rectangle)                  │
│   │         │     Container, bounded scope                   │
│   ╰─────────╯                                                │
│                                                              │
│       ★          Goal (star)                                 │
│                  North star, destination                     │
│                                                              │
│       ●          Task (ellipse)                              │
│                  Atomic work unit                            │
│                                                              │
│   ╭─ ─ ─ ─╮      Plan (round-rectangle, dashed)              │
│   │       │      Temporal scaffolding                        │
│   ╰─ ─ ─ ─╯                                                  │
│                                                              │
│       ◇          Output (diamond)                            │
│                  Deliverable artifact                        │
│                                                              │
│       ▭          Document (rectangle)                        │
│                  Knowledge page                              │
│                                                              │
│       ▲          Milestone (triangle)                        │
│                  Progress checkpoint                         │
│                                                              │
│       ⬡          Risk (hexagon) [future]                     │
│                  Warning/caution                             │
│                                                              │
╰──────────────────────────────────────────────────────────────╯
```
