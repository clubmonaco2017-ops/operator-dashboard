import { useState } from 'react'
import { supabase } from '../../supabaseClient.js'
import AgencyAdminAssignmentModal from './AgencyAdminAssignmentModal.jsx'

export default function AgencyTable({ agencies, onChange }) {
  const [editing, setEditing] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)

  const archive = async (a) => {
    if (
      !window.confirm(
        `Архивировать «${a.name}»? У агентства не должно быть активных пользователей или клиентов.`,
      )
    )
      return
    setBusyId(a.id)
    setError(null)
    const { error: e } = await supabase.rpc('archive_agency', {
      p_agency_id: a.id,
    })
    setBusyId(null)
    if (e) {
      setError(`${a.name}: ${e.message}`)
      return
    }
    onChange()
  }

  return (
    <>
      {error && (
        <p className="text-sm text-destructive mb-2 break-words">{error}</p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <th className="py-2 pr-4">Название</th>
              <th className="py-2 pr-4">Платформа</th>
              <th className="py-2 px-2 text-center">Админы</th>
              <th className="py-2 px-2 text-center">Сотрудники</th>
              <th className="py-2 px-2 text-center">Клиенты</th>
              <th className="py-2 px-2 text-center">Команды</th>
              <th className="py-2 px-2">Статус</th>
              <th className="py-2 pl-2 text-right">Действия</th>
            </tr>
          </thead>
          <tbody>
            {agencies.map((a) => (
              <tr key={a.id} className="border-b border-border hover:bg-accent/40">
                <td className="py-2 pr-4 font-medium">{a.name}</td>
                <td className="py-2 pr-4">{a.platform_name ?? '—'}</td>
                <td className="py-2 px-2 text-center">{a.admin_count}</td>
                <td className="py-2 px-2 text-center">{a.user_count}</td>
                <td className="py-2 px-2 text-center">{a.client_count}</td>
                <td className="py-2 px-2 text-center">{a.team_count}</td>
                <td className="py-2 px-2">
                  {a.is_active ? (
                    <span className="text-xs">Активно</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Архив</span>
                  )}
                </td>
                <td className="py-2 pl-2 text-right space-x-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => setEditing(a)}
                    className="text-primary text-xs hover:underline"
                    disabled={busyId === a.id}
                  >
                    Админы
                  </button>
                  {a.is_active && (
                    <button
                      type="button"
                      onClick={() => archive(a)}
                      className="text-destructive text-xs hover:underline disabled:opacity-50"
                      disabled={busyId === a.id}
                    >
                      Архивировать
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <AgencyAdminAssignmentModal
          agency={editing}
          onClose={() => setEditing(null)}
          onChanged={() => {
            setEditing(null)
            onChange()
          }}
        />
      )}
    </>
  )
}
