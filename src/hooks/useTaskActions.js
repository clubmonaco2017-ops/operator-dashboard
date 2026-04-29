import { useCallback, useState } from 'react'
import { supabase } from '../supabaseClient'
import { invalidateUserOverdueCount } from './useUserOverdueCount.js'

/**
 * Mutating actions для задач: create / update / cancel / take / report / delete.
 * - `mutating` — true пока выполняется ЛЮБОЕ действие (счётчик in-flight).
 * - `error` — последняя ошибка действия.
 * - После каждой мутации сбрасываем кэш счётчика просроченных у callerId
 *   и (если известно) у второго затронутого пользователя.
 *
 * @param {number|null} callerId
 */
export function useTaskActions(callerId) {
  const [inFlight, setInFlight] = useState(0)
  const [error, setError] = useState(null)

  const begin = useCallback(() => {
    setInFlight((n) => n + 1)
    setError(null)
  }, [])
  const end = useCallback(() => setInFlight((n) => Math.max(0, n - 1)), [])

  const invalidate = useCallback(
    (otherUserId) => {
      if (callerId != null) invalidateUserOverdueCount(callerId)
      if (otherUserId != null && otherUserId !== callerId)
        invalidateUserOverdueCount(otherUserId)
    },
    [callerId],
  )

  const createTask = useCallback(
    async ({ title, description, deadline, assignedTo }) => {
      begin()
      try {
        const { data, error: err } = await supabase.rpc('create_task', {
          p_title: title,
          p_description: description ?? null,
          p_deadline: deadline ?? null,
          p_assigned_to: assignedTo,
        })
        if (err) throw new Error(err.message)
        invalidate(assignedTo)
        return data // new task id (integer)
      } catch (e) {
        setError(e.message)
        throw e
      } finally {
        end()
      }
    },
    [callerId, begin, end, invalidate],
  )

  const updateTask = useCallback(
    async (
      taskId,
      { title, description, deadline, assignedTo, clearDeadline = false } = {},
    ) => {
      begin()
      try {
        const { error: err } = await supabase.rpc('update_task', {
          p_task_id: taskId,
          p_title: title ?? null,
          p_description: description ?? null,
          p_deadline: deadline ?? null,
          p_assigned_to: assignedTo ?? null,
          p_clear_deadline: clearDeadline,
        })
        if (err) throw new Error(err.message)
        invalidate(assignedTo)
      } catch (e) {
        setError(e.message)
        throw e
      } finally {
        end()
      }
    },
    [callerId, begin, end, invalidate],
  )

  const cancelTask = useCallback(
    async (taskId) => {
      begin()
      try {
        const { error: err } = await supabase.rpc('cancel_task', {
          p_task_id: taskId,
        })
        if (err) throw new Error(err.message)
        invalidate()
      } catch (e) {
        setError(e.message)
        throw e
      } finally {
        end()
      }
    },
    [callerId, begin, end, invalidate],
  )

  const takeInProgress = useCallback(
    async (taskId) => {
      begin()
      try {
        const { error: err } = await supabase.rpc('take_task_in_progress', {
          p_task_id: taskId,
        })
        if (err) throw new Error(err.message)
        invalidate()
      } catch (e) {
        setError(e.message)
        throw e
      } finally {
        end()
      }
    },
    [callerId, begin, end, invalidate],
  )

  const submitReport = useCallback(
    async (taskId, { content, media }) => {
      begin()
      try {
        const { error: err } = await supabase.rpc('submit_task_report', {
          p_task_id: taskId,
          p_content: content ?? null,
          p_media: media ?? [],
        })
        if (err) throw new Error(err.message)
        invalidate()
      } catch (e) {
        setError(e.message)
        throw e
      } finally {
        end()
      }
    },
    [callerId, begin, end, invalidate],
  )

  const updateReport = useCallback(
    async (taskId, { content, media } = {}) => {
      begin()
      try {
        const { error: err } = await supabase.rpc('update_task_report', {
          p_task_id: taskId,
          p_content: content ?? null,
          p_media: media ?? null,
        })
        if (err) throw new Error(err.message)
        invalidate()
      } catch (e) {
        setError(e.message)
        throw e
      } finally {
        end()
      }
    },
    [callerId, begin, end, invalidate],
  )

  const deleteTask = useCallback(
    async (taskId) => {
      begin()
      try {
        const { data, error: err } = await supabase.rpc('delete_task', {
          p_task_id: taskId,
        })
        if (err) throw new Error(err.message)
        invalidate()
        return data // jsonb { media_paths: [...] }
      } catch (e) {
        setError(e.message)
        throw e
      } finally {
        end()
      }
    },
    [callerId, begin, end, invalidate],
  )

  return {
    createTask,
    updateTask,
    cancelTask,
    takeInProgress,
    submitReport,
    updateReport,
    deleteTask,
    mutating: inFlight > 0,
    error,
  }
}
