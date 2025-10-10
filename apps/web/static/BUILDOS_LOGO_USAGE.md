# BuildOS Logo Files

This directory contains the BuildOS logo with gradient text matching the Navigation component styling.

## Available Files

### SVG (Scalable Vector Graphics - Recommended)
- `buildos-logo-light.svg` - Light mode version (purple-600 to blue-600)
- `buildos-logo-dark.svg` - Dark mode version (purple-400 to blue-400)

### PNG (Raster Images)
- `buildos-logo-light.png` - 2x resolution (600x160px)
- `buildos-logo-light@3x.png` - 3x resolution (900x240px)
- `buildos-logo-dark.png` - 2x resolution (600x160px)
- `buildos-logo-dark@3x.png` - 3x resolution (900x240px)

## Color Values

### Light Mode Gradient
- Start: `#9333ea` (purple-600)
- End: `#2563eb` (blue-600)

### Dark Mode Gradient
- Start: `#c084fc` (purple-400)
- End: `#60a5fa` (blue-400)

## Usage Examples

### In HTML
```html
<!-- Light mode -->
<img src="/buildos-logo-light.svg" alt="BuildOS" width="300" height="80" />

<!-- Dark mode -->
<img src="/buildos-logo-dark.svg" alt="BuildOS" width="300" height="80" />

<!-- Responsive with theme switching -->
<picture>
  <source srcset="/buildos-logo-dark.svg" media="(prefers-color-scheme: dark)" />
  <img src="/buildos-logo-light.svg" alt="BuildOS" width="300" height="80" />
</picture>
```

### In Svelte Component
```svelte
<script>
  import { browser } from '$app/environment';
  let isDark = $state(false);

  $effect(() => {
    if (browser) {
      isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
  });
</script>

<img
  src={isDark ? '/buildos-logo-dark.svg' : '/buildos-logo-light.svg'}
  alt="BuildOS"
  class="w-auto h-20"
/>
```

### In CSS Background
```css
.logo-light {
  background-image: url('/buildos-logo-light.svg');
  background-size: contain;
  background-repeat: no-repeat;
}

.logo-dark {
  background-image: url('/buildos-logo-dark.svg');
  background-size: contain;
  background-repeat: no-repeat;
}
```

### Email/Social Media
Use PNG versions for better compatibility:
- Standard displays: `buildos-logo-light.png`
- Retina/High-DPI: `buildos-logo-light@3x.png`

## File Specifications

- **Background**: Transparent (no background)
- **Font**: System UI font family (system-ui, -apple-system, BlinkMacSystemFont, Segoe UI)
- **Font Weight**: 800 (Extrabold)
- **Letter Spacing**: -0.02em (tight)
- **Format**: SVG (vector) and PNG (raster)
- **Gradient Direction**: Left to right (horizontal)

## When to Use Each Version

### Use SVG when:
- Embedding in web pages
- Need scalability
- Want smallest file size
- Targeting modern browsers

### Use PNG when:
- Email templates
- Social media posts
- Legacy browser support needed
- Office documents (PowerPoint, etc.)

## Notes

- SVG files are only 616-618 bytes (tiny!)
- PNG files maintain transparent background
- All files use the exact same gradient as Navigation.svelte
- Font matches system UI for consistency across platforms
