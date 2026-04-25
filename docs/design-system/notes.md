# Design System — drift и TODO

Локальные заметки по тому, где DS-токены или правила требуют корректировки. Эти правки применяем **в Subplan 6** (полное приведение проекта к DS), не сейчас.

## Issues

### `--primary-soft-2` слишком насыщенный
*Обнаружено: 2026-04-25 (брейнсторм Subplan 3, прототип Clients в Claude Design)*

Текущие значения:
```css
:root  --primary-soft-2: oklch(0.84 0.11 253);   /* light, chroma 0.11 */
.dark  --primary-soft-2: oklch(0.36 0.13 260);   /* dark,  chroma 0.13 */
```

Проблема: между `--primary-soft` (chroma 0.038) и `--primary-soft-2` (chroma 0.11) скачок в ~3×. В active-chips, badge'ах и filter-pill'ах это даёт «громкий» голубой, не подходящий density-CRM. Attio/Intercom (наши refs) используют active-state с chroma ~0.04-0.05.

Предлагаемое значение в Subplan 6:
```css
:root  --primary-soft-2: oklch(0.92 0.05 253);   /* light, chroma 0.05 */
.dark  --primary-soft-2: oklch(0.32 0.07 260);   /* dark,  chroma 0.07 */
```

Где встречается в проекте: пока нигде в коде (DS токены не используются — только что применили в Subplan 3 предварительно). К моменту Subplan 6 могут появиться места — пройти grep по `primary-soft-2` и проверить.

### Использование `--primary-soft-2` ограничить
В Subplan 6 при имплементации компонентов **не использовать** `--primary-soft-2` для:
- Active filter chips (использовать `--primary-soft` + 1px border `--primary`)
- Active tab counters (использовать `--surface-3` + `--fg2`)
- Active sidebar nav (использовать `--surface-3` + icon color `--primary`)

Оставить `--primary-soft-2` только для пилюль данных (role-badge, shift-badge), где насыщенность оправдана.

---

## Принципы добавления в этот файл

Добавляем сюда, когда:
- Видим что DS-токен/правило не работает в реальном UI
- Хотим зафиксировать проблему, но **не править прямо сейчас** (вне scope текущего Subplan'а)
- Ожидаем что фикс сделаем в Subplan 6 (полная имплементация DS)

Каждая запись: дата обнаружения + контекст + текущее значение + предлагаемое + где встречается.
