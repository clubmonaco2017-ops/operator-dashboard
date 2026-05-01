import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient.js'
import AgencyBrandingFields from './AgencyBrandingFields.jsx'
import AgencyContactsFields, { EMPTY_CONTACT } from './AgencyContactsFields.jsx'
import AgencyAdminAssignments from './AgencyAdminAssignments.jsx'

const initialBranding = {
  logo_url: '',
  access_login: '',
  access_password: '',
  notes: '',
}

export default function AgencyDetailPanel({ agencyId, onClose, onAfterSave }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [agency, setAgency] = useState(null)
  const [branding, setBranding] = useState(initialBranding)
  const [contacts, setContacts] = useState([{ ...EMPTY_CONTACT }])
  const [savingBranding, setSavingBranding] = useState(false)
  const [savingContacts, setSavingContacts] = useState(false)
  const [brandingDirty, setBrandingDirty] = useState(false)
  const [contactsDirty, setContactsDirty] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: e } = await supabase.rpc('get_agency_full', { p_id: agencyId })
    if (e) {
      setError(e.message)
      setLoading(false)
      return
    }
    if (!data || data.length === 0) {
      setError('Агентство не найдено')
      setAgency(null)
      setLoading(false)
      return
    }
    const r = data[0]
    setAgency({
      id: r.out_id,
      name: r.out_name,
      platform_id: r.out_platform_id,
      platform_name: r.out_platform_name,
      is_active: r.out_is_active,
      created_at: r.out_created_at,
    })
    setBranding({
      logo_url: r.out_logo_url || '',
      access_login: r.out_access_login || '',
      access_password: r.out_access_password || '',
      notes: r.out_notes || '',
    })
    const arr = Array.isArray(r.out_contacts) ? r.out_contacts : []
    setContacts(arr.length ? arr : [{ ...EMPTY_CONTACT }])
    setBrandingDirty(false)
    setContactsDirty(false)
    setLoading(false)
  }, [agencyId])

  useEffect(() => { load() }, [load])

  const saveBranding = async () => {
    setSavingBranding(true)
    setError(null)
    const { error: e } = await supabase.rpc('update_agency_branding', {
      p_id: agencyId,
      p_logo_url: branding.logo_url || null,
      p_contacts: null,
      p_access_login: branding.access_login || null,
      p_access_password: branding.access_password || null,
      p_notes: branding.notes || null,
    })
    setSavingBranding(false)
    if (e) {
      setError(e.message)
      return
    }
    setBrandingDirty(false)
    onAfterSave?.()
  }

  const saveContacts = async () => {
    setSavingContacts(true)
    setError(null)
    const cleaned = contacts.filter(c => c.name || c.phone || c.email || c.telegram || c.role)
    const { error: e } = await supabase.rpc('update_agency_branding', {
      p_id: agencyId,
      p_logo_url: null,
      p_contacts: cleaned,
      p_access_login: null,
      p_access_password: null,
      p_notes: null,
    })
    setSavingContacts(false)
    if (e) {
      setError(e.message)
      return
    }
    setContactsDirty(false)
    onAfterSave?.()
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="relative w-full max-w-xl h-full bg-background shadow-xl overflow-y-auto">
        <header className="sticky top-0 bg-background border-b border-border px-5 py-4 flex items-center justify-between z-10">
          <div className="min-w-0">
            <h2 className="text-base font-semibold truncate">
              {agency?.name || 'Агентство'}
            </h2>
            {agency?.platform_name && (
              <p className="text-xs text-muted-foreground truncate">{agency.platform_name}</p>
            )}
          </div>
          <button type="button" onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </header>

        <div className="p-5 space-y-6">
          {error && (
            <p className="text-sm text-destructive break-words bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          ) : !agency ? null : (
            <>
              {/* Branding */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Бренд и доступ</h3>
                <AgencyBrandingFields
                  value={branding}
                  onChange={(next) => { setBranding(next); setBrandingDirty(true) }}
                  disabled={savingBranding}
                />
                <div className="flex justify-end">
                  <button type="button" onClick={saveBranding}
                    disabled={!brandingDirty || savingBranding}
                    className="rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50">
                    {savingBranding ? 'Сохранение…' : 'Сохранить'}
                  </button>
                </div>
              </section>

              {/* Contacts */}
              <section className="space-y-3 pt-4 border-t border-border">
                <AgencyContactsFields
                  contacts={contacts}
                  onChange={(next) => { setContacts(next); setContactsDirty(true) }}
                  disabled={savingContacts}
                />
                <div className="flex justify-end">
                  <button type="button" onClick={saveContacts}
                    disabled={!contactsDirty || savingContacts}
                    className="rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50">
                    {savingContacts ? 'Сохранение…' : 'Сохранить контакты'}
                  </button>
                </div>
              </section>

              {/* Admin assignments */}
              <section className="pt-4 border-t border-border">
                <AgencyAdminAssignments agencyId={agencyId} />
              </section>
            </>
          )}
        </div>
      </aside>
    </div>
  )
}
