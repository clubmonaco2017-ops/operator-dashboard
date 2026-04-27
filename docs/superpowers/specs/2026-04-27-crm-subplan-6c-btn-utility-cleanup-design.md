# CRM Subplan 6C — `.btn-*` utility-class cleanup · Design Spec

**Status:** Brainstormed · approved · spec ready for user review.
**Author:** Claude Code (Opus 4.7) + Artem.
**Date:** 2026-04-27.
**Implements:** Domain model §8 row 6 (design-system rollout) — final CSS cleanup. Removes the now-unreferenced `.btn-primary` / `.btn-ghost` / `.btn-danger-ghost` utility classes from `src/index.css`.

**Builds on:**
- [Subplan 6B4 Clients sub-components spec](2026-04-27-crm-subplan-6b4-clients-subcomponents-sweep-design.md) — closing PR audit confirmed zero `.btn-*` consumers in production code outside `src/index.css`.

---

## 1. Goal & non-goals

**Goal:** Удалить определения трёх legacy-utility-классов (`.btn-primary`, `.btn-ghost`, `.btn-danger-ghost`) из `src/index.css`. Family C sweep полностью закрыт; ни один production-файл больше не ссылается на эти классы (verified `grep -rnE "\bbtn-(primary|ghost|danger-ghost)\b" src --include='*.jsx'` returns empty).

**В scope (1 файл):**
- `src/index.css` — удалить блок `/* --- Buttons (DS tokens) --- */` плюс 3 class определения (приблизительно строки 422-477, ~55 LOC включая декларации `:hover` / `:focus-visible` / `:disabled` для каждого класса).

**Out of scope:**
- Другие utility-классы в `index.css` (`.surface-card`, `.label-caps`, etc.) — они ещё используются или имеют отдельные decommission-таймлайны.
- Визуальные изменения в компонентах — components уже используют shadcn `<Button>` везде, удаление неиспользуемого CSS не даёт visual diff.
- DS-tokens (`--primary`, `--primary-hover`, `--surface`, etc.) — они продолжают использоваться shadcn `<Button>` через `bg-primary`, `text-primary-foreground` и т.д.

---

## 2. File-level diff summary

**Modified (1):** `src/index.css` — `~55 line removal`.
**Created / Deleted:** none.

**Estimated PR size:** ~55 lines deleted, ~0 inserted.

---

## 3. Pre-condition verification (must be true before starting)

Run before edit:
```bash
grep -rnE "\bbtn-(primary|ghost|danger-ghost)\b" src --include='*.jsx' --include='*.js'
```
Expected: empty (zero matches in production code). If non-empty, stop and sweep the remaining files first.

---

## 4. Acceptance criteria

- `npm run build` clean.
- `npm test -- --run` 235/235 still passing (no test changes; unused CSS removal cannot affect tests).
- Project-wide audit: `grep -rnE "\bbtn-(primary|ghost|danger-ghost)\b" src` returns **zero matches** (including `src/index.css`).
- Browser preview tour:
  - `/dashboard`, `/clients`, `/teams`, `/tasks`, `/staff`, `/notifications`, `/login` — all render without console errors.
  - At least one button visible on each page renders correctly via shadcn `<Button>`.
- No new lint warnings.

---

## 5. Implementation

Single-file edit + verification + commit + PR. The detailed plan is short enough to execute inline without a separate plan document.
