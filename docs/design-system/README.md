# Operator Dashboard - Design System

Internal CRM for an agency that manages operator-translators. Operators write messages to subscribers of "models" (creators) on OF-like platforms on behalf of the models themselves. The CRM is used to: assemble 3-operator teams for each model, schedule shifts (day / evening / night), push tasks top-down, and collect reports with media.

**Audience:** internal staff only - Superadmin, Admin, Teamlead, Moderator, Operator. No public surface.
**Form factor split:** mobile-first for Operator / Moderator, desktop-first for Admin / Teamlead.

This design system is **not** a marketing brand system. It is a working visual language for a data-dense, permission-heavy internal CRM. Every decision below serves density, legibility, and speed - not delight.

---

## Sources of truth

Read first, always:
- `docs/domain-model.md` - business domain, 5 roles, 16 permissions, entity diagram, invariants (1 team = exactly 3 operators, 1 client → 1 team, etc.).
- `docs/design-inspiration/notes.md` - annotated references (Attio, Intercom, Autosend, shadcnblocks dashboard16 / application-shell7, Chatbase empty states).

Codebase (read-only, mounted):
- `src/` - React 19 + Vite + Tailwind CSS v4 + shadcn/ui (style: `base-nova`) + Supabase. Theme tokens already live in `src/index.css` (expanded and remapped to Blue primary here).
- `src/components/staff/*` - reference implementation of the master-detail pattern that we lift into the UI kit.

Uploaded references (in `uploads/` and `docs/design-inspiration/**`):
- Attio: `attio-initial-empty-add-column.png`, `attio-initial-empty-email-templates.png`, `attio-record-detail-page.png`, `attio-table-with-filters.png`
- Intercom: `intercom-inbox-dashboard.png`, `intercom-reports-dashboard.png`, `intercom-slideout-detail.png`
- Autosend: `autosend-dashboard-stats.png`
- Chatbase: `chatbase-empty-state-dual.png`
- Galleries: `dribbble-grid-gallery-meta.png`, `pinterest-masonry-gallery.png`, `spline-grid-gallery-dark.png`

---

## Index

| File / folder | What it is |
|---|---|
| `README.md` | This file - context, content + visual fundamentals, iconography |
| `colors_and_type.css` | CSS custom properties (tokens): colors (light + dark), type scale, radii, elevation, motion |
| `fonts/` | Geist + Geist Mono references (loaded via CDN, see note in Typography) |
| `assets/` | Role icons, status dots, illustrations placeholders |
| `preview/` | Design-system preview cards (one per token group) |
| `ui_kits/operator-dashboard/` | Pixel-faithful recreation of the app - Desktop three-pane + Mobile bottom-sheet |
| `SKILL.md` | Skill manifest - makes this directory usable as a Claude / Claude Code skill |

UI kits:
- `ui_kits/operator-dashboard/index.html` - interactive click-through (desktop three-pane + mobile tabs)

---

## Content fundamentals

**Language:** Russian UI copy throughout (the codebase and stakeholders are Russian-speaking). Keep this even for new screens - do not mix languages.

**Tone:** professional, internal, neutral. Operators see the CRM every day for an 8-hour shift - copy has to stay out of the way.

- **No hero greetings.** Never "Hello, Robert 👋". Screen titles read like file labels: `Сотрудники`, `Задачи`, `Клиенты`, `Команды`.
- **No emoji in UI copy.** Icons come from Lucide (see Iconography). Emoji leaks in `DashboardPage.jsx` (📊, 🥇, etc.) are **legacy** and should be replaced as those screens are rebuilt.
- **No first person from the system.** "Не найдено" rather than "Мы ничего не нашли". "Выберите сотрудника" rather than "Выбери".
- **Second-person addresses the user formally (`вы`, not `ты`)** - but prefer impersonal ("Выберите" / "Укажите") over "Вы выбрали".
- **Casing rules:**
  - Screen titles: `Sentence case` - "Сотрудники", "Запросы на удаление".
  - Section labels inside a screen: `UPPERCASE` + `letter-spacing: 0.08em`, 11px. E.g. `РОЛЬ`, `СМЕНА`, `РЕФ-КОД`, `АКТИВНОСТЬ`. This is the signature "technical tone" pulled from Autosend and Geist system typography.
  - Buttons: sentence case verb-first - "Создать", "Отправить запрос", "+ Добавить сотрудника".
  - Pills / chips: `Sentence case` for labels, `UPPERCASE` only for shift codes (`ДНЕВНАЯ`, `ВЕЧЕРНЯЯ`, `НОЧНАЯ`) and role codes in ref-codes (`MOD-ИванП-001`).
- **Numbers:** always tabular-nums. Money is formatted `12 345.67 $` (space-grouped, dollar suffix). Counts are bare integers. Dates are ISO in raw data, localized (`24 апр`) in UI.
- **Empty state copy is specific.** Never a generic "Нет данных". Always:
  1. What would be here (noun).
  2. Why it's empty (zero-state / filter / selection / error / loading - see Visual Foundations § Empty states).
  3. What to do (CTA verb).

  Example (filter empty):  
  > *Под фильтр ничего не подходит*  
  > Попробуйте снять фильтр «Модераторы» или сбросить все фильтры.  
  > `Сбросить фильтры`

- **Forbidden words:** **"Менеджер"** - deprecated in the domain. Use the specific role (`Админ`, `Модератор`, `Тим Лидер`, `Оператор`) or the generic `Сотрудник`.
- **Shortcuts are shown, not hidden.** Any inputted action that has a shortcut (`⌘K`, `/`, `Esc`, `↵`) shows the key inline in the button / tooltip / placeholder. `Поиск` inputs always carry a `/` hint on the right.

---

## Visual foundations

### Palette - Blue primary, restrained accents

- **Primary:** Blue (`oklch(0.546 0.215 262.9)` light / `oklch(0.64 0.19 260)` dark). The only color for primary CTAs, links, focus rings, active-nav state, and the chart-1 series.
- **Neutrals** carry most of the UI. The scale is cool-blue-tinted on purpose - `oklch(… 250)` hue for every grey. Never `#888888` pure grey.
- **Semantic** (green / amber / red) appears only at bespoke signal points: status dots, destructive actions, warning banners. Never as a "friendly" surface color.
- **Shift codes** - day/evening/night - use the full amber / violet / slate triplet. This is domain-specific and the single place where violet lives in the UI.
- **Chart palette is hard-capped at 3 colors** (blue / amber / grey) - the Intercom Reports rule. Do not introduce a 4th.

See `colors_and_type.css` for every token and both modes.

### Typography - Geist, technical tone

- **Sans:** Geist Variable. **Mono:** Geist Mono Variable. Both loaded via `@fontsource-variable/geist` in the codebase; CDN-linked from `colors_and_type.css` for standalone previews.
- The "signature" is all-caps section labels with 0.08em letter-spacing at 11px, color `--fg3`. Use it liberally to divide dense content.
- Tabular numerics (`font-variant-numeric: tabular-nums`) on every money / metric / counter value.
- No alternative typefaces. Do not introduce serif display or "friendly" rounded fonts.

> **Substitution note:** **Geist Variable** is now self-hosted from `fonts/Geist_wght_.woff2` (uploaded by the brand team - single variable axis, weights 100-900). **Geist Mono** is still loaded via jsDelivr CDN (`@fontsource-variable/geist-mono`). If you want mono self-hosted, drop the mono `.woff2` into `fonts/` and swap the `@import` in `colors_and_type.css`.

### Backgrounds

- **No imagery in the shell.** No gradients. No full-bleed photos. No textures. No hand-drawn illustrations. Backgrounds are flat surfaces only: `--bg`, `--surface`, `--surface-2`, `--surface-3`.
- The one exception: client (model) profile pages show a grid of photos - this is the only user-uploaded imagery surface, and it sits inside a contained tab.

### Spacing + layout

- 4-based spacing scale (`--sp-1 … --sp-16`). Density is the priority: default padding inside a card is `16px` (`--sp-4`), table rows are `10px` vertical, form inputs are `36px` tall.
- **Desktop shell** = three-pane: **rail (56px)** + **list pane (320-420px)** + **main (fluid)** + optional **activity panel (320px)**. The pattern is shadcnblocks `application-shell7`. All detail surfaces are slide-outs on top of the list, not routed pages - URL state is `?id=…`.
- **Mobile shell** = full-width with a **bottom tab-bar (64px)** and a **bottom-sheet drawer** for secondary navigation (drag-handle). Master-detail collapses to stacked push-navigation.

### Corners + borders

- Radii: controls `6-8px`, cards `10-14px`, sheets + modals `18px`, pills `999px`. No perfectly square corners outside of table cells.
- Border is **1px, low-contrast** (`--border` = 8% white on dark, `oklch(0.922 …)` on light). Borders define regions; shadows do not.

### Elevation / shadow system

Three steps only:
- **elev-1** - cards, tables, inputs at rest. Barely visible: `1px` offset + `2px` blur.
- **elev-2** - hovered row actions, dropdowns, popovers.
- **elev-3** - modals, slide-outs.

No coloured shadows. No glow. Use borders for definition, not shadows.

### Hover / press / focus states

- **Hover on rows + list items:** background step from `--surface` → `--surface-2` (dark: `--surface` → `--surface-3`). Never color the text on hover - only the surface shifts. Hover-revealed actions (three-dot, trash) are the Attio pattern.
- **Hover on buttons:** primary steps to `--primary-hover` (one shade darker light / lighter dark). Ghost buttons step from transparent → `--surface-2`.
- **Press:** 120ms transition, no shrink or scale. Tactile via color only.
- **Focus:** single `box-shadow` ring - `0 0 0 3px oklch(blue / 0.35)`. Applied to every focusable via `:focus-visible`. Never rely on browser default.
- **Disabled:** `opacity: 0.5`, `cursor: not-allowed`, no surface change.

### Transparency, blur

- **Used on:** modal overlay (`--overlay`, 45% dim + 4px backdrop-blur), mobile bottom-sheet scrim.
- **Not used on:** cards, sidebars, sticky headers. Sticky table headers use opaque `--surface-2` (they sit above scrolling content - transparency here causes bleed).

### Animation

- Easing token `--ease: cubic-bezier(0.2, 0, 0, 1)` (out-expo-like) for shell transitions.
- `--ease-spring: cubic-bezier(0.32, 0.72, 0, 1)` for bottom-sheet drag (Vaul) and pull-to-refresh (Framer Motion).
- Durations: `fast 120ms` (hover / press / pill toggle), `base 180ms` (slide-outs, drawers), `slow 260ms` (bottom-sheet snap, route-like swaps).
- **No bounces** on feedback animations - this is a tool, not a delight object. Bouncy easing is reserved for gesture dismissals where physics helps legibility.
- **No long cross-fades.** Keep layout mutations under 200ms.

### Cards - anatomy

- 1px border (`--border`), radius `14px` (`--radius-xl`), `--surface`, `--elev-1`.
- Header row: caps label on the left, small actions on the right, `40px` tall, borderless.
- Body uses `20px` padding.
- **KPI card** = caps label with dot + info-icon (hover tooltip) + big number (tabular) + micro bar chart. This is the Autosend / dashboard16 pattern. See `preview/card-kpi.html`.

### Data density rules (priority 1)

- Tables carry 20+ columns - horizontal scroll with **sticky first column** and **sticky header**. Row height `40px`. Zebra striping on every second row in light mode only (`--surface-2` at 40% opacity); dark mode omits zebra (visual noise).
- **Filter-chips** live directly above the table, left-aligned. Active chips use `--primary-soft-2` fill + `--primary-ink` text. `+ Add filter` is a final dashed-border chip.
- **Inline-edit** on every display-only cell - click → input appears with focus ring, `↵` saves, `Esc` cancels. No modal for field edits.
- `⌘K` opens the global command palette (create, navigate). `/` focuses the page search. Both hints are shown in the empty state of their respective inputs.

### Empty states - 5 types (Chatbase + Attio classification)

1. **Initial (zero-state)** - no data yet. Icon in a circle, specific title, one-line "what this is for", primary blue CTA with verb - see `attio-initial-empty-add-column.png`.
2. **Filter** - data exists, filter hides it. Secondary copy + "Сбросить фильтры" link.
3. **Selection** - master-detail with nothing selected. Low-key neutral illustration + "Выберите … слева" - see `chatbase-empty-state-dual.png`.
4. **Error** - load failed. Red-ink icon, error message, `Повторить` button.
5. **Loading** - skeleton rows matching the final layout, 3 rows minimum. No spinners on initial page loads; spinners only inside inline async actions.

### Color vibe of imagery

Cool, flat, low-saturation. No warm/peachy tints. Dark mode dominates in screenshots/demos by default because that's how operators use the product at night.

### Fixed vs scrolling

- Sidebar rail + list pane + top bar are fixed.
- Main content + activity panel scroll independently.
- On mobile, the bottom tab-bar is fixed; everything above scrolls.

---

## Iconography

- **Library:** [Lucide](https://lucide.dev/) (`lucide-react` in code, CDN-delivered SVG sprite in standalone previews). Stroke-based, 2px stroke weight, 24×24 viewBox. Rendered at 16px (controls), 20px (nav), 24px (hero).
- **Why Lucide:** it's the default for shadcn/ui, which is the project's UI layer. Every icon in `src/AdminLayout.jsx`, `src/AdminPanel.jsx`, etc. is already a Lucide-shaped inline SVG. See `assets/icons.md` for the canonical mapping from domain nouns to Lucide names.
- **No emoji in UI.** The emoji visible in `src/pages/DashboardPage.jsx` (📊, 🥇, 🥈, 🥉, 📭, ⚠️) are legacy and are replaced by Lucide icons in this design system. Unicode characters used as icons (↑, ↓, ↻) are acceptable for sort indicators and refresh chevrons only.
- **Avatars** - placeholder initials in a `40px` circle, `bg-primary-soft` + `text-primary-ink`. No generated avatar art. Real avatar imagery is optional (Supabase Storage `client-avatars` bucket) and falls back to initials cleanly.
- **Status dots** - 8px filled circle, drawn from the semantic palette. One dot per status; never stack.
- **Logos** - no corporate logo exists for the internal tool. The "brand mark" is a simple square with the `blue-600` primary and a `MessageSquare` Lucide glyph at 60%. See `assets/brand-mark.svg`.

**CDN:**
```html
<script src="https://unpkg.com/lucide@0.460.0/dist/umd/lucide.min.js"></script>
<i data-lucide="users" style="width:16px;height:16px"></i>
<script>lucide.createIcons();</script>
```

---

## Caveats / asks

- **Fonts** - **Geist Variable** is self-hosted at `fonts/Geist_wght_.woff2`. **Geist Mono** is still loaded via jsDelivr CDN. Drop a mono `.woff2` into `fonts/` and swap the `@import` if you need strict-CSP or full offline support.
- **Logo** - no real brand mark exists; the generated `assets/brand-mark.svg` is a placeholder. Replace when a real mark lands.
- **`src/index.css` is still neutral-primary** in the codebase. This system defines Blue primary (per the design-inspiration brief). Apply the `colors_and_type.css` tokens into `src/index.css` as part of Subplan 6.
- **Legacy emoji** in `DashboardPage.jsx` + `AdminLayout.jsx` (📊, 🥇, etc.) must be replaced with Lucide icons when those screens are rebuilt.
