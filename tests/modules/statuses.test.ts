import { STATUS_CODES } from 'node:http'
import { describe, expect, it } from 'vitest'
import { code, codes, empty, message, redirect, retry, status } from '../../packages/statuses/src/index'

describe('message', () => {
  it('should match STATUS_CODES exactly', () => {
    const expected: Record<number, string> = {}
    for (const [k, v] of Object.entries(STATUS_CODES)) expected[Number(k)] = v as string
    expect(message).toStrictEqual(expected)
  })
  it('should map codes to messages', () => {
    expect(message[200]).toBe('OK')
    expect(message[404]).toBe('Not Found')
  })
})

describe('code', () => {
  it('should map every lowercased message to its code', () => {
    const expected: Record<string, number> = {}
    for (const [k, v] of Object.entries(STATUS_CODES)) expected[(v as string).toLowerCase()] = Number(k)
    expect(code).toStrictEqual(expected)
  })
  it('should map messages to codes', () => {
    expect(code.ok).toBe(200)
    expect(code['not found']).toBe(404)
  })
})

describe('codes', () => {
  it('should contain every code from STATUS_CODES in ascending order', () => {
    const expected = Object.keys(STATUS_CODES)
      .map(Number)
      .sort((a, b) => a - b)
    expect(codes).toStrictEqual(expected)
  })
  it('should be sorted ascending', () => {
    for (let i = 1; i < codes.length; i++) expect(codes[i]).toBeGreaterThan(codes[i - 1])
  })
})

describe('status(code)', () => {
  it('should return the code for a known number', () => {
    expect(status(200)).toBe(200)
    expect(status(404)).toBe(404)
    expect(status(500)).toBe(500)
  })
  it('should return every known code', () => {
    for (const c of codes) expect(status(c)).toBe(c)
  })
  it('should accept a string of digits', () => {
    expect(status('200')).toBe(200)
    expect(status('404')).toBe(404)
  })
  it('should throw for an unknown number', () => {
    expect(() => status(999)).toThrow(new TypeError('invalid status code: 999'))
    expect(() => status(0)).toThrow(new TypeError('invalid status code: 0'))
  })
  it('should throw for an unknown string of digits', () => {
    expect(() => status('999')).toThrow(new TypeError('invalid status code: 999'))
  })
  it('should throw a TypeError', () => {
    expect(() => status(999)).toThrow(TypeError)
  })
})

describe('status(message)', () => {
  it('should return the code for a message', () => {
    expect(status('OK')).toBe(200)
    expect(status('Not Found')).toBe(404)
  })
  it('should match messages case-insensitively', () => {
    expect(status('not found')).toBe(404)
    expect(status('NOT FOUND')).toBe(404)
    expect(status('nOt FoUnD')).toBe(404)
  })
  it('should return the code for every known message', () => {
    for (const c of codes) expect(status(message[c])).toBe(c)
  })
  it('should throw for an unknown message', () => {
    expect(() => status('foo')).toThrow(new TypeError('invalid status message: "foo"'))
    expect(() => status('Foo Bar')).toThrow(new TypeError('invalid status message: "Foo Bar"'))
  })
  it('should throw a TypeError', () => {
    expect(() => status('foo')).toThrow(TypeError)
  })
})

describe('redirect', () => {
  const listed = [300, 301, 302, 303, 305, 307, 308]
  it('should be true for redirect codes', () => {
    for (const c of listed) expect(redirect[c]).toBe(true)
  })
  it('should be falsy for other codes', () => {
    for (const c of codes) if (!listed.includes(c)) expect(redirect[c]).toBeFalsy()
    expect(redirect[304]).toBeFalsy()
  })
})

describe('empty', () => {
  const listed = [204, 205, 304]
  it('should be true for empty body codes', () => {
    for (const c of listed) expect(empty[c]).toBe(true)
  })
  it('should be falsy for other codes', () => {
    for (const c of codes) if (!listed.includes(c)) expect(empty[c]).toBeFalsy()
    expect(empty[200]).toBeFalsy()
  })
})

describe('retry', () => {
  const listed = [502, 503, 504]
  it('should be true for retry codes', () => {
    for (const c of listed) expect(retry[c]).toBe(true)
  })
  it('should be falsy for other codes', () => {
    for (const c of codes) if (!listed.includes(c)) expect(retry[c]).toBeFalsy()
    expect(retry[500]).toBeFalsy()
  })
})
