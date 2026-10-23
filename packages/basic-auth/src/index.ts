import { Buffer } from 'node:buffer'
import type { IncomingMessage } from 'node:http'

/**
 * RegExp for basic auth credentials
 *
 * credentials = auth-scheme 1*SP token68
 * auth-scheme = "Basic" ; case insensitive
 * token68     = 1*( ALPHA / DIGIT / "-" / "." / "_" / "~" / "+" / "/" ) *"="
 */
const CREDENTIALS_REGEXP = /^ *(?:[Bb][Aa][Ss][Ii][Cc]) +([A-Za-z0-9._~+/-]+=*) *$/

/**
 * RegExp for basic auth user/pass
 *
 * user-pass   = userid ":" password
 * userid      = *<TEXT excluding ":">
 * password    = *TEXT
 */
const USER_PASS_REGEXP = /^([^:]*):(.*)$/

export type Credentials = {
  name: string
  pass: string
}

/**
 * Parse basic auth to object.
 *
 * @param header Value of the `Authorization` header
 */
export function parse(header: string): Credentials | undefined {
  if (typeof header !== 'string') return undefined

  // parse header
  const match = CREDENTIALS_REGEXP.exec(header)
  if (!match) return undefined

  // decode user pass
  const userPass = USER_PASS_REGEXP.exec(Buffer.from(match[1], 'base64').toString())
  if (!userPass) return undefined

  return { name: userPass[1], pass: userPass[2] }
}

/**
 * Parse the `Authorization` header field of a request.
 *
 * @param req Request object
 */
export function auth(req: Pick<IncomingMessage, 'headers'>): Credentials | undefined {
  if (!req) throw new TypeError('argument req is required')

  if (typeof req !== 'object') throw new TypeError('argument req is required to be an object')

  if (!req.headers || typeof req.headers !== 'object')
    throw new TypeError('argument req is required to have headers property')

  return parse(req.headers.authorization as string)
}
