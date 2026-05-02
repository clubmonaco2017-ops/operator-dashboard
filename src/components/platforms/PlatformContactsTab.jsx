import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Loader2, Plus, X } from 'lucide-react'
import { platformApi } from '../../lib/platforms.js'
import { Button } from '@/components/ui/button'

const EMPTY_CONTACT = { name: '', role: '', phone: '', email: '', telegram: '' }

const isContactEmpty = (c) =>
  !c.name && !c.role && !c.phone && !c.email && !c.telegram

const initialFor = (p) => {
  const arr = Array.isArray(p?.contacts) ? p.contacts : []
  return arr.length ? arr.map((c) => ({ ...EMPTY_CONTACT, ...c })) : [{ ...EMPTY_CONTACT }]
}

export function PlatformContactsTab() {
  const { platform, reload } = useOutletContext()
  const [contacts, setContacts] = useState(() => initialFor(platform))
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setContacts(initialFor(platform))
    setDirty(false)
    setError(null)
  }, [platform.id])

  const updateAt = (i, patch) => {
    setContacts((curr) => curr.map((c, j) => (j === i ? { ...c, ...patch } : c)))
    setDirty(true)
  }

  const add = () => {
    setContacts((curr) => [...curr, { ...EMPTY_CONTACT }])
    setDirty(true)
  }

  const removeAt = (i) => {
    setContacts((curr) => curr.filter((_, j) => j !== i))
    setDirty(true)
  }

  const cancel = () => {
    setContacts(initialFor(platform))
    setDirty(false)
    setError(null)
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    const cleaned = contacts.filter((c) => !isContactEmpty(c))
    // REST update требует full payload; branding + name берём unchanged.
    const { error: err } = await platformApi('update', {
      id: platform.id,
      name: platform.name,
      contacts: cleaned,
      logo_url: platform.logo_url ?? null,
      access_login: platform.access_login ?? null,
      access_password: platform.access_password ?? null,
      notes: platform.notes ?? null,
    })
    setSaving(false)
    if (err) {
      setError(err.message ?? String(err))
      return
    }
    setDirty(false)
    reload?.()
  }

  const onKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') save()
  }

  return (
    <div className="max-w-2xl space-y-4" onKeyDown={onKeyDown}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Контакты менеджеров
      </p>

      <div className="space-y-3">
        {contacts.map((c, i) => (
          <div
            key={i}
            className="relative rounded-lg border border-border bg-card p-4 space-y-2"
          >
            {contacts.length > 1 && (
              <button
                type="button"
                onClick={() => removeAt(i)}
                disabled={saving}
                aria-label="Удалить контакт"
                className="absolute right-2 top-2 text-muted-foreground hover:text-destructive disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <div className="grid grid-cols-2 gap-2">
              <input
                placeholder="Имя"
                value={c.name}
                onChange={(e) => updateAt(i, { name: e.target.value })}
                disabled={saving}
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                placeholder="Должность"
                value={c.role}
                onChange={(e) => updateAt(i, { role: e.target.value })}
                disabled={saving}
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                placeholder="Телефон"
                value={c.phone}
                onChange={(e) => updateAt(i, { phone: e.target.value })}
                disabled={saving}
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                placeholder="Email"
                type="email"
                value={c.email}
                onChange={(e) => updateAt(i, { email: e.target.value })}
                disabled={saving}
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <input
              placeholder="Telegram (@username)"
              value={c.telegram}
              onChange={(e) => updateAt(i, { telegram: e.target.value })}
              disabled={saving}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        ))}
      </div>

      <Button variant="ghost" size="sm" onClick={add} disabled={saving}>
        <Plus className="mr-1 h-3.5 w-3.5" />
        Добавить контакт
      </Button>

      {error && (
        <p className="text-sm text-destructive break-words" role="alert">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={cancel} disabled={!dirty || saving}>
          Отменить
        </Button>
        <Button onClick={save} disabled={!dirty || saving}>
          {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          {saving ? 'Сохранение…' : 'Сохранить'}
        </Button>
      </div>
    </div>
  )
}
