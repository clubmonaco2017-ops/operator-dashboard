import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../useAuth.jsx'
import { hasPermission } from '../../lib/permissions.js'
import { TeamMembershipBlock } from './TeamMembershipBlock.jsx'
import { CuratorBlock } from './CuratorBlock.jsx'
import { CuratedOperatorsBlock } from './CuratedOperatorsBlock.jsx'

export function ProfileTab({ row, onSaved }) {
  const { user } = useAuth()
  const canEdit = user.id === row.id || hasPermission(user, 'create_users')

  const [firstName, setFirstName] = useState(row.first_name ?? '')
  const [lastName, setLastName] = useState(row.last_name ?? '')
  const [alias, setAlias] = useState(row.alias ?? '')
  const [email, setEmail] = useState(row.email ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setFirstName(row.first_name ?? '')
    setLastName(row.last_name ?? '')
    setAlias(row.alias ?? '')
    setEmail(row.email ?? '')
  }, [row])

  const save = async (e) => {
    e.preventDefault()
    if (!canEdit) return
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.rpc('update_staff_profile', {
      p_caller_id: user.id,
      p_user_id: row.id,
      p_first_name: firstName.trim(),
      p_last_name: lastName.trim(),
      p_alias: alias.trim() || null,
      p_email: email.trim(),
    })
    setSaving(false)
    if (err) setError(err.message)
    else onSaved?.()
  }

  return (
    <>
      <form onSubmit={save} className="grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800 sm:grid-cols-2">
        <Field label="Имя" value={firstName} onChange={setFirstName} disabled={!canEdit} required />
        <Field label="Фамилия" value={lastName} onChange={setLastName} disabled={!canEdit} required />
        <Field label="Псевдоним" value={alias} onChange={setAlias} disabled={!canEdit} />
        <Field label="Email" value={email} onChange={setEmail} type="email" disabled={!canEdit} required />
        <ReadOnly label="Реф-код 🔒" value={row.ref_code} mono />
        <ReadOnly label="Роль 🔒" value={row.role} />
        {error && <p className="text-sm text-red-500 sm:col-span-2" role="alert">{error}</p>}
        {canEdit && (
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
        )}
      </form>

      {row.role === 'operator' && (
        <>
          <TeamMembershipBlock callerId={user.id} user={user} staff={row} />
          <CuratorBlock callerId={user.id} user={user} staff={row} />
        </>
      )}
      {row.role === 'moderator' && (
        <CuratedOperatorsBlock callerId={user.id} user={user} staff={row} />
      )}
    </>
  )
}

function Field({ label, value, onChange, type = 'text', disabled, required }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
        {label}{required && ' *'}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        required={required}
        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800"
      />
    </label>
  )
}

function ReadOnly({ label, value, mono }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:bg-slate-900 dark:text-slate-300 ${mono ? 'font-mono' : ''}`}>
        {value ?? '—'}
      </div>
    </div>
  )
}
