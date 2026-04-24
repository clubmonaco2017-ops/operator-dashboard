# Design Inspiration

Папка для скриншотов и референсов, которые показывают, как мы **хотим** чтобы выглядел CRM. Материал отсюда уезжает в **Claude Design** (Set up design system) вместе с `docs/domain-model.md`.

---

## Как пользоваться

1. Увидел красивый CRM / dashboard / admin-panel в интернете → **скриншоть** (или сохрани картинку) → положи в соответствующую подпапку ниже.
2. Раз в несколько добавлений — открой `notes.md` и одной строкой припиши что именно понравилось в картинке (чтобы Claude Design не гадал).
3. Файлы **сжимай** перед добавлением (tinypng.com, squoosh.app) — PNG под 500 KB достаточно.
4. Именуй файлы так чтобы источник был очевиден: `linear-sidebar-dark.png`, `attio-contacts-table.png`, `notion-modal.png`.
5. Если источник приватный / внутренний — просто придумай имя.

---

## Структура папок

```
design-inspiration/
  README.md              ← этот файл
  notes.md               ← заметки «что нравится / не нравится» по каждому скрину
  layout/                ← общая структура страниц (sidebar, header, грид)
  color-typography/      ← палитры, шрифты, типографика
  interactions/          ← hover, модалки, dropdown, toasts, skeletons
  data-dense/            ← таблицы, списки, фильтры (под нашу CRM density)
  mobile/                ← мобильные скрины (важно: CRM mobile-first для /staff, /tasks)
  antipatterns/          ← что НЕ нравится (тоже полезно показать Claude Design)
```

Пустые подпапки помечены `.gitkeep`, добавь скрины — удаляй.

---

## Что мы ищем (для Claude Design)

- **Профессиональный тон**, не игривый. Целевая аудитория — внутренняя команда, работает с CRM каждый день.
- **Data-dense** экраны: таблицы с 20+ колонками, списки с фильтрами, карточки с метриками. Приоритет — плотность информации, а не просторные hero-blocks.
- **Dark mode обязателен.** Важно для всех экранов, не только декоративный вариант.
- **Mobile responsive.** Staff и Tasks экраны регулярно открываются с телефона; Dashboard и Admin — обычно с ПК.
- **Быстрые интеракции.** Клавишные шорткаты, inline-edit, быстрые переходы между связанными сущностями.

---

## Хорошие стартовые источники

Если своих референсов пока мало — можно стащить оттуда:

**CRM / Admin / ERP:**
- [Attio](https://attio.com) — relational CRM, отличные таблицы и цветовые палитры
- [Pipedrive](https://www.pipedrive.com/) — data-dense классика
- [Folk](https://folk.app/) — молодая CRM, современный визуал

**SaaS общего плана:**
- [Linear](https://linear.app) — эталон dense UI + сочетание light/dark
- [Vercel](https://vercel.com) — сдержанная типографика, моно-акценты
- [Railway](https://railway.app) — хороший sidebar, плотные таблицы

**Компоненты:**
- [shadcn/ui](https://ui.shadcn.com/) — наша базовая библиотека; скрины Charts / Tables / Forms из shadcn оттуда же
- [Once UI](https://once-ui.com/) — альтернативная коллекция вдохновения

**Мобильное:**
- [Height](https://height.app) — task manager, ок mobile layout
- [Superhuman](https://superhuman.com) — минимализм, keyboard-first

---

## Шаблон для `notes.md`

Когда добавляешь скриншот, припиши в `notes.md`:

```
## layout/attio-contacts-table.png
Источник: attio.com (CRM-таблица)
Нравится: density, скрытая цветная метка статуса в конце строки, sticky header
Не нравится: слишком ярко-зелёный акцент
Взять: layout sidebar + main, плотность строк, скрытые действия при hover
```

Формат свободный, но полезно различать «нравится / не нравится / что хотим взять».

---

## Что потом

1. Когда накопилось 10–20 референсов + `notes.md` заполнен — запускаешь Claude Design → **Set up design system**.
2. В полях интерфейса:
   - Company name / blurb: см. раздел «Как заполнить Claude Design» в PR #15 (или спроси меня)
   - Link code from your computer: тащишь папку `operator-dashboard/` целиком (Claude Design заберёт `src/` + `docs/`)
   - Add fonts, logos and assets: сюда те же скриншоты (дублирование ок, так Claude точно заметит)
   - Any other notes: ссылка на `docs/domain-model.md` + ссылка на `docs/design-inspiration/notes.md`
3. Claude Design выдаст: design tokens, типографику, базовые компоненты, примеры экранов.
4. Возвращаемся сюда → Subplan 6 (применение дизайн-системы).
