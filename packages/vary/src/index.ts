import type { ServerResponse } from 'node:http'

/**
 * RegExp to match field-name in RFC 7230 sec 3.2
 *
 * field-name    = token
 * token         = 1*tchar
 * tchar         = "!" / "#" / "$" / "%" / "&" / "'" / "*"
 *               / "+" / "-" / "." / "^" / "_" / "`" / "|" / "~"
 *               / DIGIT / ALPHA
 *               ; any VCHAR, except delimiters
 */
const FIELD_NAME_REGEXP = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/

type Res = Pick<ServerResponse, 'getHeader' | 'setHeader'>

/**
 * Parse a comma-separated header value into a list, trimming surrounding spaces.
 */
const parse = (header: string): string[] => {
  let end = 0
  let start = 0
  const list: string[] = []

  for (let i = 0, len = header.length; i < len; i++) {
    switch (header.charCodeAt(i)) {
      case 0x20 /*   */:
        if (start === end) start = end = i + 1
        break
      case 0x2c /* , */:
        list.push(header.substring(start, end))
        start = end = i + 1
        break
      default:
        end = i + 1
        break
    }
  }

  list.push(header.substring(start, end))

  return list
}

/**
 * Append a field to a vary header.
 */
export const append = (header: string, field: string | string[]): string => {
  if (typeof header !== 'string') throw new TypeError('header argument is required')

  if (!field) throw new TypeError('field argument is required')

  const fields = !Array.isArray(field) ? parse(String(field)) : field

  for (const fld of fields) {
    if (!FIELD_NAME_REGEXP.test(fld)) throw new TypeError('field argument contains an invalid header name')
  }

  if (header === '*') return header

  let val = header
  const vals = parse(header.toLowerCase())

  if (fields.includes('*') || vals.includes('*')) return '*'

  for (const fld of fields) {
    const lower = fld.toLowerCase()

    if (!vals.includes(lower)) {
      vals.push(lower)
      val = val ? `${val}, ${fld}` : fld
    }
  }

  return val
}

/**
 * Mark that a request is varied on a header field.
 */
export const vary = (res: Res, field: string | string[]): void => {
  if (!res || !res.getHeader || !res.setHeader) throw new TypeError('res argument is required')

  const current = res.getHeader('Vary') || ''
  const header = Array.isArray(current) ? current.join(', ') : String(current)

  const val = append(header, field)
  if (val) res.setHeader('Vary', val)
}
