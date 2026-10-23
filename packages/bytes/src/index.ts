const formatThousandsRegExp = /\B(?=(\d{3})+(?!\d))/g

const formatDecimalsRegExp = /(?:\.0*|(\.[^0]+)0+)$/

const map: Record<string, number> = {
  b: 1,
  kb: 1 << 10,
  mb: 1 << 20,
  gb: 1 << 30,
  tb: 1024 ** 4,
  pb: 1024 ** 5
}

const parseRegExp = /^((-|\+)?(\d+(?:\.\d+)?)) *(kb|mb|gb|tb|pb)$/i

export type BytesOptions = {
  /** Maximum number of decimal places to include in output. Default: `2` */
  decimalPlaces?: number
  /** Whether to always display the maximum number of decimal places. Default: `false` */
  fixedDecimals?: boolean
  /** Separator to use between thousands. Default: `''` */
  thousandsSeparator?: string
  /** Unit to force, e.g. `'KB'`. Unknown units are ignored. Default: the largest unit the value reaches */
  unit?: string
  /** Separator between the number and the unit. Default: `''` */
  unitSeparator?: string
}

/**
 * Format the given value in bytes into a string.
 *
 * If the value is negative, it is kept as such. If it is a float, it is rounded.
 */
export const format = (value: number, options?: BytesOptions): string | null => {
  if (!Number.isFinite(value)) return null

  const mag = Math.abs(value)
  const thousandsSeparator = options?.thousandsSeparator || ''
  const unitSeparator = options?.unitSeparator || ''
  const decimalPlaces = options && options.decimalPlaces !== undefined ? options.decimalPlaces : 2
  const fixedDecimals = Boolean(options?.fixedDecimals)
  let unit = options?.unit || ''

  if (!unit || !map[unit.toLowerCase()]) {
    if (mag >= map.pb) unit = 'PB'
    else if (mag >= map.tb) unit = 'TB'
    else if (mag >= map.gb) unit = 'GB'
    else if (mag >= map.mb) unit = 'MB'
    else if (mag >= map.kb) unit = 'KB'
    else unit = 'B'
  }

  const val = value / map[unit.toLowerCase()]
  let str = val.toFixed(decimalPlaces)

  if (!fixedDecimals) str = str.replace(formatDecimalsRegExp, '$1')

  if (thousandsSeparator) {
    str = str
      .split('.')
      .map((s, i) => (i === 0 ? s.replace(formatThousandsRegExp, thousandsSeparator) : s))
      .join('.')
  }

  return str + unitSeparator + unit
}

/**
 * Parse the string value into an integer in bytes.
 *
 * If no unit is given, it is assumed the value is in bytes.
 */
export const parse = (val: string | number): number | null => {
  if (typeof val === 'number' && !Number.isNaN(val)) return val

  if (typeof val !== 'string') return null

  const results = parseRegExp.exec(val)
  let floatValue: number
  let unit = 'b'

  if (!results) {
    floatValue = Number.parseInt(val, 10)
  } else {
    floatValue = Number.parseFloat(results[1])
    unit = results[4].toLowerCase()
  }

  if (Number.isNaN(floatValue)) return null

  return Math.floor(map[unit] * floatValue)
}

/**
 * Convert the given value in bytes into a string, or parse a string to an integer in bytes.
 */
export function bytes(value: string, options?: BytesOptions): number | null
export function bytes(value: number, options?: BytesOptions): string | null
export function bytes(value: unknown, options?: BytesOptions): string | number | null
export function bytes(value: unknown, options?: BytesOptions): string | number | null {
  if (typeof value === 'string') return parse(value)

  if (typeof value === 'number') return format(value, options)

  return null
}
