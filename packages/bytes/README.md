# @tinyhttp/bytes

[![npm (scoped)](https://img.shields.io/npm/v/@tinyhttp/bytes?style=flat-square)](https://npmjs.com/package/@tinyhttp/bytes) [![npm](https://img.shields.io/npm/dt/@tinyhttp/bytes?style=flat-square)](https://npmjs.com/package/@tinyhttp/bytes)

> A rewrite of [bytes](https://github.com/visionmedia/bytes.js) module.

Format and parse byte sizes. Units are 1024-based: `B`, `KB`, `MB`, `GB`, `TB`, `PB`.

## Install

```sh
pnpm i @tinyhttp/bytes
```

## API

```js
import { bytes, format, parse } from '@tinyhttp/bytes'
```

### `bytes(value, options)`

Parses `value` if it is a string, formats it if it is a number, and returns `null` otherwise.

```js
bytes(1024) // '1KB'
bytes('1KB') // 1024
bytes(1000, { thousandsSeparator: ' ' }) // '1 000B'
```

### `format(value, options)`

Formats a number of bytes as a string. Returns `null` if `value` is not a finite number.

```js
format(1024) // '1KB'
format(1000) // '1000B'
format(1024 * 1.5, { unitSeparator: ' ' }) // '1.5 KB'
format(1000, { thousandsSeparator: ',' }) // '1,000B'
format(1024, { unit: 'b' }) // '1024b'
format(1024, { decimalPlaces: 3, fixedDecimals: true }) // '1.000KB'
```

#### Options

| Property             | Type      | Default | Description                                                                              |
| -------------------- | --------- | ------- | ---------------------------------------------------------------------------------------- |
| `decimalPlaces`      | `number`  | `2`     | Maximum number of decimal places to include in output.                                   |
| `fixedDecimals`      | `boolean` | `false` | Whether to always display the maximum number of decimal places (keeps trailing zeros).   |
| `thousandsSeparator` | `string`  | `''`    | Separator to use between thousands.                                                      |
| `unit`               | `string`  | `''`    | Unit to force (written out as given). Unknown units are ignored and the best one is used. |
| `unitSeparator`      | `string`  | `''`    | Separator between the number and the unit.                                               |

### `parse(value)`

Parses a string into a number of bytes, rounded down. Units are case-insensitive. Strings without a unit are read with
`parseInt` as bytes; numbers are returned as is. Returns `null` if the value cannot be parsed.

```js
parse('1KB') // 1024
parse('1.5 kb') // 1536
parse('-1mb') // -1048576
parse('1024') // 1024
parse(1024) // 1024
```

## License

MIT © [v1rtl](https://v1rtl.site)
