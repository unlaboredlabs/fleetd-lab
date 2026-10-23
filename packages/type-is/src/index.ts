import * as typer from '@tinyhttp/content-type'
import { lookup } from 'mrmime'

function normalizeType(value: string) {
  // parse the type
  const type = typer.parse(value)
  type.parameters = {}
  // reformat it
  return typer.format(type)
}

function tryNormalizeType(value: string) {
  if (!value) return null

  try {
    return normalizeType(value)
  } catch {
    return null
  }
}

function mimeMatch(expected: string | boolean | null, actual: string | boolean): boolean {
  // invalid type
  if (expected === false) return false

  // split types
  const actualParts = (actual as string).split('/')
  const expectedParts = (expected as string).split('/')

  // invalid format
  if (actualParts.length !== 2 || expectedParts.length !== 2) return false

  // validate type
  if (expectedParts[0] !== '*' && expectedParts[0] !== actualParts[0]) return false

  // both have exactly two parts after the format check above
  const expectedSubtype = expectedParts[1]!
  const actualSubtype = actualParts[1]!

  // validate suffix wildcard
  if (expectedSubtype.slice(0, 2) === '*+')
    return (
      expectedSubtype.length <= actualSubtype.length + 1 &&
      expectedSubtype.slice(1) === actualSubtype.slice(1 - expectedSubtype.length)
    )

  // validate subtype
  if (expectedSubtype !== '*' && expectedSubtype !== actualSubtype) return false

  return true
}

function normalize(type: string | unknown): string | false | null {
  // invalid type
  if (typeof type !== 'string') return false

  switch (type) {
    case 'urlencoded':
      return 'application/x-www-form-urlencoded'
    case 'multipart':
      return 'multipart/*'
  }
  // "+json" -> "*/*+json" expando
  if (type[0] === '+') return `*/*${type}`

  return type.indexOf('/') === -1 ? (lookup(type) ?? null) : type
}

/**
 * Compare a `value` content-type with `types`.
 * Each `type` can be an extension like `html`,
 * a special shortcut like `multipart` or `urlencoded`,
 * or a mime type.
 */
export const typeIs = (value: string, ...types: string[]) => {
  let i: number
  // remove parameters and normalize
  const val = tryNormalizeType(value)

  // no type or invalid
  if (!val) return false

  // no types, return the content type
  if (!types || !types.length) return val

  let type: string
  for (i = 0; i < types.length; i++) {
    type = types[i]!
    if (mimeMatch(normalize(type), val)) {
      return type[0] === '+' || type.indexOf('*') !== -1 ? val : type
    }
  }

  // no matches
  return false
}
