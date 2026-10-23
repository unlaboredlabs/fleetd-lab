import { STATUS_CODES } from 'node:http'

const hasOwn = Object.prototype.hasOwnProperty

/**
 * Status code to message map
 */
export const message: Record<number, string> = {}

/**
 * Lowercased message to status code map
 */
export const code: Record<string, number> = {}

for (const [key, msg] of Object.entries(STATUS_CODES)) {
  if (msg === undefined) continue
  const num = Number(key)
  message[num] = msg
  code[msg.toLowerCase()] = num
}

/**
 * Every known status code, ascending
 */
export const codes: number[] = Object.keys(message)
  .map(Number)
  .sort((a, b) => a - b)

/**
 * Status codes for redirects
 */
export const redirect: Record<number, boolean | undefined> = {
  300: true,
  301: true,
  302: true,
  303: true,
  305: true,
  307: true,
  308: true
}

/**
 * Status codes for empty bodies
 */
export const empty: Record<number, boolean | undefined> = {
  204: true,
  205: true,
  304: true
}

/**
 * Status codes for when you should retry the request
 */
export const retry: Record<number, boolean | undefined> = {
  502: true,
  503: true,
  504: true
}

/**
 * Get the status code for a code or message.
 *
 * @param input status code (number or string of digits) or status message
 * @returns status code
 * @throws {TypeError} if the code or message is unknown
 */
export const status = (input: number | string): number => {
  if (typeof input === 'number' || /^\d+$/.test(input)) {
    const num = Number(input)
    if (!hasOwn.call(message, num)) throw new TypeError(`invalid status code: ${input}`)
    return num
  }

  const lower = input.toLowerCase()
  if (!hasOwn.call(code, lower)) throw new TypeError(`invalid status message: "${input}"`)
  return code[lower]
}
