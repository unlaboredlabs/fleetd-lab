# @tinyhttp/statuses

[![npm (scoped)](https://img.shields.io/npm/v/@tinyhttp/statuses?style=flat-square)](https://npmjs.com/package/@tinyhttp/statuses) [![npm](https://img.shields.io/npm/dt/@tinyhttp/statuses?style=flat-square)](https://npmjs.com/package/@tinyhttp/statuses)

HTTP status code utilities for Node.js, derived from `STATUS_CODES` in `node:http`.

## Install

```sh
pnpm i @tinyhttp/statuses
```

## API

```js
import { status, message, code, codes, redirect, empty, retry } from '@tinyhttp/statuses'
```

### `status(code)`

Returns the status code for a number, a string of digits or a status message (case-insensitive).
Throws a `TypeError` if the code or message is unknown.

```js
status(200) // 200
status('404') // 404
status('not found') // 404
status(999) // TypeError: invalid status code: 999
status('foo') // TypeError: invalid status message: "foo"
```

### `message`

Map of status code to message.

```js
message[404] // 'Not Found'
```

### `code`

Map of lowercased status message to code.

```js
code['not found'] // 404
```

### `codes`

Array of every known status code, ascending.

### `redirect`

`true` if the status code is a redirect (300, 301, 302, 303, 305, 307, 308).

```js
redirect[301] // true
redirect[200] // undefined
```

### `empty`

`true` if the status code expects an empty body (204, 205, 304).

### `retry`

`true` if the request should be retried (502, 503, 504).
