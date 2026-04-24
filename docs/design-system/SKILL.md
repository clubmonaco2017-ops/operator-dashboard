---
name: operator-dashboard-design
description: Use this skill to generate well-branded interfaces and assets for operator-dashboard (internal CRM for an agency managing OF-style operator-translators), either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

Key files:
- `README.md` - full content fundamentals, visual foundations, iconography
- `colors_and_type.css` - CSS variables for colors, type, spacing, radii, elevation, shifts, roles, status
- `preview/` - individual token/component preview cards
- `ui_kits/operator-dashboard/` - interactive click-through prototype (staff master-detail, three-pane desktop + mobile tab-bar)
- `assets/` - logos, brand marks

Hard rules (from product owners):
- Dark mode mandatory on every screen - not decorative.
- No "Hello, Robert 👋" greetings, no emoji in UI copy. Tone is professional, internal.
- Never use the word «менеджер» (deprecated in this domain).
- No playful illustrations; no bright green / pink accents.
- Mobile-first for Operator/Moderator; desktop-first for Admin/Teamlead.
- Chart palette: max 3 colors (blue / amber / grey).
- KPI cards always have: metric + delta + info-icon + mini bars.
