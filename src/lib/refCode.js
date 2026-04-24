const ROLE_PREFIX = {
  superadmin: 'SA',
  admin: 'ADM',
  moderator: 'MOD',
  teamlead: 'TL',
  operator: 'OP',
}

export function roleToPrefix(role) {
  const prefix = ROLE_PREFIX[role]
  if (!prefix) throw new Error(`Unknown role: ${role}`)
  return prefix
}

function capitalize(s) {
  if (!s) return ''
  return s.charAt(0).toLocaleUpperCase('ru-RU') + s.slice(1).toLocaleLowerCase('ru-RU')
}

export function buildRefCode({ role, firstName, lastName, number }) {
  if (number < 1 || number > 999) {
    throw new Error(`Number must be 1..999, got ${number}`)
  }
  const prefix = roleToPrefix(role)
  const first = capitalize(firstName)
  const lastInitial = lastName.charAt(0).toLocaleUpperCase('ru-RU')
  const num = String(number).padStart(3, '0')
  return `${prefix}-${first}${lastInitial}-${num}`
}
