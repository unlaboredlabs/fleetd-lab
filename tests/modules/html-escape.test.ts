import { describe, expect, it } from 'vitest'
import { escapeHTML } from '../../packages/html-escape/src'

/**
 * Taken from https://github.com/component/escape-html/blob/master/test/index.js
 */
describe('escapeHTML', () => {
  it('when string is undefined should return "undefined"', () => {
    expect(escapeHTML(undefined as unknown as string)).toBe('undefined')
  })

  it('when string is null should return "null"', () => {
    expect(escapeHTML(null as unknown as string)).toBe('null')
  })

  it('when string is a number should return stringified number', () => {
    expect(escapeHTML(42 as unknown as string)).toBe('42')
  })

  it('when string is an object should return "[object Object]"', () => {
    expect(escapeHTML({} as string)).toBe('[object Object]')
  })

  describe("when string contains '\"'", () => {
    it('as only character it should replace with "&quot;"', () => {
      expect(escapeHTML('"')).toBe('&quot;')
    })

    it('as first character it should replace with "&quot;"', () => {
      expect(escapeHTML('"bar')).toBe('&quot;bar')
    })

    describe('as last character', () => {
      it('should replace with "&quot;"', () => {
        expect(escapeHTML('foo"')).toBe('foo&quot;')
      })
    })

    describe('as middle character', () => {
      it('should replace with "&quot;"', () => {
        expect(escapeHTML('foo"bar')).toBe('foo&quot;bar')
      })
    })

    describe('multiple times', () => {
      it('should replace all occurrances with "&quot;"', () => {
        expect(escapeHTML('foo""bar')).toBe('foo&quot;&quot;bar')
      })
    })
  })

  describe('when string contains "&"', () => {
    describe('as only character', () => {
      it('should replace with "&amp;"', () => {
        expect(escapeHTML('&')).toBe('&amp;')
      })
    })

    describe('as first character', () => {
      it('should replace with "&amp;"', () => {
        expect(escapeHTML('&bar')).toBe('&amp;bar')
      })
    })

    describe('as last character', () => {
      it('should replace with "&amp;"', () => {
        expect(escapeHTML('foo&')).toBe('foo&amp;')
      })
    })

    describe('as middle character', () => {
      it('should replace with "&amp;"', () => {
        expect(escapeHTML('foo&bar')).toBe('foo&amp;bar')
      })
    })

    describe('multiple times', () => {
      it('should replace all occurrances with "&amp;"', () => {
        expect(escapeHTML('foo&&bar')).toBe('foo&amp;&amp;bar')
      })
    })
  })

  describe('when string contains "\'"', () => {
    describe('as only character', () => {
      it('should replace with "&#39;"', () => {
        expect(escapeHTML("'")).toBe('&#39;')
      })
    })

    describe('as first character', () => {
      it('should replace with "&#39;"', () => {
        expect(escapeHTML("'bar")).toBe('&#39;bar')
      })
    })

    describe('as last character', () => {
      it('should replace with "&#39;"', () => {
        expect(escapeHTML("foo'")).toBe('foo&#39;')
      })
    })

    describe('as middle character', () => {
      it('should replace with "&#39;"', () => {
        expect(escapeHTML("foo'bar")).toBe('foo&#39;bar')
      })
    })

    describe('multiple times', () => {
      it('should replace all occurrances with "&#39;"', () => {
        expect(escapeHTML("foo''bar")).toBe('foo&#39;&#39;bar')
      })
    })
  })

  describe('when string contains "<"', () => {
    describe('as only character', () => {
      it('should replace with "&lt;"', () => {
        expect(escapeHTML('<')).toBe('&lt;')
      })
    })

    describe('as first character', () => {
      it('should replace with "&lt;"', () => {
        expect(escapeHTML('<bar')).toBe('&lt;bar')
      })
    })

    describe('as last character', () => {
      it('should replace with "&lt;"', () => {
        expect(escapeHTML('foo<')).toBe('foo&lt;')
      })
    })

    describe('as middle character', () => {
      it('should replace with "&lt;"', () => {
        expect(escapeHTML('foo<bar')).toBe('foo&lt;bar')
      })
    })

    describe('multiple times', () => {
      it('should replace all occurrances with "&lt;"', () => {
        expect(escapeHTML('foo<<bar')).toBe('foo&lt;&lt;bar')
      })
    })
  })

  describe('when string contains ">"', () => {
    describe('as only character', () => {
      it('should replace with "&gt;"', () => {
        expect(escapeHTML('>')).toBe('&gt;')
      })
    })

    describe('as first character', () => {
      it('should replace with "&gt;"', () => {
        expect(escapeHTML('>bar')).toBe('&gt;bar')
      })
    })

    describe('as last character', () => {
      it('should replace with "&gt;"', () => {
        expect(escapeHTML('foo>')).toBe('foo&gt;')
      })
    })

    describe('as middle character', () => {
      it('should replace with "&gt;"', () => {
        expect(escapeHTML('foo>bar')).toBe('foo&gt;bar')
      })
    })

    describe('multiple times', () => {
      it('should replace all occurrances with "&gt;"', () => {
        expect(escapeHTML('foo>>bar')).toBe('foo&gt;&gt;bar')
      })
    })
  })

  describe('when escaped character mixed', () => {
    it('should escape all occurrances', () => {
      expect(escapeHTML('&foo <> bar "fizz" l\'a')).toBe('&amp;foo &lt;&gt; bar &quot;fizz&quot; l&#39;a')
    })
  })
})
