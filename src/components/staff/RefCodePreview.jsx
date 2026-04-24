import { roleToPrefix } from '../../lib/refCode.js'

function capitalize(s) {
  if (!s) return ''
  return s.charAt(0).toLocaleUpperCase('ru-RU') + s.slice(1).toLocaleLowerCase('ru-RU')
}

export function RefCodePreview({ role, firstName, lastName }) {
  let prefix
  try {
    prefix = roleToPrefix(role)
  } catch {
    return <span className="font-mono text-sm text-slate-400">—</span>
  }
  const first = firstName ? capitalize(firstName) : '…'
  const last = lastName ? lastName.charAt(0).toLocaleUpperCase('ru-RU') : ''
  const body = firstName || lastName ? `${first}${last}` : '…'
  return (
    <span className="font-mono text-sm text-slate-600 dark:text-slate-300">
      {prefix}-{body}-###
    </span>
  )
}
