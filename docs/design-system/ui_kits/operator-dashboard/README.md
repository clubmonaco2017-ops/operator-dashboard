# Operator Dashboard - UI Kit

Interactive click-through of the core staff master-detail screen.

## What's here
- `index.html` - single-file desktop prototype (three-pane shell) + responsive mobile fallback (tab-bar). Everything is inline (CSS + JS) for zero build.

## Screens covered
- **Staff list** (`/staff`) - list pane with filter chips (role), search (`/`), virtualized row list, hover reveal, selected state.
- **Staff detail** (`/staff/:refCode`) - hero (avatar + role + status + ref-code + meta), tabs (Профиль / Атрибуты / Права / Активность), right activity panel.
- **Mobile** - collapses to single-pane with bottom tab-bar; rail and list auto-hide below 900px.

## Patterns demonstrated
- Three-pane desktop shell (rail 56 + list 360 + detail fluid)
- Master-detail in one view (no route change; list survives detail open)
- Filter-chips with live counts
- `/` keyboard shortcut focuses search
- Caps-label + letter-spacing technical tone
- Role-colored dot + ref-code mono chip
- Toggle with spring easing (permissions tab)
- Right activity panel (Attio record-detail pattern)
- Inline-editable KV grid
- Empty state for unselected detail

## Intentionally out of scope
- Real data / backend - all data is hardcoded in `STAFF`, `PERMS`, `EVENTS`.
- Create-staff form, password-change modal, delete-request flow - wired buttons only.
- Clients, Teams, Tasks, Notifications screens - next kit.
- Light-mode - toggle mechanism exists (remove `class="dark"` from `<body>`) but this kit defaults to dark per product guidance.

## How to extend
Drop more rails/tabs into `index.html` or copy individual blocks (`.rail`, `.list`, `.hero`, `.tabs`, `.perm-row`) into your prototype - they all read from `colors_and_type.css`.
