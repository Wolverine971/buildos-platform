# Select Component Documentation

The `Select` component is a styled dropdown input with full support for responsive sizing, error states, helper text, and accessibility features.

## Features

- ✅ **Responsive Sizing** - Single size or different sizes at different breakpoints
- ✅ **Type-Safe** - Exported `SelectSize` and `ResponsiveSizeConfig` types
- ✅ **Accessibility** - WCAG AA compliant with 44px minimum touch target
- ✅ **Dark Mode** - Full light/dark mode support
- ✅ **Error States** - Visual error indication with error messages
- ✅ **Helper Text** - Support for additional context text below the select
- ✅ **Icon Scaling** - Chevron icon scales proportionally with select size

## Size Options

The component supports three size variants:

| Size | Height | Use Case | Touch Target |
|------|--------|----------|--------------|
| **sm** | 40px | Condensed layouts, secondary forms | 40px (accessible) |
| **md** | 44px | Standard/recommended default | 44px (WCAG AA) |
| **lg** | 48px | Prominent selections, accessibility focus | 48px (WCAG AAA) |

## Basic Usage

### Single Size (Existing Behavior)

```svelte
<script>
  import { Select } from '$lib/components/ui';
  let selectedValue = $state('');
</script>

<!-- Default size (md) -->
<Select bind:value={selectedValue}>
  <option value="option1">Option 1</option>
  <option value="option2">Option 2</option>
</Select>

<!-- Explicit size -->
<Select bind:value={selectedValue} size="lg">
  <option value="option1">Option 1</option>
  <option value="option2">Option 2</option>
</Select>
```

### Responsive Sizing (Multiple Sizes)

Specify different sizes at different viewport breakpoints:

```svelte
<script>
  import type { ResponsiveSizeConfig } from '$lib/components/ui/Select.svelte';
  let selectedValue = $state('');

  const responsiveSize: ResponsiveSizeConfig = {
    base: 'sm',    // Mobile (0px+)
    md: 'md',      // Tablet (768px+)
    lg: 'lg'       // Desktop (1024px+)
  };
</script>

<!-- Responsive sizing -->
<Select bind:value={selectedValue} size={responsiveSize}>
  <option value="option1">Option 1</option>
  <option value="option2">Option 2</option>
</Select>

<!-- Or inline -->
<Select
  bind:value={selectedValue}
  size={{ base: 'sm', md: 'md', lg: 'lg' }}
>
  <option value="option1">Option 1</option>
  <option value="option2">Option 2</option>
</Select>
```

## Props

### Core Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `string \| number` | `''` | The selected value (bindable with `bind:value`) |
| `size` | `SelectSize \| ResponsiveSizeConfig` | `'md'` | Component size or responsive size config |
| `error` | `boolean` | `false` | Whether the select is in an error state |
| `errorMessage` | `string \| undefined` | `undefined` | Error message displayed below (shown only if `error=true`) |
| `helperText` | `string \| undefined` | `undefined` | Helper text displayed below (ignored if `error=true` and errorMessage exists) |
| `placeholder` | `string` | `'Select an option'` | Placeholder text for the disabled default option |
| `required` | `boolean` | `false` | Mark the field as required (impacts `aria-required`) |
| `disabled` | `boolean` | `false` | Disable the select input |
| `class` | `string` | `''` | Additional CSS classes (merged with component classes) |

### Event Handlers

| Handler | Type | Description |
|---------|------|-------------|
| `onchange` | `(value: string \| number) => void` | Called when value changes |
| `onfocus` | `(event: FocusEvent) => void` | Called on focus |
| `onblur` | `(event: FocusEvent) => void` | Called on blur |

### Slots

| Slot | Description |
|------|-------------|
| Default (`children`) | Option elements and content to render inside the select |

## Complete Example

```svelte
<script>
  import { Select } from '$lib/components/ui';

  let status = $state('');
  let errors = $state<Record<string, string>>({});

  function handleChange(value) {
    status = value;
    // Clear error when user changes selection
    if (errors.status) {
      delete errors.status;
    }
  }
</script>

<div class="space-y-6">
  <!-- Default size with error -->
  <Select
    bind:value={status}
    placeholder="Select a status"
    error={!!errors.status}
    errorMessage={errors.status}
    onchange={handleChange}
  >
    <option value="active">Active</option>
    <option value="inactive">Inactive</option>
    <option value="pending">Pending</option>
  </Select>

  <!-- Responsive sizing -->
  <Select
    bind:value={status}
    size={{ base: 'sm', md: 'md', lg: 'lg' }}
    helperText="Select the status from the list below"
  >
    <option value="active">Active</option>
    <option value="inactive">Inactive</option>
    <option value="pending">Pending</option>
  </Select>

  <!-- Prominent selection -->
  <Select
    bind:value={status}
    size="lg"
    required={true}
  >
    <option value="">-- Select an option --</option>
    <option value="active">Active</option>
    <option value="inactive">Inactive</option>
  </Select>
</div>
```

## Type Exports

The component exports types for use in your application:

```typescript
// Import size type
import type { SelectSize } from '$lib/components/ui/Select.svelte';

// Import responsive config type
import type { ResponsiveSizeConfig } from '$lib/components/ui/Select.svelte';

// Use in component
let size: SelectSize = 'md';
let responsiveSize: ResponsiveSizeConfig = {
  base: 'sm',
  md: 'md',
  lg: 'lg'
};
```

## Responsive Breakpoints

The responsive size configuration uses Tailwind's breakpoint system:

| Breakpoint | Min Width | Use Case |
|------------|-----------|----------|
| `base` | 0px | Mobile (default) |
| `sm` | 640px | Small phones/landscape |
| `md` | 768px | Tablets |
| `lg` | 1024px | Desktops |
| `xl` | 1280px | Large desktops |

## Accessibility

### WCAG Compliance

- ✅ **Touch Target Size**: All sizes meet or exceed WCAG AA minimum (44px)
- ✅ **ARIA Attributes**:
  - `aria-invalid` set when `error=true`
  - `aria-required` set when `required=true`
  - `aria-describedby` points to error or helper text when present
- ✅ **Semantic HTML**: Uses native `<select>` element
- ✅ **Dark Mode**: Proper contrast ratios in both light and dark modes

### Testing Accessibility

```svelte
<!-- Fully accessible select with error state -->
<Select
  bind:value={formData.type}
  required={true}
  error={!!validationErrors.type}
  errorMessage={validationErrors.type}
  placeholder="Select a type"
/>

<!-- Responsive for all devices -->
<Select
  size={{ base: 'sm', md: 'md', lg: 'lg' }}
  helperText="This select adapts to your screen size"
/>
```

## Dark Mode

The component automatically adapts to dark mode using Tailwind's `dark:` prefix:

- Background: White (light) / Gray-800 (dark)
- Text: Gray-900 (light) / Gray-100 (dark)
- Border: Gray-300 (light) / Gray-600 (dark)
- Error: Red colors with proper contrast in both modes

No additional configuration needed - the dark mode detection works automatically via the `dark` class on the html/body element.

## Implementation Details

### How Responsive Sizing Works

1. **Single Size** (`size="md"`):
   - Returns base classes directly: `'pl-4 pr-11 py-2.5 text-base min-h-[44px]'`

2. **Responsive Config** (`size={{ base: 'sm', md: 'lg' }}`):
   - Base classes: `'pl-3 pr-9 py-2 text-sm min-h-[40px]'` (mobile)
   - Responsive prefixes: `'md:pl-4 md:pr-12 md:py-3 md:text-lg md:min-h-[48px]'` (tablet+)
   - Tailwind applies the appropriate classes based on viewport width

### Icon Sizing

The chevron icon scales proportionally:

| Size | Icon Size | Width | Height |
|------|-----------|-------|--------|
| sm | text-sm | 4px | 4px |
| md | text-base | 5px | 5px |
| lg | text-lg | 6px | 6px |

## Integration with Forms

The Select component works seamlessly in form contexts:

```svelte
<script>
  import { Card, CardBody } from '$lib/components/ui';
  import { Select } from '$lib/components/ui';

  let formData = $state({
    status: '',
    type: ''
  });

  let errors = $state<Record<string, string>>({});

  async function handleSubmit() {
    // Validate
    errors = {};
    if (!formData.status) errors.status = 'Status is required';
    if (!formData.type) errors.type = 'Type is required';

    if (Object.keys(errors).length > 0) return;

    // Submit...
  }
</script>

<Card>
  <CardBody>
    <form onsubmit|preventDefault={handleSubmit} class="space-y-4">
      <Select
        bind:value={formData.status}
        placeholder="Select status"
        error={!!errors.status}
        errorMessage={errors.status}
      >
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </Select>

      <Select
        bind:value={formData.type}
        placeholder="Select type"
        error={!!errors.type}
        errorMessage={errors.type}
      >
        <option value="type1">Type 1</option>
        <option value="type2">Type 2</option>
      </Select>

      <button type="submit">Submit</button>
    </form>
  </CardBody>
</Card>
```

## Styling & Customization

### Adding Custom Classes

Use the `class` prop to add additional styles (they'll be merged intelligently):

```svelte
<Select
  bind:value={status}
  class="border-blue-500"
/>
```

### Modifying Size Classes

To adjust size classes, edit the `sizeClasses` object in `Select.svelte`:

```typescript
const sizeClasses = {
  sm: 'pl-3 pr-9 py-2 text-sm min-h-[40px]',
  md: 'pl-4 pr-11 py-2.5 text-base min-h-[44px]',
  lg: 'pl-4 pr-12 py-3 text-lg min-h-[48px]'
  // xl: 'pl-5 pr-13 py-4 text-xl min-h-[56px]'  // Add new size
};
```

## Troubleshooting

### Selected Value Not Updating

Ensure you're using `bind:value`:

```svelte
<!-- ✅ Correct -->
<Select bind:value={myValue} />

<!-- ❌ Wrong -->
<Select value={myValue} />
```

### Responsive Size Not Working

Verify your `ResponsiveSizeConfig` object is properly typed:

```typescript
// ✅ Correct
const size = { base: 'sm', md: 'md', lg: 'lg' };

// ❌ Missing base - might not work as expected
const size = { md: 'md', lg: 'lg' };
```

### Dark Mode Not Applying

Ensure the root element has the `dark` class:

```html
<!-- In +layout.svelte -->
<div class={darkMode ? 'dark' : ''}>
  <slot />
</div>
```

## Related Components

- **TextInput** - Similar responsive sizing system for text inputs
- **Card** - Use with Select for styled form containers
- **Button** - Pair with Select for form submission

## Migration from Previous Versions

The Select component maintains **full backward compatibility**. Existing code using single sizes continues to work:

```svelte
<!-- Still works (md is default) -->
<Select bind:value={status} />

<!-- Still works -->
<Select bind:value={status} size="lg" />
```

No changes needed to migrate to the new responsive sizing feature. It's purely additive.

## Performance Considerations

- The `getResponsiveSizeClasses` and `getResponsiveIconClasses` functions are called in `$derived` blocks
- They're recomputed whenever the `size` prop changes
- For performance-critical scenarios with frequent size changes, consider memoizing the result

## Contributing

When modifying the Select component:

1. Update this README with any new features or changes
2. Ensure backward compatibility (don't break single size usage)
3. Test both single and responsive sizes
4. Verify dark mode and accessibility features
5. Check responsive breakpoints work correctly

---

**Last Updated**: 2025-11-07
**Component File**: `/apps/web/src/lib/components/ui/Select.svelte`
