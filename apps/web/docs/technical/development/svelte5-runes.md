<!-- apps/web/docs/technical/development/svelte5-runes.md -->

# Svelte 5 Runes Cheat Sheet

> **Complete guide to Svelte 5 runes** - Best practices, patterns, and anti-patterns for BuildOS development

**Status**: v1.0.0 - Complete reference guide
**Last Updated**: 2025-11-06
**Official Docs**: [svelte.dev/docs/svelte/what-are-runes](https://svelte.dev/docs/svelte/what-are-runes)

---

## Table of Contents

1. [Core Runes Overview](#core-runes-overview)
2. [$state - Reactive State](#state---reactive-state)
3. [$derived - Computed Values](#derived---computed-values)
4. [$effect - Side Effects](#effect---side-effects)
5. [$props - Component Props](#props---component-props)
6. [$bindable - Two-Way Binding](#bindable---two-way-binding)
7. [$inspect - Debugging](#inspect---debugging)
8. [Migration Patterns](#migration-patterns)
9. [Common Pitfalls](#common-pitfalls)
10. [Best Practices Checklist](#best-practices-checklist)

---

## Core Runes Overview

### What Are Runes?

Runes are **compiler-control symbols** (not functions) that manage reactivity in Svelte 5. They're built into the language and don't require imports.

**Key Characteristics:**

- Identified by `$` prefix (e.g., `$state`, `$derived`)
- Not actual functions - cannot be assigned to variables or passed as arguments
- Position-dependent - only valid in specific contexts
- Work in both `.svelte` and `.svelte.js`/`.svelte.ts` files

### The Eight Core Runes

| Rune          | Purpose                | Common Use Cases                              |
| ------------- | ---------------------- | --------------------------------------------- |
| **$state**    | Declare reactive state | Component state, form inputs, toggles         |
| **$derived**  | Computed values        | Filtered lists, calculations, transformations |
| **$effect**   | Side effects           | DOM manipulation, subscriptions, logging      |
| **$props**    | Component properties   | Receiving data from parent components         |
| **$bindable** | Two-way binding        | Form controls, custom input components        |
| **$inspect**  | Debugging state        | Development debugging, state visualization    |
| **$host**     | Access host element    | Custom elements, web components               |
| **@render**   | Render snippets        | Template composition, slot replacements       |

---

## $state - Reactive State

### Basic Usage

```svelte
<script lang="ts">
	// ✅ Simple state
	let count = $state(0);

	// ✅ Object state
	let user = $state({
		name: 'Alice',
		age: 30
	});

	// ✅ Array state
	let items = $state<string[]>([]);

	// ✅ Nullable state with TypeScript
	let selected = $state<User | null>(null);
</script>
```

### Deep Reactivity

```svelte
<script lang="ts">
	// ✅ Nested objects are automatically reactive
	let user = $state({
		profile: {
			name: 'Alice',
			settings: {
				theme: 'dark'
			}
		}
	});

	// This triggers reactivity
	user.profile.settings.theme = 'light';
</script>
```

### $state.raw - Performance Optimization

```svelte
<script lang="ts">
	// ✅ Use for large immutable objects
	let largeDataset = $state.raw([
		/* thousands of items */
	]);

	// ❌ This won't trigger reactivity
	largeDataset.push(newItem);

	// ✅ Replace the entire array instead
	largeDataset = [...largeDataset, newItem];
</script>
```

**When to use $state.raw:**

- Large read-only datasets
- Immutable data structures
- External library objects that shouldn't be made reactive
- Performance-critical scenarios

### $state.snapshot - Reading State Non-Reactively

```svelte
<script lang="ts">
	let user = $state({ name: 'Alice', count: 0 });

	// ✅ Take a snapshot without creating reactive dependency
	function logUserOnce() {
		const snapshot = $state.snapshot(user);
		console.log(snapshot); // Won't re-run when user changes
	}
</script>
```

### Common Patterns

#### Form State

```svelte
<script lang="ts">
	let formData = $state({
		email: '',
		password: '',
		remember: false
	});

	function handleSubmit() {
		// Access reactive state
		console.log(formData.email, formData.password);
	}
</script>

<form on:submit|preventDefault={handleSubmit}>
	<input type="email" bind:value={formData.email} />
	<input type="password" bind:value={formData.password} />
	<input type="checkbox" bind:checked={formData.remember} />
</form>
```

#### Toggle State

```svelte
<script lang="ts">
	let isOpen = $state(false);
	let isLoading = $state(false);

	function toggle() {
		isOpen = !isOpen;
	}
</script>

<button on:click={toggle}>
	{isOpen ? 'Close' : 'Open'}
</button>
```

### ❌ Anti-Patterns

```svelte
<script lang="ts">
	// ❌ DON'T use $state for constants
	let API_URL = $state('https://api.example.com'); // Just use const

	// ✅ Use const instead
	const API_URL = 'https://api.example.com';

	// ❌ DON'T use $state for derived values
	let doubled = $state(count * 2); // Use $derived instead

	// ✅ Use $derived for computed values
	let doubled = $derived(count * 2);
</script>
```

---

## $derived - Computed Values

### Basic Usage

```svelte
<script lang="ts">
	let count = $state(0);

	// ✅ Simple derived value
	let doubled = $derived(count * 2);

	// ✅ Derived from multiple sources
	let firstName = $state('Alice');
	let lastName = $state('Smith');
	let fullName = $derived(`${firstName} ${lastName}`);
</script>
```

### Complex Derivations

```svelte
<script lang="ts">
	let tasks = $state<Task[]>([]);
	let filter = $state<'all' | 'active' | 'completed'>('all');

	// ✅ Filtered list
	let filteredTasks = $derived(
		filter === 'all'
			? tasks
			: tasks.filter((t) => (filter === 'active' ? !t.completed : t.completed))
	);

	// ✅ Aggregations
	let completedCount = $derived(tasks.filter((t) => t.completed).length);

	let completionPercentage = $derived(
		tasks.length > 0 ? (completedCount / tasks.length) * 100 : 0
	);
</script>
```

### $derived.by - Complex Calculations

```svelte
<script lang="ts">
	let items = $state<Item[]>([]);

	// ✅ Use $derived.by for multi-line logic
	let statistics = $derived.by(() => {
		const total = items.length;
		const sum = items.reduce((acc, item) => acc + item.value, 0);
		const average = total > 0 ? sum / total : 0;
		const max = Math.max(...items.map((i) => i.value));

		return { total, sum, average, max };
	});

	// Access: statistics.total, statistics.average, etc.
</script>
```

### Memoization & Performance

**$derived automatically memoizes** - recalculates only when dependencies change:

```svelte
<script lang="ts">
	let input = $state('');

	// ✅ Expensive calculation only runs when input changes
	let processed = $derived(expensiveOperation(input));

	function expensiveOperation(str: string) {
		console.log('Running expensive operation'); // Runs only on input change
		return str.toUpperCase().split('').reverse().join('');
	}
</script>
```

### Derived Patterns

#### Search/Filter Pattern

```svelte
<script lang="ts">
	let searchQuery = $state('');
	let users = $state<User[]>([]);

	let filteredUsers = $derived(
		users.filter(
			(user) =>
				user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
				user.email.toLowerCase().includes(searchQuery.toLowerCase())
		)
	);

	let resultCount = $derived(filteredUsers.length);
	let hasResults = $derived(resultCount > 0);
</script>
```

#### Validation Pattern

```svelte
<script lang="ts">
	let email = $state('');
	let password = $state('');

	let isEmailValid = $derived(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));

	let isPasswordStrong = $derived(
		password.length >= 8 && /[A-Z]/.test(password) && /[0-9]/.test(password)
	);

	let canSubmit = $derived(isEmailValid && isPasswordStrong);
</script>

<button disabled={!canSubmit}>Submit</button>
```

### ❌ Anti-Patterns

```svelte
<script lang="ts">
	// ❌ DON'T use $effect for derived values
	let count = $state(0);
	let doubled = $state(0);

	$effect(() => {
		doubled = count * 2; // Wrong! Use $derived
	});

	// ✅ Use $derived instead
	let doubled = $derived(count * 2);

	// ❌ DON'T manually track dependencies
	let result = $derived.by(() => {
		if (someCondition) {
			return expensiveCalc(dataA); // dataA dependency not tracked!
		}
		return defaultValue;
	});

	// ✅ Access ALL dependencies at runtime
	let result = $derived.by(() => {
		const a = dataA; // Read dependency at top level
		if (someCondition) {
			return expensiveCalc(a);
		}
		return defaultValue;
	});
</script>
```

---

## $effect - Side Effects

### Basic Usage

```svelte
<script lang="ts">
	let count = $state(0);

	// ✅ Log when count changes
	$effect(() => {
		console.log(`Count is now ${count}`);
	});

	// ✅ Side effect with cleanup
	$effect(() => {
		const interval = setInterval(() => {
			console.log('Tick');
		}, 1000);

		// Cleanup function
		return () => clearInterval(interval);
	});
</script>
```

### When to Use $effect

**Use $effect for:**

- DOM manipulation not handled by Svelte
- Setting up subscriptions (WebSocket, stores, event listeners)
- Logging and analytics
- Synchronizing with external systems
- localStorage/sessionStorage updates

**90% of the time, use $derived instead!**

### $effect vs $derived Decision Tree

```
Need to compute a value?
├─ Yes → Use $derived
└─ No → Need side effects?
    ├─ Yes → Use $effect
    └─ No → Just use regular code
```

### $effect.pre - Pre-Update Effects

```svelte
<script lang="ts">
	let scrollY = $state(0);
	let previousScrollY = 0;

	// ✅ Run BEFORE DOM updates
	$effect.pre(() => {
		previousScrollY = scrollY;
		console.log('Scroll direction:', scrollY > previousScrollY ? 'down' : 'up');
	});
</script>
```

### $effect.root - Manual Effect Management

```svelte
<script lang="ts">
	import { $effect } from 'svelte';

	let data = $state([]);

	// ✅ Create effect that can be manually controlled
	const cleanup = $effect.root(() => {
		$effect(() => {
			console.log('Data changed:', data);
		});

		// Return cleanup function
		return () => {
			console.log('Cleaning up root effect');
		};
	});

	// Later: cleanup(); // Manually destroy effect
</script>
```

### Common $effect Patterns

#### Local Storage Sync

```svelte
<script lang="ts">
	let theme = $state<'light' | 'dark'>('light');

	// ✅ Sync state to localStorage
	$effect(() => {
		localStorage.setItem('theme', theme);
	});

	// ✅ Load from localStorage on mount
	$effect(() => {
		const saved = localStorage.getItem('theme');
		if (saved) {
			theme = saved as 'light' | 'dark';
		}
	});
</script>
```

#### Event Listener Pattern

```svelte
<script lang="ts">
	let windowWidth = $state(0);

	$effect(() => {
		const handleResize = () => {
			windowWidth = window.innerWidth;
		};

		window.addEventListener('resize', handleResize);
		handleResize(); // Initialize

		return () => window.removeEventListener('resize', handleResize);
	});
</script>
```

#### Async Effects Pattern

```svelte
<script lang="ts">
	let userId = $state<string | null>(null);
	let userData = $state<User | null>(null);
	let isLoading = $state(false);

	$effect(() => {
		if (!userId) return;

		isLoading = true;

		// ✅ Use IIFE for async
		(async () => {
			try {
				const response = await fetch(`/api/users/${userId}`);
				userData = await response.json();
			} catch (error) {
				console.error('Failed to fetch user:', error);
				userData = null;
			} finally {
				isLoading = false;
			}
		})();
	});
</script>
```

### ❌ Anti-Patterns

```svelte
<script lang="ts">
	// ❌ DON'T use $effect for derived values
	let count = $state(0);
	let doubled = $state(0);

	$effect(() => {
		doubled = count * 2; // Wrong! This creates unnecessary complexity
	});

	// ✅ Use $derived
	let doubled = $derived(count * 2);

	// ❌ DON'T create infinite loops
	let counter = $state(0);

	$effect(() => {
		counter++; // Infinite loop! Updates counter, triggers effect again
	});

	// ❌ DON'T use $effect for initialization (use onMount instead)
	$effect(() => {
		fetchInitialData(); // Will re-run unnecessarily
	});

	// ✅ Use onMount for one-time initialization
	import { onMount } from 'svelte';
	onMount(() => {
		fetchInitialData();
	});
</script>
```

---

## $props - Component Props

### Basic Usage

```svelte
<script lang="ts">
	// ✅ Simple props with destructuring
	let { title, count } = $props();

	// ✅ Props with defaults
	let { variant = 'default', size = 'md' } = $props();

	// ✅ Props with TypeScript types
	interface Props {
		user: User;
		onSave?: (user: User) => void;
		isLoading?: boolean;
	}

	let { user, onSave, isLoading = false }: Props = $props();
</script>
```

### Required vs Optional Props

```svelte
<script lang="ts">
	interface Props {
		// Required props (no default, no ?)
		title: string;
		userId: string;

		// Optional props (with ?)
		description?: string;
		onClick?: () => void;

		// Optional with defaults
		variant?: 'primary' | 'secondary';
		size?: 'sm' | 'md' | 'lg';
	}

	let {
		title, // Required
		userId, // Required
		description, // Optional (undefined if not provided)
		onClick, // Optional callback
		variant = 'primary', // Optional with default
		size = 'md' // Optional with default
	}: Props = $props();
</script>
```

### Rest Props Pattern

```svelte
<script lang="ts">
	interface Props {
		title: string;
		variant?: string;
		// ...any other props
	}

	let { title, variant = 'default', ...restProps }: Props = $props();
</script>

<!-- ✅ Pass through remaining props -->
<div class="card" {...restProps}>
	<h3>{title}</h3>
</div>
```

### Reactive Props

```svelte
<script lang="ts">
	let { count } = $props();

	// ✅ Props are automatically reactive
	// This updates when parent changes count
	let doubled = $derived(count * 2);

	// ✅ Can use props in effects
	$effect(() => {
		console.log('Count changed:', count);
	});
</script>
```

### Props with Callbacks

```svelte
<script lang="ts">
	interface Props {
		items: string[];
		onItemClick?: (item: string, index: number) => void;
		onDelete?: (index: number) => void;
	}

	let { items, onItemClick, onDelete }: Props = $props();

	function handleClick(item: string, index: number) {
		// ✅ Safe to call optional callbacks
		onItemClick?.(item, index);
	}
</script>

{#each items as item, i}
	<div on:click={() => handleClick(item, i)}>
		{item}
		{#if onDelete}
			<button on:click|stopPropagation={() => onDelete(i)}>Delete</button>
		{/if}
	</div>
{/each}
```

### Component Pattern - Card Example

```svelte
<script lang="ts">
	interface Props {
		variant?: 'default' | 'elevated' | 'interactive';
		padding?: 'sm' | 'md' | 'lg';
		class?: string;
		children?: any;
	}

	let { variant = 'default', padding = 'md', class: className = '', children }: Props = $props();

	// ✅ Derive classes from props
	let classes = $derived(`card card-${variant} padding-${padding} ${className}`);
</script>

<div class={classes}>
	{@render children?.()}
</div>
```

---

## $bindable - Two-Way Binding

### Basic Usage

```svelte
<!-- Parent.svelte -->
<script lang="ts">
  let value = $state('');
</script>

<CustomInput bind:value />
<p>Value: {value}</p>

<!-- CustomInput.svelte -->
<script lang="ts">
  // ✅ Make prop bindable
  let { value = $bindable('') } = $props();
</script>

<input bind:value />
```

### When to Use $bindable

**Use for:**

- Form components (inputs, selects, checkboxes)
- Custom controls (sliders, toggles)
- Two-way data flow requirements

**Prefer callbacks for:**

- Action events (onClick, onSave)
- One-way data flow
- Complex state updates

### Form Component Pattern

```svelte
<!-- TextInput.svelte -->
<script lang="ts">
	interface Props {
		value?: string;
		label?: string;
		error?: string;
		required?: boolean;
	}

	let { value = $bindable(''), label, error, required = false }: Props = $props();

	let hasError = $derived(!!error);
</script>

<div class="form-field">
	{#if label}
		<label>
			{label}
			{#if required}<span class="text-red-500">*</span>{/if}
		</label>
	{/if}

	<input bind:value class:error={hasError} aria-invalid={hasError} aria-required={required} />

	{#if error}
		<p class="error-message">{error}</p>
	{/if}
</div>
```

### Custom Toggle Component

```svelte
<!-- Toggle.svelte -->
<script lang="ts">
	interface Props {
		checked?: boolean;
		disabled?: boolean;
		label?: string;
	}

	let { checked = $bindable(false), disabled = false, label }: Props = $props();
</script>

<label class="toggle-container">
	<input type="checkbox" bind:checked {disabled} />
	<span class="toggle-switch"></span>
	{#if label}
		<span class="toggle-label">{label}</span>
	{/if}
</label>
```

---

## $inspect - Debugging

### Basic Usage

```svelte
<script lang="ts">
	let user = $state({ name: 'Alice', age: 30 });
	let count = $state(0);

	// ✅ Log when state changes (dev only)
	$inspect(user);
	$inspect(count);

	// ✅ Inspect multiple values
	$inspect(user, count);

	// ✅ With label
	$inspect('User state:', user);
</script>
```

### $inspect vs console.log

```svelte
<script lang="ts">
	let items = $state<Item[]>([]);

	// ❌ Regular console.log (runs only once)
	console.log(items);

	// ✅ $inspect (logs whenever items changes)
	$inspect('Items:', items);

	// ✅ $effect for custom logging
	$effect(() => {
		console.log('Items changed:', items.length, 'items');
	});
</script>
```

**Key Differences:**

- `$inspect` - Simple reactive logging (dev only)
- `$effect` - Custom side effects with full control
- `console.log` - One-time logging (not reactive)

---

## Migration Patterns

### Svelte 4 → Svelte 5

#### State Migration

```svelte
<!-- ❌ Svelte 4 -->
<script>
  let count = 0; // Implicitly reactive

  $: doubled = count * 2; // Reactive statement

  $: {
    // Reactive block
    console.log('Count:', count);
  }
</script>

<!-- ✅ Svelte 5 -->
<script lang="ts">
  let count = $state(0); // Explicitly reactive

  let doubled = $derived(count * 2); // Derived value

  $effect(() => {
    // Effect for side effects
    console.log('Count:', count);
  });
</script>
```

#### Props Migration

```svelte
<!-- ❌ Svelte 4 -->
<script>
  export let title;
  export let count = 0;
  export let onClick = undefined;
</script>

<!-- ✅ Svelte 5 -->
<script lang="ts">
  interface Props {
    title: string;
    count?: number;
    onClick?: () => void;
  }

  let { title, count = 0, onClick }: Props = $props();
</script>
```

#### Events Migration

```svelte
<!-- ❌ Svelte 4 -->
<script>
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();

  function handleClick() {
    dispatch('click', { value: 42 });
  }
</script>

<button on:click={handleClick}>Click</button>

<!-- ✅ Svelte 5 -->
<script lang="ts">
  interface Props {
    onClick?: (value: number) => void;
  }

  let { onClick }: Props = $props();

  function handleClick() {
    onClick?.(42);
  }
</script>

<button on:click={handleClick}>Click</button>
```

#### Slots to Snippets

```svelte
<!-- ✅ Svelte 5 -->
<script lang="ts">
	let { children, header, footer }: Props = $props();
	let currentUser = $state<User>({ name: 'Alice' });
</script>

<!-- ❌ Svelte 4 -->
<slot />
<slot name="header" />
<slot name="footer" user={currentUser} />

{@render children?.()}
{@render header?.()}
{@render footer?.({ user: currentUser })}
```

### Automated Migration

```bash
# Run Svelte 5 migration tool
npx sv migrate svelte-5

# Review changes and test thoroughly
# Manual cleanup may be needed for:
# - createEventDispatcher → callbacks
# - beforeUpdate/afterUpdate → $effect.pre / $effect
# - Complex reactive statements
```

---

## Common Pitfalls

### 1. Using $effect Instead of $derived

```svelte
<!-- ❌ Wrong -->
<script lang="ts">
  let count = $state(0);
  let doubled = $state(0);

  $effect(() => {
    doubled = count * 2; // Don't update state in effects!
  });
</script>

<!-- ✅ Correct -->
<script lang="ts">
  let count = $state(0);
  let doubled = $derived(count * 2);
</script>
```

### 2. Infinite Effect Loops

```svelte
<!-- ❌ Wrong -->
<script lang="ts">
  let count = $state(0);

  $effect(() => {
    count++; // Infinite loop! Updates count, triggers effect
  });
</script>

<!-- ✅ Correct - Use conditions -->
<script lang="ts">
  let count = $state(0);
  let hasInitialized = $state(false);

  $effect(() => {
    if (!hasInitialized) {
      count = 10; // Only runs once
      hasInitialized = true;
    }
  });
</script>
```

### 3. Not Using $state.raw for Large Objects

```svelte
<!-- ❌ Slow -->
<script lang="ts">
  // Making huge dataset reactive is expensive
  let largeData = $state(hugeArrayWithThousandsOfItems);
</script>

<!-- ✅ Fast -->
<script lang="ts">
  // Use raw for read-only large data
  let largeData = $state.raw(hugeArrayWithThousandsOfItems);

  // Update by replacing the entire array
  function addItem(item) {
    largeData = [...largeData, item];
  }
</script>
```

### 4. Accessing Props Before $props() Call

```svelte
<!-- ❌ Wrong -->
<script lang="ts">
  let doubled = count * 2; // count doesn't exist yet!
  let { count } = $props();
</script>

<!-- ✅ Correct -->
<script lang="ts">
  let { count } = $props();
  let doubled = $derived(count * 2);
</script>
```

### 5. Forgetting to Return Cleanup from $effect

```svelte
<!-- ❌ Memory leak -->
<script lang="ts">
  $effect(() => {
    const interval = setInterval(() => {
      console.log('Tick');
    }, 1000);
    // Missing cleanup! Interval continues after component unmounts
  });
</script>

<!-- ✅ Proper cleanup -->
<script lang="ts">
  $effect(() => {
    const interval = setInterval(() => {
      console.log('Tick');
    }, 1000);

    return () => clearInterval(interval);
  });
</script>
```

---

## Best Practices Checklist

### State Management

- ✅ Use `$state()` for all reactive component state
- ✅ Use `$state.raw()` for large immutable datasets
- ✅ Use `$state.snapshot()` to read state without creating dependencies
- ❌ Don't use `$state()` for constants
- ❌ Don't use `$state()` for derived values

### Computed Values

- ✅ Use `$derived()` for all computed values (not `$effect`)
- ✅ Use `$derived.by()` for complex multi-line computations
- ✅ Trust automatic memoization - don't manually optimize
- ❌ Don't use `$effect()` to update other state
- ❌ Don't manually track dependencies

### Side Effects

- ✅ Use `$effect()` only for true side effects
- ✅ Always return cleanup functions (event listeners, intervals, subscriptions)
- ✅ Use `$effect.pre()` for pre-update effects
- ✅ Use `onMount()` for one-time initialization
- ❌ Don't create infinite loops by updating dependencies
- ❌ Don't use `$effect()` for derived values

### Props

- ✅ Destructure props with `$props()`
- ✅ Provide TypeScript interfaces for all props
- ✅ Use `= $bindable()` for two-way binding
- ✅ Provide sensible defaults for optional props
- ❌ Don't mutate props directly (use callbacks or $bindable)

### Performance

- ✅ Use `$state.raw()` for large datasets
- ✅ Trust Svelte's memoization (no manual optimization needed)
- ✅ Minimize effect cleanup overhead
- ❌ Don't over-use effects - prefer derived values
- ❌ Don't create deep reactive structures unnecessarily

### Debugging

- ✅ Use `$inspect()` for reactive logging in development
- ✅ Use `$effect()` for custom logging
- ✅ Add TypeScript types for better IDE support
- ❌ Don't leave `$inspect()` calls in production code

---

## Related Resources

- **Official Docs**: [svelte.dev/docs/svelte/what-are-runes](https://svelte.dev/docs/svelte/what-are-runes)
- **Migration Guide**: [svelte.dev/docs/svelte/v5-migration-guide](https://svelte.dev/docs/svelte/v5-migration-guide)
- **BuildOS Patterns**: [sveltekit-patterns.md](./sveltekit-patterns.md)
- **Style Guide**: [BUILDOS_STYLE_GUIDE.md](../components/BUILDOS_STYLE_GUIDE.md)

---

**Version**: 1.0.0
**Last Updated**: 2025-11-06
**Maintainer**: BuildOS Platform Team
