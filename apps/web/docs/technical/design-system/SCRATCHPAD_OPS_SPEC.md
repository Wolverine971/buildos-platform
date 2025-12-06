<!-- apps/web/new-design.md -->

Below is a **clean, hand-off-ready design system spec** written in a way that another LLM can ingest and use to _rewrite, restyle, or generate UI code_ inside your BuildOS workspace.

It describes:

- the **vibe**
- the **purpose**
- the **design philosophy**
- the **intent behind each element**
- concrete patterns and examples

This is exactly the kind of package you hand to an agent so it can revise components, rewrite Tailwind tokens, or regenerate Svelte components.

---

# 🌑 **BUILDOS DESIGN SYSTEM — “SCRATCHPAD OPS”**

### _A complete aesthetic + intent specification for use by other LLMs_

---

# 1. **Design Philosophy (High-Level Purpose)**

BuildOS is an **AI-first project organization system** whose visual language must reflect what the app _actually does for the user_:
turn **messy brain dumps → structured clarity → decisive action**.

Therefore, the design system is built around three metaphors:

1. **Scratchpad (chaos)** – where thoughts, ideas, and fragments live
2. **Workbench (order)** – where structure, context, and organization appear
3. **Tools (action)** – where the user triggers transformations

The UI should not look corporate or sterile. It should feel like a **workspace for builders**: creative, industrial, tactile, slightly gritty but deeply purposeful.

---

# 2. **Aesthetic Vibe (The Emotional Feel)**

### **Core Vibe → “Industrial-Creative Scratchpad”**

A blend of:

- analog grit
- digital clarity
- tactical, tool-like precision

Key adjectives:
**tactile, gritty, intentional, analog-inspired, utilitarian, structured, tool-like, warm, human, purposeful.**

Think:

- an architect’s drafting table
- a military field notebook
- a Moleskine with pencil smudges
- an IDE for your brain

This is a place where _building_ happens.

---

# 3. **Foundational Visual Motifs**

### **A. Dithering**

Dithering is used **only for input surfaces**, not for the whole UI.
It creates the “scratchpad” feel — a space where early thoughts live.

### **B. Grain / Noise**

Light grain may appear on cards or panels to break flat digital surfaces.

### **C. Solid Utility Blocks**

Buttons, nav items, chips, and commands use crisp solids to contrast against textured inputs.

### **D. Subtle Depth + Tactility**

Shadows are shallow but deliberate — elements should feel touchable, not “floating.”

### **E. Muted Color Palette**

Deep muted colors communicate calm, focus, and clarity.

Examples:

- Dark slate (#1A1F2B)
- Steel gray (#2D3242)
- Olive drab (#687452)
- Oxide blue (#334B5D)
- Utility orange (#D88A3A) as an accent

---

# 4. **Component Philosophy & Intent**

This section tells another LLM _how_ each component is supposed to feel and why it exists, so it can recreate the design faithfully.

---

## **4.1 Input Fields & Textareas (“Scratchpads”)**

**Purpose:**
Where raw ideas, brain dumps, and unstructured thought go.

**Visual Intent:**
Feels like a scratchpad, notebook page, or drafting surface.

**Characteristics:**

- dithered background
- subtle noise overlay
- faint pencil-like border or an imperfect edge
- slightly muted text color
- padding = airy (so ideas feel spacious)
- corners = soft (not rounded, not sharp — 3–4px)
- optional animated 1–2% grain to mimic paper texture

**Example Prompt for Reconstruction:**

> “Apply a dithered texture background to all input and textarea fields to evoke a scratchpad workspace where the user can freely think.”

---

## **4.2 Buttons (“Tools”)**

**Purpose:**
Clear, confident, actionable triggers.
Where the user _does_ something to the workspace.

**Visual Intent:**
Buttons must feel like **tools on a workbench** — tactile, sturdy, intentional.

**Characteristics:**

- solid fills (no dithering)
- strong border (2px)
- shallow “pressable” shadow (0 2px)
- active state moves downward 2px (like pressing a key)
- colors: deep, muted, industrial
- shapes: rectangular with small radius (3–4px)
- font: semibold, tight tracking
- icons should feel “rune-like” (simple geometric symbols)

**Example Prompt for Reconstruction:**

> “Render buttons as solid, tactile tools — think mechanical keyboard keys or analog switches — with a 2px border and shallow shadow.”

---

## **4.3 Cards / Panels (“Work Containers”)**

**Purpose:**
Structured units of information: tasks, insights, documents, context blocks.

**Visual Intent:**
Crisp, organized, almost notebook-divider vibe.

**Characteristics:**

- solid or lightly grained background
- subtle inner spacing (12–20px)
- clean borders
- minimal curvature
- slight envelope-like shadow (diffused, low opacity)

---

## **4.4 Sidebar & Navigation (“Mental Model”)**

**Purpose:**
Provide orientation and structure for ongoing work.

**Visual Intent:**
Minimal, utilitarian, command-center-like.

**Characteristics:**

- solid fills (no texture)
- muted deep colors (slate, midnight)
- active state: high-contrast bar or tab
- icons: geometric, not playful

---

## **4.5 AI Output Areas (“Clarity Zones”)**

**Purpose:**
Where BuildOS displays structured, high-clarity information.

**Visual Intent:**
Sharper, brighter, cleaner than scratchpad areas — the transformation zone.

**Characteristics:**

- no dithering
- no grain
- crisp typography
- light background with strong contrast

---

# 5. **Interaction Philosophy**

### **Inputs = messy → Buttons = actionable → Output = clarity**

The system must always communicate the lifecycle:

> **Chaos → Action → Structure**

This is core to BuildOS’s identity.

---

# 6. **Typography System**

### **Primary Font (UI / Action items):**

Strong, utilitarian, geometric (e.g., Inter, Söhne, GT America, IBM Plex Sans)

### **Secondary Font (Notes / Scratch areas):**

Slightly warmer or more “notebooky” but still clean (e.g., IBM Plex Serif, Literata)

---

# 7. **Color System**

### **Base Colors (Industrial Calm)**

- `--slate-900`: #1A1F2B
- `--slate-700`: #2D3242
- `--slate-500`: #3E4459

### **Accent Colors (Purposeful Action)**

- `--utility-orange`: #D88A3A
- `--signal-blue`: #3A6EA5
- `--field-olive`: #687452

### **Surface Colors**

- `--scratchpad-bg`: dither pattern + #F4F4F0
- `--panel-bg`: #F8F8F8 or #ECECEC
- `--rune-icon`: #252525

---

# 8. **Tailwind Tokenization Example**

So another LLM can generate or refactor Tailwind classes:

```js
theme: {
  colors: {
    slate: {
      900: "#1A1F2B",
      700: "#2D3242",
      500: "#3E4459",
    },
    accent: {
      orange: "#D88A3A",
      blue: "#3A6EA5",
      olive: "#687452",
    },
    surface: {
      scratch: "#F4F4F0",
      panel: "#ECECEC",
    },
  },

  borderRadius: {
    sm: "3px",
    DEFAULT: "4px",
  },

  boxShadow: {
    pressable: "0 2px 0 rgba(0,0,0,0.3)",
    subtle: "0 1px 3px rgba(0,0,0,0.08)",
  },
}
```

---

# 9. **Behavioral Design Principles (How It Should _Feel_)**

- **Tactile:** The user feels the interface, not just sees it.
- **Purposeful:** No whimsical visuals, everything has intentionality.
- **Inviting Chaos:** Scratchpads encourage dumping thoughts.
- **Rewarding Action:** Buttons feel satisfying to press — “I did a thing.”
- **Clear Output:** AI sections feel structured and high-signal.
- **Builder Mindset:** Everything should evoke productivity, creation, construction.

---

# 10. **Styling Examples for Rewriting**

### **Scratchpad Input**

- dithered background
- soft radius
- noise overlay at 2–4% opacity
- pencil-smudge border look
- plenty of padding

### **Action Button**

- slate-900 bg
- slate-700 border
- pressable shadow
- utility-orange accent when primary
- rune-like icon at left

### **AI Output Panel**

- white or near-white
- crisp border
- no grain

---
