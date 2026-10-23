import type { IncomingMessage } from 'node:http'
import { describe, expect, it } from 'vitest'
import { auth, parse } from '../../packages/basic-auth/src/index'

const request = (authorization?: string) =>
  ({ headers: authorization === undefined ? {} : { authorization } }) as IncomingMessage

describe('auth(req)', () => {
  describe('arguments', () => {
    it('should throw when req is missing', () => {
      // @ts-expect-error testing invalid input
      expect(() => auth()).toThrow(new TypeError('argument req is required'))
    })
    it('should throw when req is not an object', () => {
      // @ts-expect-error testing invalid input
      expect(() => auth(42)).toThrow(new TypeError('argument req is required to be an object'))
    })
    it('should throw when req has no headers property', () => {
      // @ts-expect-error testing invalid input
      expect(() => auth({})).toThrow(new TypeError('argument req is required to have headers property'))
    })
  })

  describe('with no Authorization field', () => {
    it('should return undefined', () => {
      expect(auth(request())).toBeUndefined()
    })
  })

  describe('with malformed Authorization field', () => {
    it('should return undefined', () => {
      expect(auth(request('Something'))).toBeUndefined()
    })
  })

  describe('with malformed Authorization scheme', () => {
    it('should return undefined', () => {
      expect(auth(request('basic_Zm9vOmJhcg=='))).toBeUndefined()
    })
  })

  describe('with malformed credentials', () => {
    it('should return undefined', () => {
      expect(auth(request('basic Zm9vcgo='))).toBeUndefined()
    })
  })

  describe('with valid credentials', () => {
    it('should return .name and .pass', () => {
      expect(auth(request('basic Zm9vOmJhcg=='))).toStrictEqual({ name: 'foo', pass: 'bar' })
    })
  })

  describe('with empty password', () => {
    it('should return .name and .pass', () => {
      expect(auth(request('basic Zm9vOg=='))).toStrictEqual({ name: 'foo', pass: '' })
    })
  })

  describe('with empty userid', () => {
    it('should return .name and .pass', () => {
      expect(auth(request('basic OnBhc3M='))).toStrictEqual({ name: '', pass: 'pass' })
    })
  })

  describe('with empty userid and pass', () => {
    it('should return .name and .pass', () => {
      expect(auth(request('basic Og=='))).toStrictEqual({ name: '', pass: '' })
    })
  })

  describe('with colon in pass', () => {
    it('should return .name and .pass', () => {
      expect(auth(request('basic Zm9vOnBhc3M6d29yZA=='))).toStrictEqual({ name: 'foo', pass: 'pass:word' })
    })
  })
})

describe('parse(string)', () => {
  describe('with undefined string', () => {
    it('should return undefined', () => {
      // @ts-expect-error testing invalid input
      expect(parse()).toBeUndefined()
    })
  })

  describe('with non-string argument', () => {
    it('should return undefined', () => {
      // @ts-expect-error testing invalid input
      expect(parse(42)).toBeUndefined()
      // @ts-expect-error testing invalid input
      expect(parse(null)).toBeUndefined()
      // @ts-expect-error testing invalid input
      expect(parse({})).toBeUndefined()
    })
  })

  describe('with malformed string', () => {
    it('should return undefined', () => {
      expect(parse('Something')).toBeUndefined()
    })
  })

  describe('with malformed scheme', () => {
    it('should return undefined', () => {
      expect(parse('basic_Zm9vOmJhcg==')).toBeUndefined()
      expect(parse('Bearer Zm9vOmJhcg==')).toBeUndefined()
    })
  })

  describe('with malformed base64', () => {
    it('should return undefined', () => {
      expect(parse('basic Zm9v!mJhcg==')).toBeUndefined()
      expect(parse('basic Zm9vOmJhcg==x')).toBeUndefined()
    })
  })

  describe('with malformed credentials', () => {
    it('should return undefined', () => {
      expect(parse('basic Zm9vcgo=')).toBeUndefined()
    })
  })

  describe('with valid credentials', () => {
    it('should return .name and .pass', () => {
      expect(parse('basic Zm9vOmJhcg==')).toStrictEqual({ name: 'foo', pass: 'bar' })
    })
  })

  describe('with case-insensitive scheme', () => {
    it('should return .name and .pass', () => {
      expect(parse('BASIC Zm9vOmJhcg==')).toStrictEqual({ name: 'foo', pass: 'bar' })
      expect(parse('Basic Zm9vOmJhcg==')).toStrictEqual({ name: 'foo', pass: 'bar' })
      expect(parse('bAsIc Zm9vOmJhcg==')).toStrictEqual({ name: 'foo', pass: 'bar' })
    })
  })

  describe('with extra spaces', () => {
    it('should return .name and .pass', () => {
      expect(parse('   basic   Zm9vOmJhcg==   ')).toStrictEqual({ name: 'foo', pass: 'bar' })
    })
  })

  describe('with empty password', () => {
    it('should return .name and .pass', () => {
      expect(parse('basic Zm9vOg==')).toStrictEqual({ name: 'foo', pass: '' })
    })
  })

  describe('with empty userid', () => {
    it('should return .name and .pass', () => {
      expect(parse('basic OnBhc3M=')).toStrictEqual({ name: '', pass: 'pass' })
    })
  })

  describe('with empty userid and pass', () => {
    it('should return .name and .pass', () => {
      expect(parse('basic Og==')).toStrictEqual({ name: '', pass: '' })
    })
  })

  describe('with colon in pass', () => {
    it('should return .name and .pass', () => {
      expect(parse('basic Zm9vOnBhc3M6d29yZA==')).toStrictEqual({ name: 'foo', pass: 'pass:word' })
    })
  })

  describe('with UTF-8 credentials', () => {
    it('should decode as UTF-8', () => {
      expect(parse(`basic ${Buffer.from('jöhn:pässwörd').toString('base64')}`)).toStrictEqual({
        name: 'jöhn',
        pass: 'pässwörd'
      })
    })
  })
})
