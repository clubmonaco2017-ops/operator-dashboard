import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const TZ = 'Europe/Kiev'
const HOURS = Array.from({ length: 24 }, (_, i) => i)
const DATA_START = { date: '2026-04-04', hour: 0 }

/**
 * Fetches per-operator hourly revenue rows for a date range.
 * Hour-range filtering happens at consumer level (cards apply period.hours).
 *
 * @param {{from: string, to: string}} range — YYYY-MM-DD inclusive
 * @returns {{
 *   rows: Array<{refcode, h0..h23, total, noData?}>,
 *   operatorMap: Record<string, {name, shift}>,
 *   loading: boolean,
 *   error: string|null,
 *   reload: () => void,
 * }}
 */
export function useDashboardData({ from, to }) {
  const [rows, setRows] = useState([])
  const [operatorMap, setOperatorMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!from || !to) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)

    const run = async () => {
      try {
        // Expand UTC range by ±1 day to capture rows that fall into the local TZ window
        const d1 = new Date(from + 'T00:00:00Z')
        const d2 = new Date(to + 'T00:00:00Z')
        d1.setUTCDate(d1.getUTCDate() - 1)
        d2.setUTCDate(d2.getUTCDate() + 1)
        const utcFrom = d1.toISOString().slice(0, 10)
        const utcTo = d2.toISOString().slice(0, 10)

        const [opsResult, revResult] = await Promise.all([
          supabase.from('operators').select('refcode, name, shift'),
          supabase
            .from('hourly_revenue')
            .select('refcode, date, hour, delta')
            .gte('date', utcFrom)
            .lte('date', utcTo),
        ])

        if (cancelled) return
        if (revResult.error) throw revResult.error
        if (opsResult.error) throw opsResult.error

        const opMap = {}
        ;(opsResult.data || []).forEach((op) => {
          opMap[op.refcode] = { name: op.name, shift: op.shift || '' }
        })

        const map = {}
        for (const row of revResult.data || []) {
          if (row.refcode?.toString().trim().toLowerCase() === 'all') continue
          // Convert UTC date+hour → local date+hour
          const utcDt = new Date(row.date + 'T00:00:00Z')
          utcDt.setUTCHours(row.hour)
          const localDt = new Date(utcDt.toLocaleString('en-US', { timeZone: TZ }))
          const localDate = localDt.toLocaleDateString('sv-SE')
          const localHour = localDt.getHours()
          if (localDate < from || localDate > to) continue
          if (localDate === DATA_START.date && localHour < DATA_START.hour) continue
          if (!map[row.refcode]) map[row.refcode] = { refcode: row.refcode }
          map[row.refcode][`h${localHour}`] = (map[row.refcode][`h${localHour}`] || 0) + Number(row.delta)
        }

        Object.keys(opMap).forEach((refcode) => {
          if (!map[refcode]) map[refcode] = { refcode, noData: true }
        })

        const result = Object.values(map).map((op) => {
          const total = HOURS.reduce((s, h) => s + (op[`h${h}`] || 0), 0)
          return { ...op, total }
        })

        if (cancelled) return
        setOperatorMap(opMap)
        setRows(result)
      } catch (e) {
        if (!cancelled) setError(e.message ?? String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()

    return () => {
      cancelled = true
    }
  }, [from, to, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])

  return { rows, operatorMap, loading, error, reload }
}

/**
 * Builds a map: operator refcode → team name.
 *
 * Fan-out implementation: list_teams(callerId) → for each team
 * get_team_detail(callerId, team.id) → flatten members[].ref_code → team.name.
 *
 * Cost: 1 + N RPC calls (N = teams visible to caller). For dashboards with
 * 5-20 teams, that's 6-21 round-trips on dashboard load. Acceptable for MVP;
 * could be optimized later by adding a single dedicated RPC like
 * `list_team_memberships()` that returns the flat mapping in one call.
 *
 * Returns {} if the caller has no teams visible (operator with no team), if
 * the RPC errors out, or if callerId is null. Team cards (`TopTeamCard`,
 * `TeamDistributionCard`, `TeamEngagementCard`) gracefully degrade to «—»
 * / «Нет данных» when teamMap is empty.
 */
export function useTeamMembershipsMap(callerId) {
  const [teamMap, setTeamMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (callerId == null) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)

    const run = async () => {
      try {
        const { data: teams, error: teamsErr } = await supabase.rpc('list_teams', {
          p_caller_id: callerId,
          p_active: 'active',
        })
        if (cancelled) return
        if (teamsErr) throw teamsErr

        const detailPromises = (teams || []).map((t) =>
          supabase
            .rpc('get_team_detail', { p_caller_id: callerId, p_team_id: t.id })
            .then(({ data, error: detailErr }) => {
              if (detailErr) return { team: t, members: [] }
              return { team: t, members: data?.[0]?.members || [] }
            }),
        )
        const details = await Promise.all(detailPromises)
        if (cancelled) return

        const map = {}
        for (const { team, members } of details) {
          for (const m of members) {
            if (m.ref_code) map[m.ref_code] = team.name
          }
        }
        setTeamMap(map)
      } catch (e) {
        if (!cancelled) setError(e.message ?? String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()

    return () => {
      cancelled = true
    }
  }, [callerId])

  return { teamMap, loading, error }
}
