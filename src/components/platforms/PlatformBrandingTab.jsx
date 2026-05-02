import { useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Eye, EyeOff, ImagePlus, Loader2 } from 'lucide-react'
import { platformApi } from '../../lib/platforms.js'
import { adminFetch } from '../../lib/adminFetch.js'
import { Button } from '@/components/ui/button'

async function uploadLogo(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = reader.result.split(',')[1]
      const { data, error } = await adminFetch('/api/admin/upload-logo', {
        file: base64,
        filename: file.name,
        content_type: file.type,
      })
      if (error) reject(new Error(error.message || 'Upload failed'))
      else resolve(data.url)
    }
    reader.onerror = () => reject(new Error('File read error'))
    reader.readAsDataURL(file)
  })
}

const initialFor = (p) => ({
  logo_url: p?.logo_url ?? '',
  access_login: p?.access_login ?? '',
  access_password: p?.access_password ?? '',
  notes: p?.notes ?? '',
})

export function PlatformBrandingTab() {
  const { platform, reload } = useOutletContext()
  const [form, setForm] = useState(() => initialFor(platform))
  const [dirty, setDirty] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    setForm(initialFor(platform))
    setDirty(false)
    setError(null)
  }, [platform.id])

  const update = (patch) => {
    setForm((f) => ({ ...f, ...patch }))
    setDirty(true)
  }

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const url = await uploadLogo(file)
      update({ logo_url: url })
    } catch (err) {
      setError(err.message)
    }
    setUploading(false)
  }

  const cancel = () => {
    setForm(initialFor(platform))
    setDirty(false)
    setError(null)
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    // REST update требует full payload; contacts + name берём unchanged из platform.
    const { error: err } = await platformApi('update', {
      id: platform.id,
      name: platform.name,
      contacts: platform.contacts ?? [],
      logo_url: form.logo_url || null,
      access_login: form.access_login || null,
      access_password: form.access_password || null,
      notes: form.notes || null,
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
    <div className="max-w-2xl space-y-6" onKeyDown={onKeyDown}>
      {/* Logo */}
      <section>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Логотип
        </p>
        <div className="flex items-center gap-3">
          {form.logo_url ? (
            <img
              src={form.logo_url}
              alt=""
              className="h-12 max-w-24 rounded-lg border border-border object-contain"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <ImagePlus className="h-5 w-5" aria-hidden="true" />
            </div>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || saving}
          >
            {uploading && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            {uploading ? 'Загрузка…' : 'Выбрать файл'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => {
              handleLogoUpload(e)
              e.target.value = ''
            }}
            className="hidden"
            disabled={uploading || saving}
          />
        </div>
      </section>

      {/* Access */}
      <section>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Доступ к платформе
        </p>
        <div className="space-y-2">
          <label className="block">
            <span className="block mb-1 text-sm font-medium">Логин</span>
            <input
              type="text"
              value={form.access_login}
              onChange={(e) => update({ access_login: e.target.value })}
              disabled={saving}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="block">
            <span className="block mb-1 text-sm font-medium">Пароль</span>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.access_password}
                onChange={(e) => update({ access_password: e.target.value })}
                disabled={saving}
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                disabled={saving}
                aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>
        </div>
      </section>

      {/* Notes */}
      <section>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Заметки
        </p>
        <label className="block">
          <span className="sr-only">Заметки</span>
          <textarea
            value={form.notes}
            onChange={(e) => update({ notes: e.target.value })}
            rows={4}
            disabled={saving}
            placeholder="Дополнительная информация"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
      </section>

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
