# Icon Mapping - Domain → Lucide

Library: [Lucide](https://lucide.dev/) 0.460.0, 2px stroke, 24×24 viewBox, rendered at 16/20/24px.

## Navigation
| Nav item | Lucide name |
|---|---|
| Дашборд | `layout-dashboard` |
| Сотрудники | `users` |
| Клиенты (модели) | `user-round` |
| Команды | `users-round` |
| Задачи | `list-checks` |
| Отчёты | `file-text` |
| Оповещения | `bell` |
| Чат | `message-square` |
| Настройки | `settings-2` |
| Выйти | `log-out` |

## Roles
| Role | Lucide name |
|---|---|
| Superadmin | `shield` |
| Admin | `shield-check` |
| Teamlead | `crown` |
| Moderator | `user-cog` |
| Operator | `headphones` |

## Statuses
| Status | Lucide name | Color token |
|---|---|---|
| Pending | `circle` | `--status-pending` |
| In progress | `circle-dashed` | `--status-in-progress` |
| Done | `circle-check` | `--status-done` |
| Overdue | `circle-alert` | `--status-overdue` |
| Active | `circle-dot` (filled) | `--success` |
| Inactive | `circle-slash` | `--fg4` |

## Actions
| Action | Lucide name |
|---|---|
| Create / add | `plus` |
| Edit | `pencil` |
| Delete | `trash-2` |
| Deactivate | `user-x` |
| Filter | `sliders-horizontal` |
| Search | `search` |
| Sort | `arrow-down-up` |
| Copy ref-code | `copy` |
| Expand / collapse | `chevron-down` |
| Open slide-out | `panel-right-open` |
| Close | `x` |
| Command palette | `command` |
| Keyboard shortcut | `keyboard` |
| Drag handle | `grip-vertical` |
| More (three-dot) | `more-horizontal` |

## Media / empty states
| Usage | Lucide name |
|---|---|
| Empty inbox (initial) | `inbox` |
| Empty filter | `filter-x` |
| Empty selection | `mouse-pointer-square-dashed` |
| Error | `triangle-alert` |
| Loading | Skeleton blocks, no icon |
| Photo gallery | `image` |
| Video | `video` |
| Upload | `upload-cloud` |

## Usage (CDN, standalone HTML)
```html
<script src="https://unpkg.com/lucide@0.460.0/dist/umd/lucide.min.js"></script>
<i data-lucide="users"></i>
<script>lucide.createIcons();</script>
```

## Usage (React, in codebase)
```jsx
import { Users } from 'lucide-react';
<Users className="w-4 h-4" />
```

**No emoji.** The emoji currently in `src/pages/DashboardPage.jsx` (📊 🥇 etc.) are legacy; replace with the mapping above.
