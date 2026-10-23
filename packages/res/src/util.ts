import { lookup } from 'mrmime'

export type NormalizedType = {
  value: string
  quality?: number
  params: Record<string, string | undefined>
  originalIndex?: number
}

export function acceptParams(str: string, index?: number): NormalizedType {
  // split() always returns at least one element, so the '' defaults never apply
  const [value = '', ...parts] = str.split(/ *; */)
  const ret: NormalizedType = { value, quality: 1, params: {}, originalIndex: index }

  for (const part of parts) {
    const [key = '', val] = part.split(/ *= */)
    // a param without '=' has no value: parseFloat(undefined) and parseFloat('') are both NaN
    if ('q' === key) ret.quality = Number.parseFloat(val ?? '')
    else ret.params[key] = val
  }

  return ret
}

export const normalizeType = (type: string): NormalizedType =>
  ~type.indexOf('/') ? acceptParams(type) : ({ value: lookup(type), params: {} } as NormalizedType)

export function normalizeTypes(types: string[]): NormalizedType[] {
  const ret: NormalizedType[] = []

  for (const type of types) {
    ret.push(normalizeType(type))
  }

  return ret
}

const matchHtmlRegExp = /["'&<>]/

export function escapeHTML(str: string): string {
  const match = matchHtmlRegExp.exec(str)

  if (!match) {
    // stringify in case input is not a string
    return String(str)
  }

  let escapeChar: string
  let html = ''
  let index = 0
  let lastIndex = 0

  for (index = match.index; index < str.length; index++) {
    switch (str.charCodeAt(index)) {
      case 34: // "
        escapeChar = '&quot;'
        break
      case 38: // &
        escapeChar = '&amp;'
        break
      case 39: // '
        escapeChar = '&#39;'
        break
      case 60: //
        escapeChar = '&lt;'
        break
      case 62: // >
        escapeChar = '&gt;'
        break
      default:
        continue
    }

    if (lastIndex !== index) html += str.substring(lastIndex, index)

    lastIndex = index + 1
    html += escapeChar
  }

  return lastIndex !== index ? html + str.substring(lastIndex, index) : html
}
