# CRM Subplan 6 — Design System Foundation · Design Spec

**Status:** Brainstormed · approved.
**Author:** Claude Code (Opus 4.7) + Artem.
**Date:** 2026-04-26.
**Implements:** Domain model §8 row 6 «Дизайн-система» — foundation tier.

---

## 1. Goal & non-goals

**Goal:** Foundation tier of the design-system rollout. Apply the full Claude Design token set to `src/index.css`, sweep every custom inline SVG and emoji into `lucide-react` icons, and pilot-install `application-shell7` + 3 primitives from shadcnblocks (Premium registry already configured) — without touching shell layout or page UI. Result: invisible-ish polish + ready scaffolding for the big visual overhaul.

**В scope:**

- Full token apply: `docs/design-system/colors_and_type.css` (277 lines) → extend `src/index.css` with missing tokens (shifts, roles, task statuses, full type/spacing/elev scales, motion easings) + verify dark-mode parity.
- Iconography sweep: replace ALL custom `function XxxIcon()` inline SVG components across ~20 files with `lucide-react` named imports. Replace 9 emoji in DashboardPage / ClientDetailPanel / LoginPage with Lucide equivalents.
- shadcnblocks pilot: verify MCP/registry config → `npx shadcn add @shadcnblocks/application-shell7` + 3 base primitives (`card`, `sheet`, `dialog`) for future Subplan 6A use. Files installed, **not integrated** into pages.

**Out of scope (deferred to 6A / 6B):**

- **Shell rebuild** (three-pane rail/list/main/activity replacing 240px sidebar) → Subplan 6A.
- **Page repaint** of Dashboard/Staff/Clients/Teams/Tasks → Subplan 6A.
- **DashboardPage** full rewrite (legacy pre-CRM style) → Subplan 6A. Subplan 6 only swaps emoji in that file.
- **UI primitives refactor** (existing inline Tailwind in components → use shadcn primitives) → Subplan 6A per-page basis.
- **Mobile shell** (bottom-tabs, bottom-sheet) → Subplan 6B.
- Real Lucide icons used in shadcnblocks-installed components are unchanged (we don't audit those — they're scaffolded reference, not live UI).

---

## 2. Decisions log

| # | Решение | Rationale |
|---|---|---|
| **D-1** | Decompose Subplan 6 into three subplans: **6** (foundation: tokens + icons + pilot install), **6A** (shell rebuild + page repaint sweep + DS primitives integration), **6B** (mobile bottom-tabs + bottom-sheet). | Foundation work is mechanical, low-risk, fast-merge. Shell + repaint is "all or nothing" эстетически. Mobile — отдельный UX layer со своими decisions. Three cohesive iterations. |
| **D-2** | Subplan 6 strictly excludes shell rebuild — even define-only. Shell delivery happens in 6A as one cohesive change. | Half-migrated UI (one page on new shell, others on old) выглядит хуже чем consistent old. Subplan 6 = "механика", 6A = "редизайн". Clean separation. |
| **D-3** | Subplan 6 strictly excludes UI primitives refactor of existing pages. Inline Tailwind + Stage 8 utility-classes (`.btn-primary` etc.) stay as-is. shadcn primitives installed но не intergrated. | Установка primitives без интеграции — wasted scope. Real benefit comes when pages use them — that's 6A. |
| **D-4** | Use shadcnblocks (premium registry, MCP-connected, already в `components.json`). Specifically `application-shell7` per design-system README L108 explicit reference. | DS explicitly references shadcnblocks blocks as inspiration. Premium subscription paid for. MCP enables fast install/search. Custom-build shell from scratch wastes effort. |
| **D-5** | Iconography sweep — full sweep (option C). Replace all custom `function XxxIcon()` definitions across components + emoji. Use `lucide-react` (already в `package.json`). | `lucide-react` in package, shadcn config `iconLibrary: lucide`, DS spec L182 mandates Lucide. Mixed-icon legacy if не sweep — Subplan 6A потом тащит проблему. Foundation = до конца. |
| **D-6** | DashboardPage emoji-fix only in Subplan 6. Полное переписывание под new shell + DS — Subplan 6A. | Memory: «DashboardPage legacy pre-CRM, будет полностью переписан». Минимум-fix в 6 чтобы не оставлять mixed icon style. |
| **D-7** | Optional: introduce `src/lib/icons.js` central re-export of Lucide icons. | Single point для future renames + curated icon set (avoid bundle bloat). YAGNI-trigger: skip if implementer judges direct imports cleaner. **Default: include** (single import line per file simpler). |
| **D-8** | shadcnblocks pilot install includes 3 primitives (Card, Sheet, Dialog) + application-shell7. Files installed, build verifies, **никакая интеграция в pages**. | Готовая база для 6A. Если установка fails (registry token issue) — Stage stops, fix infra first. |
| **D-9** | Stage 8 utility-classes (`.btn-primary`, `.btn-ghost`, `.btn-danger-ghost`, `.surface-card`, `.focus-ds`, `.label-caps`, `.tabular`, `.editable-text`) сохраняются в `src/index.css`. | Они уже built вокруг tokens. Refactor существующих usages под shadcn primitives — это 6A. Не ломаем работающее. |
| **D-10** | Token apply — extend, не replace. Token имена что уже existing (DS values из Stage 8 предыдущих subplan'ов) keep value. Token имена missing in current `src/index.css` — добавить из DS. Conflicting values — DS wins (single source of truth). | Минимум disruption + reach DS spec compliance. |

---

## 3. Token application details

### 3.1. Tokens to add (from `docs/design-system/colors_and_type.css`)

Compare current `src/index.css` `:root` block (~80 tokens after Stage 8 of Subplan 3) against DS file. Identified deltas to add (verify exact list при implementation):

**Shifts (domain-specific):**
- `--shift-day`, `--shift-evening`, `--shift-night` (amber/violet/slate triplet — sole place violet lives in UI per DS).

**Roles (badges):**
- `--role-superadmin`, `--role-admin`, `--role-moderator`, `--role-teamlead`, `--role-operator`.

**Task statuses (semantic):**
- `--status-pending`, `--status-in-progress`, `--status-done`, `--status-overdue`.

**Type scale (extend if missing):**
- `--fs-xxs` (11px), `--fs-xs` (12px), ... `--fs-3xl` (36px); `--lh-tight/snug/base`; `--ls-caps/tight`.

**Spacing (extend if missing):**
- `--sp-1` (4px) through `--sp-16` (64px) on 4-base grid.

**Elevation:**
- `--elev-1`, `--elev-2`, `--elev-3` (only 3 levels per DS).

**Motion:**
- `--ease`, `--ease-spring`, `--dur-fast/base/slow`.

**Border-strong:**
- `--border-strong` (used for empty states).

### 3.2. Tokens to verify (overlap)

Already в `src/index.css` post-Stage 8: `--bg`, `--surface`, `--surface-2/3`, `--fg1` через `--fg4`, `--primary`, `--primary-hover/soft/soft-2/ink/ring/disabled`, `--success`, `--warning`, `--danger` (с `-soft`/-`ink` variants), `--info`, `--chart-1` через `--chart-5`, `--overlay`, `--focus-ring`. Verify match с DS values; flag deltas inline в commit message.

### 3.3. Dark mode parity

Каждый new token — добавить override в `.dark` блок. DS provides dark values explicitly.

### 3.4. Tailwind v4 `@theme inline` aliases

Where new tokens want to be used as `bg-foo` / `text-foo` Tailwind classes, add to `@theme inline` block (e.g. `--color-shift-day: var(--shift-day);`). Subplan 3 Stage 8 already added pattern для DS-aware `--color-fg1-4`, `--color-border-strong`, etc. Extend.

---

## 4. Iconography sweep details

### 4.1. Custom inline SVG → Lucide mapping

Authoritative mapping (used by Stage 2 implementer). All Lucide imports come from `lucide-react`.

| Custom name | Lucide equivalent | Usage hint |
|---|---|---|
| `PencilIcon` | `Pencil` | Edit affordance. `size={14}`. |
| `CloseIcon` / `SmallCloseIcon` | `X` | Close button. `size={16}` or `{14}`. |
| `ChevronIcon dir="left"` | `ChevronLeft` | Lightbox prev. `size={22}`. |
| `ChevronIcon dir="right"` | `ChevronRight` | Lightbox next. |
| `DownloadIcon` | `Download` | Download links. `size={16}`. |
| `DotsIcon` | `MoreHorizontal` | Kebab menu. `size={16}`. |
| `ExpandIcon` | `Maximize2` | Open lightbox. `size={14}`. |
| `CheckIcon` | `Check` | Success / checkbox check. `size={16}`. |
| `WarnIcon` | `AlertTriangle` | Warning. `size={16}`. |
| `Spinner` | `Loader2` | With `className="animate-spin"`. `size={14-16}`. |
| `UploadIcon` / `CloudUploadIcon` | `Upload` | Upload action. `size={14}`. |
| `CloudXIcon` | `CloudOff` | Drop reject. `size={22}`. |
| `GripIcon` | `GripVertical` | Drag handle (sort toggle). `size={12}`. |
| `CalendarIcon` | `Calendar` | Date sort. `size={12}`. |
| `ImageIcon` | `Image` | Image placeholder. `size={22}`. |
| `FilmIcon` | `Film` | Video placeholder. `size={22}`. |
| `PlayIcon` | `Play` | Play overlay. `size={20}`. |
| `EyeIcon` | `Eye` | Views metric. `size={11}`. |
| `DollarIcon` | `DollarSign` | Revenue metric. |
| `PostIcon` | `FileText` | Posts metric. `size={11}`. |
| `LinkIcon` / `LinkIconInline` | `Link` | Tableau link. `size={11-12}`. |
| `LockIcon` | `Lock` | Read-only. `size={12}`. |
| `FunnelXIcon` | `FilterX` | Empty filter. `size={14-22}`. |
| `UserPlusIcon` | `UserPlus` | Empty zero CTA. `size={22}`. |
| `CursorIcon` | `MousePointer2` | Empty hint. `size={22}`. |
| `CheckboxIcon` | `Square` или `CheckSquare` | Toggle (depending on state). |
| `PlatformIcon` | `Globe` | Filter chip. `size={14}`. |
| `AgencyIcon` | `Briefcase` | Filter chip. `size={14}`. |
| `EventIcon` (in ActivityCard) | type-specific: `Plus` (created), `Archive` (archived), `Image` (media), etc. | Inline mapping per event_type. |

**Implementation pattern:** delete the local function, add `import { Pencil } from 'lucide-react'`, replace `<PencilIcon />` with `<Pencil size={14} />`. Preserve existing styling props (className, etc.) — Lucide accepts `className` and `style`.

### 4.2. Optional `src/lib/icons.js`

```js
// Central re-export. Single update point if Lucide renames or we swap icon library.
export {
  Pencil, X as Close, ChevronLeft, ChevronRight,
  Download, MoreHorizontal as Dots, Maximize2 as Expand,
  Check, AlertTriangle as Warn, Loader2 as Spinner,
  Upload, CloudOff, GripVertical as Grip, Calendar,
  Image, Film, Play, Eye, DollarSign, FileText, Link,
  Lock, FilterX, UserPlus, MousePointer2, Square, CheckSquare,
  Globe, Briefcase, Plus, Archive, BarChart3,
  Inbox, Trophy, Users, ClipboardList, Bell, Search,
  Settings, ChevronDown, ChevronUp, Trash2, Filter,
} from 'lucide-react'
```

Implementer: include if simpler. Skip if reading "import {Pencil} from '../../lib/icons'" feels overengineered vs direct import.

### 4.3. Emoji replacements

| File:Line | Emoji | Replacement |
|---|---|---|
| `src/LoginPage.jsx:29` | `📊` (logo placeholder) | `<BarChart3 size={20} />` или удалить совсем (placeholder). |
| `src/components/clients/ClientDetailPanel.jsx:158` | `🌐 platform_name` | `<Globe size={12} className="inline mr-1" /> {platform_name}` |
| `src/components/clients/ClientDetailPanel.jsx:159` | `🛍 agency_name` | `<Briefcase size={12} className="inline mr-1" /> {agency_name}` |
| `src/components/clients/ClientDetailPanel.jsx:161` | `📊 tableau_id` | `<BarChart3 size={12} className="inline mr-1" /> {tableau_id}` |
| `src/pages/DashboardPage.jsx:311` | `📊` (h1 logo) | `<BarChart3 size={20} />` |
| `src/pages/DashboardPage.jsx:461` | `📊 Выручка по часам` | `<BarChart3 size={14} className="inline mr-1.5" /> Выручка по часам` |
| `src/pages/DashboardPage.jsx:555` (medals array) | `['🥇','🥈','🥉','4️⃣','5️⃣']` | Just numeric `[1,2,3,4,5]` displayed as `<span class="font-mono tabular text-sm">{`#${n}`}</span>` (per DS rule "no emoji"). Optionally first 3 get `<Trophy />` of yellow/silver/bronze tones — but minimal version: just `#1 #2 ...`. |

`📭` and `⚠️` — locate в DashboardPage (similar pattern), replace with `<Inbox />` / `<AlertTriangle />` respectively.

### 4.4. ClientDetailPanel chip emoji also applies к Subplan 4 / 5 components if any leaked emoji exist

Implementer: `grep -rE "[\u{1F300}-\u{1F9FF}]" src/` to enumerate. Likely ClientDetailPanel only (Subplan 3 era), but verify.

---

## 5. shadcnblocks pilot install

### 5.1. Verify infra

- `components.json` should have `registries.@shadcnblocks` block. Confirm.
- `.env.local` should have `SHADCNBLOCKS_TOKEN=<key>` (per memory). Confirm exists; if not, prompt user.
- shadcn MCP — per memory, connected via `.mcp.json`. Useful for searching components but NOT required for install (CLI works standalone with API key).

### 5.2. Install commands

```bash
# Pilot block
npx shadcn add @shadcnblocks/application-shell7

# Base primitives for 6A
npx shadcn add @shadcnblocks/card
npx shadcn add @shadcnblocks/sheet
npx shadcn add @shadcnblocks/dialog
```

If `@shadcnblocks/<name>` not found (Premium content not включает указанный block) — **fallback to base shadcn registry**: `npx shadcn@latest add card sheet dialog`. Document fallback inline.

### 5.3. Verify

- Files appear в `src/components/ui/` (or wherever components.json `aliases.ui` points).
- `npx vite build` succeeds (newly installed components compile clean).
- No unused-import warnings (they're not yet imported anywhere).

### 5.4. **DO NOT** integrate в pages

Stage explicitly forbids editing existing pages to use installed components. They live as scaffolded reference for Subplan 6A.

---

## 6. Тестирование

### 6.1. Existing tests

All 173 unit tests must continue passing — Subplan 6 changes are surface-only (tokens + icons + scaffolded files), no logic touched.

### 6.2. Optional `src/lib/icons.test.js`

If `src/lib/icons.js` introduced — smoke test:

```js
import * as Icons from './icons'
test('central icon re-exports', () => {
  expect(Icons.Pencil).toBeDefined()
  expect(Icons.Close).toBeDefined()
  // ... 5-7 spot checks
})
```

Skip if direct imports preferred (D-7).

### 6.3. Visual smoke (preview server)

After each stage:
- **Tokens stage**: open `/clients` (largest CSS surface). Verify primary blue, fg-scale text colors, surface bg's render. No broken cascade.
- **Iconography stage**: open `/clients`, `/teams`, `/tasks`, `/dashboard`. Check icon-buttons render (Pencil, X, Chevron, Download, etc.). Open lightbox — close button works. Open slide-out — focus rings visible.
- **shadcnblocks pilot**: `npx vite build` clean. Optionally render installed component standalone in a scratch page just to visually verify it loads (not required).

### 6.4. What NOT to test

- Pixel-perfect comparison with DS preview HTML (deferred to 6A).
- Mobile breakpoint (no shell change).
- E2E flows (no behavior change).

---

## 7. Migration / Stage order

Subplan 6 is small — **3 stages**:

| Stage | What |
|---|---|
| **1** | Token apply: extend `src/index.css` with all DS tokens, add dark-mode overrides, extend `@theme inline` aliases. Visual smoke through 4 pages. |
| **2** | Iconography sweep: ~20 component files modified, ~25 unique icon types swept. Optional `src/lib/icons.js`. Emoji fix in DashboardPage / ClientDetailPanel / LoginPage. Visual smoke. |
| **3** | shadcnblocks pilot install: verify infra, install application-shell7 + 3 primitives. Build verify. No page changes. |

No DB migrations. No new RPCs. No new hooks.

---

## 8. Acceptance criteria

After all 3 stages:

- `src/index.css` contains all DS tokens from `colors_and_type.css` (verify by diff).
- Zero custom inline `function XxxIcon()` definitions in `src/components/`.
- Zero emoji in production code (`grep -rE "[\u{1F300}-\u{1F9FF}]" src/` → empty).
- `lucide-react` imports in all swept components.
- `src/components/ui/application-shell7/` (or wherever) exists with installed files.
- 3 primitives (Card, Sheet, Dialog) installed.
- `npm test` — 173/173 passes.
- `npx vite build` — clean (only pre-existing chunk-size warning).
- Visual smoke through 4 pages: layout unchanged, icons render, colors unchanged or improved.

---

## 9. Файлы для контекста

При начале plan'а / implementation'а:

- `docs/design-system/colors_and_type.css` — source of truth tokens.
- `docs/design-system/README.md` — full DS spec (palette, type, layout, components, iconography rules).
- `docs/design-system/SKILL.md` — design system skill manifest.
- `docs/superpowers/specs/2026-04-26-crm-subplan-6-design-system-foundation-design.md` (этот файл).
- Existing `src/index.css` — current token state (post-Stage 8 of Subplans 3-5).
- Existing components в `src/components/{clients,teams,tasks,staff}/` — список target files для iconography sweep.
- `components.json` — shadcn config (registries, aliases).
- `.env.local` — `SHADCNBLOCKS_TOKEN`.
