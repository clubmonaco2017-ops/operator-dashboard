// eslint-disable-next-line react-refresh/only-export-components
export const EMPTY_CONTACT = { name: '', phone: '', email: '', telegram: '', role: '' }

function AgencyContactsFields({ contacts, onChange, disabled = false }) {
  const update = (i, field, value) => {
    const next = contacts.map((c, j) => j === i ? { ...c, [field]: value } : c)
    onChange(next)
  }
  const add = () => onChange([...contacts, { ...EMPTY_CONTACT }])
  const remove = (i) => onChange(contacts.filter((_, j) => j !== i))

  return (
    <div>
      <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 uppercase tracking-wide">
        Контакты менеджеров
      </p>
      <div className="space-y-3">
        {contacts.map((c, i) => (
          <div key={i} className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2 relative">
            {contacts.length > 1 && (
              <button
                type="button"
                onClick={() => remove(i)}
                disabled={disabled}
                className="absolute top-2 right-2 text-slate-300 hover:text-red-500 transition-colors disabled:opacity-50"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            )}
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="Имя" value={c.name || ''} onChange={e => update(i, 'name', e.target.value)} disabled={disabled}
                className="border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 placeholder-slate-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50" />
              <input placeholder="Должность" value={c.role || ''} onChange={e => update(i, 'role', e.target.value)} disabled={disabled}
                className="border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 placeholder-slate-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="Телефон" value={c.phone || ''} onChange={e => update(i, 'phone', e.target.value)} disabled={disabled}
                className="border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 placeholder-slate-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50" />
              <input placeholder="Email" value={c.email || ''} onChange={e => update(i, 'email', e.target.value)} disabled={disabled}
                className="border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 placeholder-slate-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50" />
            </div>
            <input placeholder="Telegram (@username)" value={c.telegram || ''} onChange={e => update(i, 'telegram', e.target.value)} disabled={disabled}
              className="border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 placeholder-slate-400 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50" />
          </div>
        ))}
      </div>
      <button type="button" onClick={add} disabled={disabled}
        className="mt-2 text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 font-medium flex items-center gap-1 disabled:opacity-50">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-3.5 h-3.5">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        Добавить контакт
      </button>
    </div>
  )
}

export default AgencyContactsFields
