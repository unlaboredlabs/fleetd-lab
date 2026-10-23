import { describe, expect, it } from 'vitest'
import { bytes, format, parse } from '../../packages/bytes/src/index'

const kb = 1 << 10
const mb = 1 << 20
const gb = 1 << 30
const tb = 1024 ** 4
const pb = 1024 ** 5

const invalidInputs: unknown[] = [undefined, null, true, false, Number.NaN, () => {}, {}]

describe('format(value, options)', () => {
  it('should return null if input is invalid', () => {
    for (const value of [...invalidInputs, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '', 'string']) {
      expect(format(value as number)).toBeNull()
    }
  })

  it('should convert numbers < 1024 to bytes string', () => {
    expect(format(0)).toBe('0B')
    expect(format(100)).toBe('100B')
    expect(format(-100)).toBe('-100B')
    expect(format(1000)).toBe('1000B')
  })

  it('should convert numbers >= 1024 to KB string', () => {
    expect(format(kb)).toBe('1KB')
    expect(format(-kb)).toBe('-1KB')
    expect(format(2 * kb)).toBe('2KB')
  })

  it('should convert numbers >= 1024^2 to MB string', () => {
    expect(format(mb)).toBe('1MB')
    expect(format(-mb)).toBe('-1MB')
    expect(format(2 * mb)).toBe('2MB')
  })

  it('should convert numbers >= 1024^3 to GB string', () => {
    expect(format(gb)).toBe('1GB')
    expect(format(-gb)).toBe('-1GB')
    expect(format(2 * gb)).toBe('2GB')
  })

  it('should convert numbers >= 1024^4 to TB string', () => {
    expect(format(tb)).toBe('1TB')
    expect(format(-tb)).toBe('-1TB')
    expect(format(2 * tb)).toBe('2TB')
  })

  it('should convert numbers >= 1024^5 to PB string', () => {
    expect(format(pb)).toBe('1PB')
    expect(format(-pb)).toBe('-1PB')
    expect(format(2 * pb)).toBe('2PB')
    expect(format(1024 * pb)).toBe('1024PB')
    expect(format(1024 * pb, { thousandsSeparator: ',' })).toBe('1,024PB')
  })

  it('should return standard case', () => {
    expect(format(10)).toBe('10B')
    expect(format(kb)).toBe('1KB')
    expect(format(mb)).toBe('1MB')
    expect(format(gb)).toBe('1GB')
    expect(format(tb)).toBe('1TB')
    expect(format(pb)).toBe('1PB')
  })

  it('should support custom thousands separator', () => {
    expect(format(1000)).toBe('1000B')
    expect(format(1000, { thousandsSeparator: '' })).toBe('1000B')
    expect(format(1000, { thousandsSeparator: null as unknown as string })).toBe('1000B')
    expect(format(1000, { thousandsSeparator: '.' })).toBe('1.000B')
    expect(format(1000, { thousandsSeparator: ',' })).toBe('1,000B')
    expect(format(1000, { thousandsSeparator: ' ' })).toBe('1 000B')
    expect(format(1005.1005 * kb, { decimalPlaces: 4, thousandsSeparator: '_' })).toBe('1_005.1005KB')
    expect(format(-1234567, { unit: 'b', thousandsSeparator: ',' })).toBe('-1,234,567b')
  })

  it('should support custom unit separator', () => {
    expect(format(1024)).toBe('1KB')
    expect(format(1024, { unitSeparator: '' })).toBe('1KB')
    expect(format(1024, { unitSeparator: null as unknown as string })).toBe('1KB')
    expect(format(1024, { unitSeparator: ' ' })).toBe('1 KB')
    expect(format(1024, { unitSeparator: '\t' })).toBe('1\tKB')
    expect(format(1024 * 1.5, { unitSeparator: ' ' })).toBe('1.5 KB')
  })

  it('should support custom number of decimal places', () => {
    expect(format(kb - 1, { decimalPlaces: 0 })).toBe('1023B')
    expect(format(kb, { decimalPlaces: 0 })).toBe('1KB')
    expect(format(1.4 * kb, { decimalPlaces: 0 })).toBe('1KB')
    expect(format(1.5 * kb, { decimalPlaces: 0 })).toBe('2KB')
    expect(format(kb - 1, { decimalPlaces: 1 })).toBe('1023B')
    expect(format(kb, { decimalPlaces: 1 })).toBe('1KB')
    expect(format(1.04 * kb, { decimalPlaces: 1 })).toBe('1KB')
    expect(format(1.05 * kb, { decimalPlaces: 1 })).toBe('1.1KB')
  })

  it('should round using toFixed and remove trailing zeros', () => {
    expect(format(1.005 * kb)).toBe('1KB')
    expect(format(1.999 * kb)).toBe('2KB')
    expect(format(1.1 * mb)).toBe('1.1MB')
    expect(format(1.101 * mb)).toBe('1.1MB')
    expect(format(1.105 * mb, { decimalPlaces: 3 })).toBe('1.105MB')
    expect(format(1.5)).toBe('1.5B')
    expect(format(0.001)).toBe('0B')
    expect(format(-0.001)).toBe('-0B')
  })

  it('should support fixed decimal places', () => {
    expect(format(kb, { decimalPlaces: 3, fixedDecimals: true })).toBe('1.000KB')
    expect(format(kb, { fixedDecimals: true })).toBe('1.00KB')
    expect(format(1.5 * kb, { fixedDecimals: true })).toBe('1.50KB')
    expect(format(1000, { fixedDecimals: true, thousandsSeparator: ',' })).toBe('1,000.00B')
  })

  it('should support floats', () => {
    expect(format(1.2 * mb)).toBe('1.2MB')
    expect(format(-1.2 * mb)).toBe('-1.2MB')
    expect(format(1.2 * kb)).toBe('1.2KB')
  })

  it('should support custom unit', () => {
    expect(format(12 * mb, { unit: 'b' })).toBe('12582912b')
    expect(format(12 * mb, { unit: 'kb' })).toBe('12288kb')
    expect(format(12 * gb, { unit: 'mb' })).toBe('12288mb')
    expect(format(12 * tb, { unit: 'gb' })).toBe('12288gb')
    expect(format(12 * pb, { unit: 'tb' })).toBe('12288tb')
    expect(format(12 * mb, { unit: 'KB' })).toBe('12288KB')
    expect(format(12 * mb, { unit: 'Kb' })).toBe('12288Kb')
    expect(format(kb, { unit: 'pb' })).toBe('0pb')
    expect(format(1024, { unit: 'b' })).toBe('1024b')
  })

  it('should ignore an empty or unknown unit', () => {
    expect(format(12 * mb, { unit: '' })).toBe('12MB')
    expect(format(12 * mb, { unit: 'bb' })).toBe('12MB')
    expect(format(12 * mb, { unit: 'eb' })).toBe('12MB')
  })
})

describe('parse(value)', () => {
  it('should return null if input is invalid', () => {
    for (const value of invalidInputs) {
      expect(parse(value as string)).toBeNull()
    }
    expect(parse('')).toBeNull()
    expect(parse('string')).toBeNull()
    expect(parse('kb')).toBeNull()
  })

  it('should parse raw number', () => {
    expect(parse(0)).toBe(0)
    expect(parse(-1)).toBe(-1)
    expect(parse(1)).toBe(1)
    expect(parse(10.5)).toBe(10.5)
    expect(parse(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY)
  })

  it('should parse KB', () => {
    expect(parse('1kb')).toBe(kb)
    expect(parse('1KB')).toBe(kb)
    expect(parse('1Kb')).toBe(kb)
    expect(parse('1kB')).toBe(kb)
    expect(parse('0.5kb')).toBe(0.5 * kb)
    expect(parse('0.5KB')).toBe(0.5 * kb)
    expect(parse('1.5kb')).toBe(1.5 * kb)
    expect(parse('1.5KB')).toBe(1.5 * kb)
  })

  it('should parse MB', () => {
    expect(parse('1mb')).toBe(mb)
    expect(parse('1MB')).toBe(mb)
    expect(parse('1Mb')).toBe(mb)
    expect(parse('1mB')).toBe(mb)
    expect(parse('0.5mb')).toBe(0.5 * mb)
    expect(parse('1.5MB')).toBe(1.5 * mb)
  })

  it('should parse GB', () => {
    expect(parse('1gb')).toBe(gb)
    expect(parse('1GB')).toBe(gb)
    expect(parse('1Gb')).toBe(gb)
    expect(parse('1gB')).toBe(gb)
    expect(parse('0.5gb')).toBe(0.5 * gb)
    expect(parse('1.5GB')).toBe(1.5 * gb)
  })

  it('should parse TB', () => {
    expect(parse('1tb')).toBe(tb)
    expect(parse('1TB')).toBe(tb)
    expect(parse('1Tb')).toBe(tb)
    expect(parse('1tB')).toBe(tb)
    expect(parse('0.5tb')).toBe(0.5 * tb)
    expect(parse('1.5TB')).toBe(1.5 * tb)
  })

  it('should parse PB', () => {
    expect(parse('1pb')).toBe(pb)
    expect(parse('1PB')).toBe(pb)
    expect(parse('1Pb')).toBe(pb)
    expect(parse('1pB')).toBe(pb)
    expect(parse('0.5pb')).toBe(0.5 * pb)
    expect(parse('1.5PB')).toBe(1.5 * pb)
  })

  it('should assume bytes when no units', () => {
    expect(parse('0')).toBe(0)
    expect(parse('-1')).toBe(-1)
    expect(parse('1024')).toBe(1024)
    expect(parse('0x11')).toBe(0)
    expect(parse('1.9')).toBe(1)
    expect(parse('  42  ')).toBe(42)
  })

  it('should read other strings with parseInt as bytes', () => {
    expect(parse('1b')).toBe(1)
    expect(parse('1.5b')).toBe(1)
    expect(parse('1 B')).toBe(1)
    expect(parse('10eb')).toBe(10)
    expect(parse('1.kb')).toBe(1)
    expect(parse('.5kb')).toBeNull()
    expect(parse('1kb ')).toBe(1)
    expect(parse(' 1kb')).toBe(1)
  })

  it('should accept negative values', () => {
    expect(parse('-1')).toBe(-1)
    expect(parse('-1024')).toBe(-1024)
    expect(parse('-1mb')).toBe(-mb)
    expect(parse('-1.5TB')).toBe(-1.5 * tb)
    expect(parse('-1.0001kb')).toBe(-1025)
  })

  it('should accept a leading plus sign', () => {
    expect(parse('+1kb')).toBe(kb)
    expect(parse('+1')).toBe(1)
  })

  it('should drop partial bytes', () => {
    expect(parse('1.1b')).toBe(1)
    expect(parse('1.0001kb')).toBe(1024)
    expect(parse('1.0000000000001tb')).toBe(tb)
  })

  it('should allow whitespace between number and unit', () => {
    expect(parse('1 TB')).toBe(tb)
    expect(parse('1 kb')).toBe(kb)
    expect(parse('1   mb')).toBe(mb)
  })
})

describe('bytes(value, options)', () => {
  it('should return null if input is invalid', () => {
    for (const value of invalidInputs) {
      expect(bytes(value)).toBeNull()
    }
  })

  it('should be able to parse a string into a number', () => {
    expect(bytes('1KB')).toBe(kb)
    expect(bytes('1.5 mb')).toBe(1.5 * mb)
    expect(bytes('')).toBeNull()
  })

  it('should convert a number into a string', () => {
    expect(bytes(1024)).toBe('1KB')
    expect(bytes(Number.POSITIVE_INFINITY)).toBeNull()
  })

  it('should convert a number into a string with options', () => {
    expect(bytes(1000, { thousandsSeparator: ' ' })).toBe('1 000B')
    expect(bytes(1024, { unit: 'b', unitSeparator: ' ' })).toBe('1024 b')
  })

  it('should ignore options when parsing a string', () => {
    expect(bytes('1KB', { unit: 'mb' })).toBe(kb)
  })
})
