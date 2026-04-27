# CRM Subplan 6A4 — ClientList master-layer repaint · Design Spec

**Status:** Brainstormed · approved decisions · spec ready for user review.
**Author:** Claude Code (Opus 4.7) + Artem.
**Date:** 2026-04-27.
**Implements:** Domain model §8 row 6 (design-system rollout) — fourth tier. Visual repaint of ClientList master-pane components per «utility-class sweep + visual repaint» deferral from Subplan 6A3 spec §1.

**Builds on:**
- [Subplan 6 Foundation spec](2026-04-26-crm-subplan-6-design-system-foundation-design.md) — DS tokens, lucide sweep, shadcn primitives installed (incl. `<Button>`).
- [Subplan 6A Shell Rebuild spec](2026-04-26-crm-subplan-6a-shell-rebuild-design.md) — ClientListPage moved into MasterDetailLayout.
- [Subplan 6A2 Handoff Cleanup spec](2026-04-26-crm-subplan-6a2-handoff-cleanup-design.md) — `.focus-ds` swept across all client components; `<SearchInput>` extracted; outlet context unified to `{rows, reload}`.
- [Subplan 6A3 Dashboard Rewrite spec](2026-04-26-crm-subplan-6a3-dashboard-rewrite-design.md) — established «pure token swap, no redesign до Claude Design» pattern.

---

## 1. Goal & non-goals

**Goal:** Заменить legacy utility-classes (`.btn-primary` ×5, `.btn-ghost` ×1) и legacy Tailwind-палитру (`bg-slate-300/400` ×2) в 9 файлах ClientList master layer на канонические DS-примитивы (shadcn `<Button>`) и DS tokens. Без визуальных изменений (pure token swap), без структурного refactor'а. Ship-it стратегия — короткая инфраструктурная PR, фундамент для дальнейших Subplans (6A5 Tasks, 6A6 Staff, 6A7 Teams когда DB починят).

**В scope (9 файлов):**

- `src/pages/ClientListPage.jsx` — 1 swap (`.btn-primary` на «+ Новый»)
- `src/components/clients/EmptyFilter.jsx` — 3 swap (`.btn-primary` ×2, `.btn-ghost` ×1)
- `src/components/clients/EmptyZero.jsx` — 1 swap (`.btn-primary` на CTA)
- `src/components/clients/ClientFilterChips.jsx` — 2 swap (`bg-slate-300/400` → DS tokens)
- `src/components/clients/ClientList.jsx` — verify only (already DS-clean)
- `src/components/clients/ClientListItem.jsx` — verify only (already DS-clean)
- `src/components/clients/BulkActionBar.jsx` — verify only (already DS-clean)
- `src/components/clients/DropOverlay.jsx` — verify only (already DS-clean)
- `src/components/clients/DetailEmptyHint.jsx` — verify only (already DS-clean)

Total: ~30-line diff across 4 actively-edited files + 5 verify-only files.

**Out of scope (deferred):**

- **`<ClientDetailPanel>` + 5 detail-tab components** (`ProfileTab` 448 LOC, `PhotoGalleryTab` 832 LOC, `VideoGalleryTab` 984 LOC, `ActivityCard` 140 LOC, `SummaryCard` 206 LOC) → отдельный subplan (6A4-bis или 6A4-detail). Deferred потому что repaint detail-вкладок включает рассмотрение layout/density вопросов, которые master-pane не затрагивают.
- **`<CreateClientSlideOut>`** (582 LOC) + `<CreateClientCloseConfirm>` + `<ArchiveConfirmDialog>` + `<ClientLightbox>` (430 LOC) → отдельно. Слайд-аут потенциально мигрирует на shadcn `<Sheet>`, что = архитектурное решение.
- **`.btn-primary`/`.btn-ghost`/`.btn-danger-ghost` определения в `src/index.css` НЕ удаляются** в этой PR. Используются в Tasks (~10 файлов), Teams (~10 файлов), Staff (~6 файлов). Удаление — финальный cleanup PR после 6A5/6A6/6A7 sweep'ов всех страниц.
- **`.label-caps` utility-class** (~20+ usages по всему проекту) — defer до Claude Design DS revamp. Нет канонической shadcn замены, helper полезный, transition state приемлем.
- **DS-переменные `var(--fg2/3/4)` / `var(--primary-soft)` / `var(--danger-*)`** — это уже DS tokens (project extension), оставляются как есть. Переосмысление — Claude Design pass.
- **Tasks/Teams/Staff/Notifications/LoginPage repaints** — отдельные subplan'ы (6A5+).
- **Visual upgrade / redesign** ClientListItem/ClientFilterChips/BulkActionBar layout, density, hover states — defer до Claude Design.
- **Mobile responsive** — Subplan 6B.

---

## 2. Decisions log

| # | Решение | Rationale |
|---|---|---|
| **D-1** | Pure token swap, no visual changes. | User-Q2=A. Memory note: «hardcoded Tailwind-классы разрешены до Claude Design». Big redesign сейчас = выкинутая работа после Claude Design pass. |
| **D-2** | shadcn `<Button>` (default / ghost variants) для замены `.btn-primary` / `.btn-ghost`. | User-Q3=A. Каноничный путь, согласован с Subplan 6 фундаментом. shadcn Button уже установлен (`src/components/ui/button.jsx`), поддерживает variants `default`/`ghost`/`destructive`/`outline`/`secondary`/`link` и sizes `xs`/`sm`/`default`/`lg`. |
| **D-3** | `var(--fg2/3/4)`, `var(--primary-soft/ink)`, `var(--danger-*)` остаются как есть. | Это DS tokens (project extension), не legacy. Сохраняются до Claude Design pass. |
| **D-4** | `.label-caps` defer до Claude Design. | 20+ usages по всему проекту, в scope 6A4 не встречается. Sweep потребовал бы трогать ~10 файлов вне scope. Нет канонической shadcn-замены. Pragmatic transition state. |
| **D-5** | `.btn-primary`/`.btn-ghost`/`.btn-danger-ghost` определения в `src/index.css` НЕ удаляются. | Используются в Tasks/Teams/Staff/AdminPanel. Удаление в этом PR сломает их визуально до 6A5/6A6/6A7. Финальная зачистка `index.css` — отдельная PR после всех page-sweep'ов. |
| **D-6** | Single commit (не stages). | ~30-line diff, mechanical, single risk profile. Atomic = легче review + rollback. |
| **D-7** | Visual smoke required, no new unit tests. | 0 existing unit-tests на 9 файлах. Repaint pure-визуальный — поведение не меняется. Verification — `/clients` route в browser (admin user) + 220/220 baseline tests still pass + lint clean + build clean. |

---

## 3. Concrete changes per file

Все изменения — exact `<button className="btn-X">` → `<Button variant="X">` swap. Никаких структурных правок, никаких prop reorganizations.

### 3.1. `src/pages/ClientListPage.jsx` (1 swap)

**Line 89** — «+ Новый» button trigger:

```diff
+import { Button } from '@/components/ui/button'
   ...
-<button onClick={() => navigate('/clients/new')} className="btn-primary text-xs px-2.5 py-1.5">
-  + Новый
-</button>
+<Button size="sm" onClick={() => navigate('/clients/new')}>
+  + Новый
+</Button>
```

`size="sm"` соответствует legacy `text-xs px-2.5 py-1.5`.

### 3.2. `src/components/clients/EmptyFilter.jsx` (3 swap)

**Lines 41 + 49** — два action buttons:

```diff
+import { Button } from '@/components/ui/button'
   ...
-<button type="button" onClick={onClearSearch} className="btn-primary">
-  Сбросить поиск
-</button>
+<Button onClick={onClearSearch}>
+  Сбросить поиск
+</Button>
   ...
-<button type="button" onClick={onClearAll} className={hasSearch ? 'btn-ghost' : 'btn-primary'}>
-  Сбросить все фильтры
-</button>
+<Button variant={hasSearch ? 'ghost' : 'default'} onClick={onClearAll}>
+  Сбросить все фильтры
+</Button>
```

(Implementer проверяет точные тексты кнопок и обработчики при реализации.)

### 3.3. `src/components/clients/EmptyZero.jsx` (1 swap)

**Line 24** — CTA «+ Создать клиента»:

```diff
+import { Button } from '@/components/ui/button'
   ...
-<button type="button" onClick={onCreate} className="btn-primary mt-5">
-  + Создать клиента
-</button>
+<Button onClick={onCreate} className="mt-5">
+  + Создать клиента
+</Button>
```

(`className="mt-5"` дополнительный prop — shadcn `<Button>` корректно мерджит через `cn()`.)

### 3.4. `src/components/clients/ClientFilterChips.jsx` (2 slate swap)

**Lines 36-38** — pre-flight: implementer читает контекст (что за элемент использует `bg-slate-300/400`). По grep'у — вероятно индикатор активности фильтра (active/inactive dot или toggle pill).

Pragmatic mapping:
- `bg-slate-300` (light/inactive state) → `bg-muted-foreground/30`
- `bg-slate-400` (active state) → `bg-muted-foreground`

**Если визуально не совпадёт после swap** — implementer дотюнит до пиксельного парити (например, `bg-muted-foreground/40` или `bg-border-strong`). Цель — same look.

### 3.5. Verify-only файлы (5)

Implementer проверяет, что в этих файлах нет regressions от других изменений в branch'е. Если grep подтверждает, что они уже DS-clean, никаких правок:

- `src/components/clients/ClientList.jsx` — только `var(--danger-ink)` для error state.
- `src/components/clients/ClientListItem.jsx` — `var(--fg2)` / `var(--fg4)`, `border-l-primary`, `bg-muted` (всё DS).
- `src/components/clients/BulkActionBar.jsx` — `var(--primary-soft)`, `var(--fg2)`, `var(--danger-soft)`, `var(--danger-ink)`, `border-border`, `bg-card`, `bg-muted` (всё DS).
- `src/components/clients/DropOverlay.jsx` — `var(--danger)`, `var(--danger-soft)`, `var(--primary-soft)`, `var(--primary-ink)` (всё DS).
- `src/components/clients/DetailEmptyHint.jsx` — `var(--fg4)`, `bg-muted` (всё DS).

---

## 4. Acceptance criteria

После merge'a:

- **Code:**
  - 5 instances `.btn-primary` swapped to shadcn `<Button>` (default или sm size).
  - 1 instance `.btn-ghost` swapped to `<Button variant="ghost">`.
  - 2 instances `bg-slate-300/400` swapped to DS tokens (`bg-muted-foreground/*` or equivalent).
  - `import { Button } from '@/components/ui/button'` добавлен в 3 файла (`ClientListPage.jsx`, `EmptyFilter.jsx`, `EmptyZero.jsx`).
  - 5 verify-only файлов unchanged.
  - `src/index.css` unchanged (`.btn-*` definitions stay для других страниц).

- **Tests / build:**
  - `npm test -- --run` — 220/220 passes (no test changes, regression guard).
  - `npm run lint` — no new warnings introduced by this branch.
  - `npx vite build` — clean (только pre-existing chunk-size warning).

- **Visual smoke** на `/clients` (admin user):
  - List renders with identical look to pre-change.
  - Filter chips work (active/inactive states visually consistent).
  - «+ Новый» button opens `<CreateClientSlideOut>`.
  - Empty filter state (after clearing search to no results): "Сбросить поиск" + "Сбросить все фильтры" buttons render и работают.
  - Empty zero state (когда нет клиентов): "+ Создать клиента" button renders и работает.
  - All buttons clickable, focus-visible работает (универсальный `:focus-visible` rule из Subplan 6 покрывает shadcn `<Button>`).
  - Light + dark mode visual parity.

- **Out-of-scope check:**
  - `src/index.css` `.btn-primary`/`.btn-ghost`/`.btn-danger-ghost` definitions присутствуют (не удалены).
  - Нет изменений в `src/components/clients/ClientDetailPanel.jsx`, `ProfileTab.jsx`, `PhotoGalleryTab.jsx`, `VideoGalleryTab.jsx`, `ActivityCard.jsx`, `SummaryCard.jsx`, `CreateClientSlideOut.jsx`, `ClientLightbox.jsx`, `CreateClientCloseConfirm.jsx`, `ArchiveConfirmDialog.jsx`.
  - Нет изменений в Tasks/Teams/Staff/Notifications/LoginPage.

---

## 5. Stages

Single commit (D-6). Branch `feat/subplan-6a4-clientlist-master-repaint` from `main`.

**Шаги implementer'а:**

1. Branch + verify baseline (220/220 tests, lint, build).
2. Edit `ClientListPage.jsx` (1 swap + import).
3. Edit `EmptyFilter.jsx` (2 swaps + import).
4. Edit `EmptyZero.jsx` (1 swap + import).
5. Edit `ClientFilterChips.jsx` (2 slate swaps after context check).
6. Verify 5 untouched files (grep confirm).
7. Run `npm test -- --run`, `npm run lint`, `npx vite build`.
8. Visual smoke `/clients` route (admin) — verify list, filters, empty states, buttons.
9. Commit + push + PR.

---

## 6. Файлы для контекста

При начале plan'а / implementation'а:

- This spec.
- [Subplan 6 Foundation spec](2026-04-26-crm-subplan-6-design-system-foundation-design.md) — DS tokens reference (variants list, `--fg2/3/4` definition).
- [Subplan 6A2 plan](../plans/2026-04-26-crm-subplan-6a2-handoff-cleanup.md) — execution patterns reference (mechanical sweep PR, similar shape).
- `src/components/ui/button.jsx` — shadcn `<Button>` API (variants/sizes/cva config).
- `src/index.css` — `.btn-primary`/`.btn-ghost` definitions (target-look reference; не удалять).
- 9 scope-файлов.
