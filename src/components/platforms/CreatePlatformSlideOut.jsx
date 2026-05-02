import { useRef, useState } from 'react'
import { ImagePlus, Loader2 } from 'lucide-react'
import { platformApi } from '../../lib/platforms.js'
import { adminFetch } from '../../lib/adminFetch.js'
import { ResponsiveSlideOut } from '@/components/ui/responsive-slide-out'
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

export function CreatePlatformSlideOut({ onClose, onCreated }) {
  const [name, setName] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)

  const canSubmit = name.trim().length > 0 && !submitting

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const url = await uploadLogo(file)
      setLogoUrl(url)
    } catch (err) {
      setError(err.message)
    }
    setUploading(false)
  }

  const submit = async (e) => {
    e?.preventDefault?.()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    const { data, error: err } = await platformApi('create', {
      name: name.trim(),
      logo_url: logoUrl || null,
      contacts: [],
      access_login: null,
      access_password: null,
      notes: null,
    })
    setSubmitting(false)
    if (err) {
      setError(err.message ?? String(err))
      return
    }
    onCreated(data?.id)
  }

  const onKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit(e)
  }

  return (
    <ResponsiveSlideOut
      open
      onOpenChange={(next) => !next && onClose()}
      title="Новая платформа"
      desktopWidth="sm:max-w-md"
      onKeyDown={onKeyDown}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Отменить
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {submitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {submitting ? 'Создаём…' : 'Создать'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="block mb-1 text-sm font-medium">Название</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>

        <div>
          <span className="block mb-1 text-sm font-medium">Логотип (опционально)</span>
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <img
                src={logoUrl}
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
              disabled={uploading || submitting}
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
              disabled={uploading || submitting}
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive break-words" role="alert">
            {error}
          </p>
        )}
      </form>
    </ResponsiveSlideOut>
  )
}
