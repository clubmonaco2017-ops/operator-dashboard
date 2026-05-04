import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import { adminFetch } from '../../lib/adminFetch'
import { defaultPermissions } from '../../lib/defaultPermissions.js'
import { permissionGroups } from '../../lib/permissionGroups.js'
import { useAgencyContext } from '../../lib/agencyContext.jsx'
import { useAuth } from '../../useAuth.jsx'
import AgencySelect from '../AgencySelect.jsx'
import { RefCodePreview } from './RefCodePreview.jsx'
import { ResponsiveSlideOut } from '@/components/ui/responsive-slide-out'

const ALL_ROLES = [
  { value: 'admin',     label: 'Администратор' },
  { value: 'moderator', label: 'Модератор' },
  { value: 'teamlead',  label: 'Тим Лидер' },
  { value: 'operator',  label: 'Оператор' },
]

function mapCreateStaffError(message) {
  if (!message) return 'Не удалось создать сотрудника. Попробуйте ещё раз.'
  if (/email already exists/i.test(message)) return 'Этот email уже используется'
  if (/forbidden/i.test(message)) return 'Нет прав на создание пользователей'
  // RPC validation messages (22-prefixed codes) come through verbatim and are
  // already user-readable for the operator/admin/agency cases.
  return message
}

export function CreateStaffSlideOut({ callerId, onClose, onCreated }) {
  const { activeAgencyId, availableAgencies } = useAgencyContext()
  const { user } = useAuth()
  const isCallerSuperadmin = user?.role === 'superadmin'
  const ROLES = isCallerSuperadmin
    ? ALL_ROLES
    : ALL_ROLES.filter((r) => r.value !== 'admin')
  const [role, setRole] = useState('moderator')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [alias, setAlias] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [perms, setPerms] = useState(() => new Set(defaultPermissions('moderator')))
  const [agencyId, setAgencyId] = useState(activeAgencyId)
  const [adminAgencyIds, setAdminAgencyIds] = useState(
    activeAgencyId ? [activeAgencyId] : [],
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const firstNameRef = useRef(null)

  const isAdminRole = role === 'admin'

  useEffect(() => {
    firstNameRef.current?.focus()
  }, [])

  function setRoleAndPerms(r) {
    setRole(r)
    setPerms(new Set(defaultPermissions(r)))
  }

  function togglePerm(key) {
    setPerms((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleAdminAgency(id) {
    setAdminAgencyIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const agencySelectionValid = isAdminRole
    ? adminAgencyIds.length > 0
    : Boolean(agencyId)

  const canSubmit = useMemo(() => {
    return (
      firstName.trim() &&
      lastName.trim() &&
      email.trim() &&
      password.length >= 6 &&
      agencySelectionValid
    )
  }, [firstName, lastName, email, password, agencySelectionValid])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit || submitting) return
    setSubmitting(true)
    setError(null)

    // For non-admin roles: pin to selected agency.
    // For admin: agency_id stays NULL, admin_agencies is populated from multi-select.
    const rpcArgs = {
      p_email: email.trim(),
      p_password: password,
      p_role: role,
      p_first_name: firstName.trim(),
      p_last_name: lastName.trim(),
      p_alias: alias.trim() || null,
      p_permissions: Array.from(perms),
      p_agency_id: isAdminRole ? null : agencyId,
      p_admin_agency_ids: isAdminRole ? adminAgencyIds : [],
    }
    const { data: createRes, error: createErr } = await adminFetch(
      '/api/admin/create-staff',
      rpcArgs,
    )

    if (createErr) {
      setError(mapCreateStaffError(createErr.message))
      setSubmitting(false)
      return
    }
    const newId = createRes.id

    const { data: detail, error: detailErr } = await supabase.rpc('get_staff_detail', {
      p_user_id: newId,
    })
    if (detailErr || !detail?.[0]) {
      setError(detailErr?.message ?? 'Создано, но не удалось открыть карточку')
      setSubmitting(false)
      return
    }
    setSubmitting(false)
    onCreated?.(detail[0].out_ref_code)
  }

  return (
    <ResponsiveSlideOut
      open
      onOpenChange={(next) => !next && !submitting && onClose()}
      title={
        <>
          Новый сотрудник
          <p className="mt-1 text-xs font-normal text-muted-foreground">
            Поля со звёздочкой обязательны
          </p>
        </>
      }
      desktopWidth="sm:max-w-lg"
      footer={
        <>
          {error && (
            <p
              className="mb-3 rounded-md bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]"
              role="alert"
            >
              {error}
            </p>
          )}
          <div className="flex items-center gap-3">
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => !submitting && onClose()}
              disabled={submitting}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              type="submit"
              form="create-staff-form"
              disabled={!canSubmit || submitting}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 inline-flex items-center"
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin mr-1.5" /> Создаётся…
                </>
              ) : (
                'Создать'
              )}
            </button>
          </div>
        </>
      }
    >
      <form
        id="create-staff-form"
        onSubmit={handleSubmit}
        className="space-y-5"
      >
        <Field label="Роль" required>
          <select
            value={role}
            onChange={(e) => setRoleAndPerms(e.target.value)}
            disabled={submitting}
            className={inputCls()}
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>

        {isAdminRole ? (
          <Field
            label="Агентства"
            required
            hint="Админ может вести несколько агентств. Отметь хотя бы одно."
          >
            {availableAgencies.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Нет доступных агентств.
              </p>
            ) : (
              <div className="space-y-1 rounded-md border border-border bg-card px-3 py-2 max-h-44 overflow-auto">
                {availableAgencies.map((a) => (
                  <label
                    key={a.id}
                    className="flex items-center gap-2 text-sm py-0.5"
                  >
                    <input
                      type="checkbox"
                      checked={adminAgencyIds.includes(a.id)}
                      onChange={() => toggleAdminAgency(a.id)}
                      disabled={submitting}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-[var(--primary-ring)]"
                    />
                    <span className="text-foreground">{a.name}</span>
                  </label>
                ))}
              </div>
            )}
          </Field>
        ) : (
          <AgencySelect value={agencyId} onChange={setAgencyId} disabled={submitting} />
        )}

        <div className="rounded-md border border-border bg-muted/40 p-3">
          <div className="mb-1 text-xs font-medium text-muted-foreground">
            Реф-код (предпросмотр)
          </div>
          <RefCodePreview role={role} firstName={firstName} lastName={lastName} />
        </div>

        <Field label="Имя" required>
          <input
            ref={firstNameRef}
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            disabled={submitting}
            className={inputCls()}
          />
        </Field>

        <Field label="Фамилия" required>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            disabled={submitting}
            className={inputCls()}
          />
        </Field>

        <Field label="Псевдоним">
          <input
            type="text"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            disabled={submitting}
            className={inputCls()}
          />
        </Field>

        <Field label="Email" required>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
            className={inputCls()}
          />
        </Field>

        <Field label="Пароль" required hint="Минимум 6 символов">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
            minLength={6}
            className={inputCls()}
          />
        </Field>

        <div>
          <div className="mb-2 text-xs font-medium text-muted-foreground">
            Права (по умолчанию для роли, можно менять)
          </div>
          <div className="space-y-2">
            {permissionGroups.map((g) => (
              <details key={g.title} open className="rounded-md border border-border bg-card">
                <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.title}
                </summary>
                <div className="space-y-1 border-t border-border px-3 py-2">
                  {g.permissions.map((p) => (
                    <label key={p.key} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={perms.has(p.key)}
                        onChange={() => togglePerm(p.key)}
                        disabled={submitting}
                        className="h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-[var(--primary-ring)]"
                      />
                      <span className="text-foreground">{p.label}</span>
                    </label>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </div>
      </form>
    </ResponsiveSlideOut>
  )
}

function Field({ label, required, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
        {required && (
          <span className="ml-0.5 text-[var(--danger)]" aria-label="обязательное поле">*</span>
        )}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[var(--fg4)]">{hint}</span>}
    </label>
  )
}

function inputCls() {
  return [
    'w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none transition-colors text-foreground',
    'placeholder:text-[var(--fg4)]',
    'hover:border-border-strong focus:border-primary focus:ring-2 focus:ring-[var(--primary-ring)]',
    'disabled:bg-muted disabled:opacity-60',
  ].join(' ')
}
