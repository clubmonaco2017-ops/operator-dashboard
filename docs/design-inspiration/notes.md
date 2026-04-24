# Notes по референсам

Коротко, по каждому скрину: **что нравится**, **что не нравится**, **что взять**. Формат свободный — главное чтобы Claude Design понял намерение.

---

### layout/example-attio.png

Источник: attio.com (раздел Contacts)
Нравится: плотность строк, sticky header, скрытые действия при hover на строку
Не нравится: слишком ярко-зелёный цвет hover'а
Взять: layout `sidebar + main`, spacing между строками, приём «скрытые действия»

---

<!-- Добавляй свои записи ниже -->

### layout/intercom-inbox-dashboard.png

Источник: Intercom inbox (из Mobbin)
Нравится: двойная навигация (rail + sidebar), тёплая кремовая гамма, subtle drop-shadows на главных блоках, полупрозрачный alert-banner сверху, keyboard-подсказки в модалке Create new, collapsible-секции справа
Не нравится: — (пока всё ок)
Взять: 4-колоночный layout (rail + sidebar + list + detail), avatar colors для быстрого различения записей, top-alert pattern, ⌘K quick create modal

---

### interactions/intercom-slideout-detail.png

Источник: Intercom inbox → открытая conversation (из Mobbin)
Нравится: slide-out detail panel вместо routed page, центральная колонка сохраняется, collapsible attributes справа, compose area внизу с ⌘K и AI-молнией
Не нравится: — (разве что может быть на маленьких экранах тесно)
Взять: responsive master-detail pattern для /staff, /clients, /tasks; URL-state (?id=...) вместо route change; стрелки ↑↓ для навигации между записями

---

### data-dense/intercom-reports-dashboard.png

Источник: Intercom Reports → Conversations dashboard (из Mobbin)
Нравится: палитра всего 3 цвета (blue/amber/grey) консистентна на всех графиках; date-range pill; + Add filter inline; timezone pill; info-icons с tooltip на title каждой карточки; grid 2×2 charts; sidebar с collapsible папками отчётов
Не нравится: нет KPI-карточек (больших чисел) — нам они нужны
Взять: ограниченную палитру для графиков; pill-based фильтры (date + timezone + add filter); info-icons на метриках; grid-of-cards layout; shareable dashboard paradigm

---

### interactions/chatbase-empty-state-dual.png

Источник: Chatbase → Chat logs (из Mobbin)
Нравится: два empty state одновременно (filter empty в списке + selection empty в detail); нейтральная иконка-bubble (не грустная); полезное описание с подсказкой действия
Не нравится: центральный empty state мог бы иметь кнопку "Сбросить фильтры"
Взять: классификация empty states по 5 типам; для master-detail layout — всегда 2 empty state (list + detail); тематические нейтральные иконки; описания с call-to-action

---

### interactions/attio-initial-empty-add-column.png

Источник: Attio → Companies + modal "Create column" (из Mobbin)
Нравится: subtle icon в кружке, точный текст CTA «+ Add Attribute Column», модалка с keyboard shortcuts в кнопках [ESC]/[↵], checkbox «Create more» для bulk-создания
Взять: рецепт initial empty state (icon + title + 1-line hint + primary blue CTA); паттерн модалки с shortcuts + Create more; глагол-specific CTA

---

### interactions/attio-initial-empty-email-templates.png

Источник: Attio → Emails → Templates (из Mobbin)
Нравится: композитная иллюстрация (envelope → dashed line → cube) показывает flow; много white space; CTA с иконкой + глаголом
Взять: flow-illustration для разделов со связанными сущностями (модель↔оператор, задача↔отчёт); позитивный/нейтральный tone

---

### data-dense/attio-table-with-filters.png

Источник: Attio → Companies table (из Mobbin)
Нравится: filter chips сверху (только активные, с three-dot edit, + для добавления); multi-tag в одной ячейке; coloured dot + label для статусов; relative dates; footer с Add calculation; toast слева внизу; keyboard hint ⌘K и /
Не нравится: нет avatar'ов (логотипы вместо людей — у нас нужно людей); нет visual density controls; нет inline-edit в ячейках из коробки
Взять: filter-chips builder как переиспользуемый компонент дизайн-системы; calculation-row паттерн; sparkle-icon на AI-enriched колонках; muted empty cells вместо пустоты; 3-level sidebar (Favorites + Records + Lists)

---

### layout/attio-record-detail-page.png

Источник: Attio → Company record detail (sweetgreen) (из Mobbin)
Нравится: счётчики на табах (серые 0, чёрные >0); right panel с collapsible секциями (Details + Lists + Comments); meta-chips под title (assignee + last activity); toast «Record added successfully» внизу справа
Не нравится: — всё ок
Взять: tabs-со-счётчиками паттерн ОБЯЗАТЕЛЬНО; right panel не зависит от активного таба; collapsible секции (Record Details, Lists/Relations, Activity); toast для success/error; comments tab в side panel (держать как future, не ломать архитектуру)

### layout/autosend-dashboard-stats.png

Источник: Autosend Dashboard (из Mobbin)
Нравится: цветные dash-маркеры категорий в sidebar; унифицированный паттерн «section caps-label → card»; KPI grid 4×2 с цветными dots + info-icon + big number; metrics-row inline (7 колонок) для карточки объекта; технический типографский tone (caps + letter-spacing, Geist-like font); dark pill-buttons
Не нравится: нет графиков, нет dark mode на этом скрине, мало цвета для большого количества статусов
Взять: section-card паттерн; KPI-card компонент с dot+label+value+info; metrics-row компонент; sidebar category markers; technical typography tone (совпадает с нашим Geist)

### data-dense/\*-gallery.png (3 скрина: Pinterest, Spline, Dribbble)

Источник: Pinterest / Spline community / Dribbble (все из Mobbin)
Сравнение подходов:

- Pinterest masonry — хорошо для разных aspect ratios, но «скачет» при скролле
- Spline grid (dark) — одинаковый aspect + meta под карточкой
- Dribbble grid (light) — 16:9 + meta-row, строго organized
  Для нашего use case (галерея модели) — ГИБРИД: grid 4:5 aspect (portrait), object-fit cover, без meta под карточкой, hover overlay с action-icons, video-duration в углу как Pinterest, tabs Фото/Видео/Аватар сверху
  Обязательно в ТЗ: lightbox с ← → и thumbnail-strip; drag-and-drop upload + reorder; direct upload в Supabase Storage для больших видео

### layout/shadcnblocks-dashboard16

Источник: https://www.shadcnblocks.com/preview/dashboard16 (Grandview Hospitality Suite)
Нравится: app-shell (sidebar + main + правая колонка «Latest Updates»); data-dense карточки-метрики с микро-барчартами (occupied/available под цифрой); плотная таблица «Recent Arrivals» снизу; сдержанная типографика; акцентный синий только на ключевой метрике бара (остальные — muted pastel)
Не нравится: hero-приветствие «Hello, Robert 👋» — для внутренней CRM можно суше без эмодзи; розовые/лавандовые бары — под нашу палитру заменить на blue/neutral
Взять: структуру app-shell с третьей колонкой-activity-feed (Latest Updates); паттерн KPI-карточки «метрика + mini bar chart + подпись occupied/available»; таблицу arrivals как референс для Tasks/Bookings listing; приём «акцентный цвет только на одном элементе графика» для фокуса внимания

---

### layout/shadcnblocks-application-shell7

Источник: https://www.shadcnblocks.com/preview/application-shell7 (Threads / Following)
Нравится desktop: три колонки (узкий icon-rail + секционная навигация + main + правая participants/activity panel), секции «Threads / Highlights / Preferences» с разделителями, счётчик «3» у Mentions, статус-дот у аватаров
Нравится mobile: bottom-sheet навигация с drag handle вместо бургер-меню, крупный заголовок раздела, таб-бар снизу с 5 иконками, жестовое управление как в нативном приложении
Взять: desktop three-pane layout для Client/Booking detail (list + detail + activity), мобильный паттерн bottom-sheet drawer + bottom tab-bar для Staff/Tasks экранов, отображение presence-статуса через цветную точку на аватаре
Как реализовать жесты (для будущего UI-подплана): `vaul` (Drawer от emilkowalski, уже ориентированный на мобильные bottom-sheet c drag handle и snap points) + Framer Motion для доборных transitions (swipe между табами, pull-to-refresh, swipe-to-dismiss карточек). Оба уже совместимы с shadcn/ui и React 19.
