# Changelog

All notable changes to the Inkprint Texture Library will be documented in this file.

## [1.1.0] - 2026-07-24

### Changed

- Generated every public CSS module from the app's canonical Inkprint runtime source
- Added drift checks to the web lint pipeline and automatic sync before builds
- Updated light/dark tokens to the current warm, contrast-tested palette
- Added `tx-grid` and renamed float helpers to `ink-float-left` / `ink-float-right`
- Added reduced-motion and hover-capability guards to interactive and motion utilities
- Kept public shadow utilities while removing their duplicate runtime definitions

## [1.0.0] - 2026-01-25

### Added

- Initial release of Inkprint Texture Library
- 7 semantic texture types (bloom, grain, pulse, static, thread, frame, strip)
- Button texture with brushed aluminum effect
- 3 intensity levels (weak, medium, strong)
- Complete color system with light/dark mode support
- Shadow system (ink, ink-strong, ink-inner, ink-frame)
- Atmosphere layer for depth (weak, medium, strong)
- Weight system (ghost, paper, card, plate)
- Interactive states (pressable, rim, rim-accent)
- Motion animations (ink-in, ink-out)
- Utility classes for layout and spacing
- Comprehensive README with usage examples
- Quick start guide
- Interactive demo.html
- Individual modular CSS files
- Combined all-textures.css bundle

### Design Philosophy

- Synesthetic feedback - textures convey semantic meaning
- Printmaking-inspired aesthetic
- Performance-first (CSS-only, no images except button texture)
- Dark mode support throughout
- Responsive and accessible

### Files Included

- `color-system.css` - Semantic color tokens
- `textures-core.css` - All texture types
- `textures-intensities.css` - Intensity modifiers
- `shadows.css` - Shadow utilities
- `atmosphere.css` - Atmospheric depth layer
- `weight-system.css` - Semantic weight tokens
- `interactive.css` - Interactive states
- `motion.css` - Animation utilities
- `utilities.css` - Layout and spacing utilities
- `all-textures.css` - Complete bundle
- `README.md` - Comprehensive documentation
- `QUICK_START.md` - Quick reference guide
- `demo.html` - Interactive demonstration
- `CHANGELOG.md` - Version history
- `package.json` - Package metadata

## Future Considerations

- [ ] Configurable texture opacity via CSS custom properties
- [ ] Additional texture patterns
- [ ] Animation utilities for texture transitions
- [ ] Accessibility enhancements for texture contrast
- [ ] Performance optimization for large-scale applications
- [ ] Texture pattern variants (dense, sparse)
