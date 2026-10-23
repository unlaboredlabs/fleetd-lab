import { makeFetch } from 'supertest-fetch'
import { describe, expect, it } from 'vitest'
import { append, vary } from '../../packages/vary/src/index'
import { runServer } from '../../test_helpers/runServer'

type Header = number | string | string[] | undefined

const createRes = (initial?: Header) => {
  const headers: Record<string, Header> = {}
  if (initial !== undefined) headers.vary = initial
  let setCalls = 0

  const res = {
    getHeader: (name: string) => headers[name.toLowerCase()],
    setHeader: (name: string, value: Header) => {
      setCalls++
      headers[name.toLowerCase()] = value
      return res
    }
  }

  return { res: res as unknown as Parameters<typeof vary>[0], headers, setCalls: () => setCalls }
}

const callAppend = append as (...args: unknown[]) => string
const callVary = vary as (...args: unknown[]) => void

describe('append(header, field)', () => {
  describe('arguments', () => {
    describe('header', () => {
      it('should be required', () => {
        expect(() => callAppend()).toThrow(new TypeError('header argument is required'))
      })
      it('should be a string', () => {
        expect(() => callAppend(42, 'Accept')).toThrow(new TypeError('header argument is required'))
      })
    })

    describe('field', () => {
      it('should be required', () => {
        expect(() => callAppend('')).toThrow(new TypeError('field argument is required'))
      })
      it('should reject an empty string', () => {
        expect(() => append('', '')).toThrow(new TypeError('field argument is required'))
      })
      it('should accept string', () => {
        expect(() => append('', 'foo')).not.toThrow()
      })
      it('should accept string that is Vary header', () => {
        expect(() => append('', 'foo, bar')).not.toThrow()
      })
      it('should accept array of string', () => {
        expect(() => append('', ['foo', 'bar'])).not.toThrow()
      })
      it('should not allow separator ":"', () => {
        expect(() => append('', 'invalid:header')).toThrow(
          new TypeError('field argument contains an invalid header name')
        )
      })
      it('should not allow separator " "', () => {
        expect(() => append('', 'invalid header')).toThrow(
          new TypeError('field argument contains an invalid header name')
        )
      })
      it('should not allow non-token characters', () => {
        for (const field of [
          'invalid<header',
          'invalid=header',
          'invalid{header',
          'invalid}header',
          'invalid\nheader'
        ]) {
          expect(() => append('', field)).toThrow(new TypeError('field argument contains an invalid header name'))
        }
      })
      it('should not allow non-ASCII characters', () => {
        expect(() => append('', 'invalid\u0080header')).toThrow(
          new TypeError('field argument contains an invalid header name')
        )
      })
      it('should validate every field in an array', () => {
        expect(() => append('', ['Accept', 'invalid:header'])).toThrow(
          new TypeError('field argument contains an invalid header name')
        )
      })
      it('should not allow an empty field in a list', () => {
        expect(() => append('', 'Accept,,Origin')).toThrow(
          new TypeError('field argument contains an invalid header name')
        )
        expect(() => append('', ['Accept', ''])).toThrow(
          new TypeError('field argument contains an invalid header name')
        )
      })
      it('should allow every token character', () => {
        const token = "!#$%&'*+-.^_`|~0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
        expect(append('', token)).toBe(token)
      })
      it('should validate fields even when header is *', () => {
        expect(() => append('*', 'invalid:header')).toThrow(
          new TypeError('field argument contains an invalid header name')
        )
      })
    })
  })

  describe('when header empty', () => {
    it('should set value', () => {
      expect(append('', 'Origin')).toBe('Origin')
    })
    it('should set value with multiple', () => {
      expect(append('', 'Origin, User-Agent')).toBe('Origin, User-Agent')
    })
    it('should set value with array', () => {
      expect(append('', ['Origin', 'User-Agent'])).toBe('Origin, User-Agent')
    })
    it('should preserve case', () => {
      expect(append('', ['ORIGIN', 'user-agent', 'AccepT'])).toBe('ORIGIN, user-agent, AccepT')
    })
    it('should not set duplicates', () => {
      expect(append('', ['Origin', 'origin', 'ORIGIN'])).toBe('Origin')
    })
    it('should return empty string for empty array', () => {
      expect(append('', [])).toBe('')
    })
  })

  describe('when header has values', () => {
    it('should set value', () => {
      expect(append('Accept', 'Origin')).toBe('Accept, Origin')
    })
    it('should set value with multiple', () => {
      expect(append('Accept', 'Origin, User-Agent')).toBe('Accept, Origin, User-Agent')
    })
    it('should not set duplicates', () => {
      expect(append('Accept', ['Origin', 'accept'])).toBe('Accept, Origin')
      expect(append('Accept, Origin', ['Origin', 'User-Agent'])).toBe('Accept, Origin, User-Agent')
    })
    it('should compare case-insensitive', () => {
      expect(append('Accept', 'accept')).toBe('Accept')
      expect(append('ACCEPT, origin', ['Accept', 'Origin'])).toBe('ACCEPT, origin')
    })
    it('should preserve case', () => {
      expect(append('Accept', ['ORIGIN', 'user-agent', 'AccepT'])).toBe('Accept, ORIGIN, user-agent')
    })
    it('should return header unchanged for empty array', () => {
      expect(append('Accept', [])).toBe('Accept')
    })
  })

  describe('when *', () => {
    it('should set value', () => {
      expect(append('', '*')).toBe('*')
    })
    it('should act as if all values already set', () => {
      expect(append('*', 'Origin')).toBe('*')
    })
    it('should erradicate existing values', () => {
      expect(append('Accept, Accept-Encoding', '*')).toBe('*')
    })
    it('should update bad existing header', () => {
      expect(append('Accept, Accept-Encoding, *', 'Origin')).toBe('*')
    })
    it('should handle * in a field list', () => {
      expect(append('Accept', 'Origin, *')).toBe('*')
      expect(append('', 'Accept,*')).toBe('*')
    })
    it('should handle * in a field array', () => {
      expect(append('Accept', ['Origin', '*'])).toBe('*')
    })
  })

  describe('when field is string', () => {
    it('should set value', () => {
      expect(append('', 'Accept')).toBe('Accept')
    })
    it('should set value when vary header', () => {
      expect(append('', 'Accept, Accept-Encoding')).toBe('Accept, Accept-Encoding')
    })
    it('should accept LWS', () => {
      expect(append('', '  Accept     ,     Origin    ')).toBe('Accept, Origin')
    })
    it('should handle contained *', () => {
      expect(append('', 'Accept,*')).toBe('*')
    })
    it('should accept LWS in existing header', () => {
      expect(append('Accept  ,   Origin  ', ['origin', 'User-Agent'])).toBe('Accept  ,   Origin  , User-Agent')
    })
  })

  describe('when field is array', () => {
    it('should set value', () => {
      expect(append('', ['Accept', 'Accept-Language'])).toBe('Accept, Accept-Language')
    })
    it('should ignore double-entries', () => {
      expect(append('', ['Accept', 'Accept'])).toBe('Accept')
    })
    it('should be case-insensitive', () => {
      expect(append('', ['Accept', 'ACCEPT'])).toBe('Accept')
    })
    it('should handle contained *', () => {
      expect(append('', ['Origin', 'User-Agent', '*', 'Accept'])).toBe('*')
    })
    it('should handle existing values', () => {
      expect(append('Accept, Accept-Encoding', ['origin', 'accept', 'accept-charset'])).toBe(
        'Accept, Accept-Encoding, origin, accept-charset'
      )
    })
  })
})

describe('vary(res, field)', () => {
  describe('arguments', () => {
    describe('res', () => {
      it('should be required', () => {
        expect(() => callVary()).toThrow(new TypeError('res argument is required'))
      })
      it('should not allow non-res-like objects', () => {
        expect(() => callVary({}, 'foo')).toThrow(new TypeError('res argument is required'))
        expect(() => callVary({ getHeader: () => undefined }, 'foo')).toThrow(new TypeError('res argument is required'))
        expect(() => callVary({ setHeader: () => undefined }, 'foo')).toThrow(new TypeError('res argument is required'))
      })
    })

    describe('field', () => {
      it('should be required', () => {
        const { res } = createRes()
        expect(() => callVary(res)).toThrow(new TypeError('field argument is required'))
      })
      it('should accept string', () => {
        const { res } = createRes()
        expect(() => vary(res, 'foo')).not.toThrow()
      })
      it('should accept array of string', () => {
        const { res } = createRes()
        expect(() => vary(res, ['foo', 'bar'])).not.toThrow()
      })
      it('should accept string that is Vary header', () => {
        const { res } = createRes()
        expect(() => vary(res, 'foo, bar')).not.toThrow()
      })
      it('should not allow separator ":"', () => {
        const { res } = createRes()
        expect(() => vary(res, 'invalid:header')).toThrow(
          new TypeError('field argument contains an invalid header name')
        )
      })
      it('should not allow separator " "', () => {
        const { res } = createRes()
        expect(() => vary(res, 'invalid header')).toThrow(
          new TypeError('field argument contains an invalid header name')
        )
      })
    })
  })

  describe('when no Vary', () => {
    it('should set value', () => {
      const { res, headers } = createRes()
      vary(res, 'Origin')
      expect(headers.vary).toBe('Origin')
    })
    it('should set value with multiple calls', () => {
      const { res, headers } = createRes()
      vary(res, 'Origin')
      vary(res, 'User-Agent')
      expect(headers.vary).toBe('Origin, User-Agent')
    })
    it('should preserve case', () => {
      const { res, headers } = createRes()
      vary(res, ['ORIGIN', 'user-agent', 'AccepT'])
      expect(headers.vary).toBe('ORIGIN, user-agent, AccepT')
    })
    it('should not set Vary on empty array', () => {
      const { res, headers, setCalls } = createRes()
      vary(res, [])
      expect(headers.vary).toBeUndefined()
      expect(setCalls()).toBe(0)
    })
  })

  describe('when existing Vary', () => {
    it('should set value', () => {
      const { res, headers } = createRes('Accept')
      vary(res, 'Origin')
      expect(headers.vary).toBe('Accept, Origin')
    })
    it('should set value with multiple calls', () => {
      const { res, headers } = createRes('Accept')
      vary(res, 'Origin')
      vary(res, 'User-Agent')
      expect(headers.vary).toBe('Accept, Origin, User-Agent')
    })
    it('should not duplicate existing value', () => {
      const { res, headers } = createRes('Accept')
      vary(res, 'Accept')
      expect(headers.vary).toBe('Accept')
    })
    it('should compare case-insensitive', () => {
      const { res, headers } = createRes('Accept')
      vary(res, 'accEPT')
      expect(headers.vary).toBe('Accept')
    })
    it('should preserve case', () => {
      const { res, headers } = createRes('AccepT')
      vary(res, ['accEPT', 'ORIGIN', 'user-agent'])
      expect(headers.vary).toBe('AccepT, ORIGIN, user-agent')
    })
    it('should leave existing value on empty array', () => {
      const { res, headers } = createRes('Accept')
      vary(res, [])
      expect(headers.vary).toBe('Accept')
    })
    it('should not set empty header on empty array', () => {
      const { res, setCalls } = createRes('')
      vary(res, [])
      expect(setCalls()).toBe(0)
    })
    it('should stringify non-string header values', () => {
      const { res, headers } = createRes(42)
      vary(res, 'Origin')
      expect(headers.vary).toBe('42, Origin')
    })
  })

  describe('when existing Vary as array', () => {
    it('should set value', () => {
      const { res, headers } = createRes(['Accept', 'Accept-Encoding'])
      vary(res, 'Origin')
      expect(headers.vary).toBe('Accept, Accept-Encoding, Origin')
    })
    it('should not duplicate existing value', () => {
      const { res, headers } = createRes(['Accept', 'Accept-Encoding'])
      vary(res, ['accept', 'origin'])
      expect(headers.vary).toBe('Accept, Accept-Encoding, origin')
    })
    it('should set joined value even when unchanged', () => {
      const { res, headers } = createRes(['Accept', 'Accept-Encoding'])
      vary(res, 'Accept')
      expect(headers.vary).toBe('Accept, Accept-Encoding')
    })
  })

  describe('when Vary: *', () => {
    it('should set value', () => {
      const { res, headers } = createRes()
      vary(res, '*')
      expect(headers.vary).toBe('*')
    })
    it('should act as if all values already set', () => {
      const { res, headers } = createRes('*')
      vary(res, ['Origin', 'User-Agent'])
      expect(headers.vary).toBe('*')
    })
    it('should erradicate existing values', () => {
      const { res, headers } = createRes('Accept, Accept-Encoding')
      vary(res, '*')
      expect(headers.vary).toBe('*')
    })
    it('should update bad existing header', () => {
      const { res, headers } = createRes('Accept, Accept-Encoding, *')
      vary(res, 'Origin')
      expect(headers.vary).toBe('*')
    })
  })

  describe('with a real response', () => {
    it('should set the Vary header', async () => {
      const server = runServer((_req, res) => {
        vary(res, 'Origin')
        vary(res, ['Accept', 'origin'])
        res.end()
      })
      await makeFetch(server)('/').expect(200).expectHeader('Vary', 'Origin, Accept')
    })
    it('should append to an array header value', async () => {
      const server = runServer((_req, res) => {
        res.setHeader('Vary', ['Accept', 'Accept-Encoding'])
        vary(res, 'Origin')
        res.end()
      })
      await makeFetch(server)('/').expect(200).expectHeader('Vary', 'Accept, Accept-Encoding, Origin')
    })
    it('should not set Vary on empty array', async () => {
      const server = runServer((_req, res) => {
        vary(res, [])
        res.end()
      })
      await makeFetch(server)('/').expect(200).expectHeader('Vary', null)
    })
  })
})
