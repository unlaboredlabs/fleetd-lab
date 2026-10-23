# @tinyhttp/vary

[![npm (scoped)](https://img.shields.io/npm/v/@tinyhttp/vary?style=flat-square)](https://npmjs.com/package/@tinyhttp/vary) [![npm](https://img.shields.io/npm/dt/@tinyhttp/vary?style=flat-square)](https://npmjs.com/package/@tinyhttp/vary)

> A rewrite of [vary](https://github.com/jshttp/vary) module.

Manipulate the HTTP `Vary` header.

## Install

```sh
pnpm i @tinyhttp/vary
```

## API

```js
import { append, vary } from '@tinyhttp/vary'
```

### `vary(res, field)`

Adds the given header `field` to the `Vary` response header of `res`. `field` can be a string of
comma-separated field names or an array of them. Fields already present (compared
case-insensitively) are not added again. If the header or any field is `*`, the header becomes `*`.

```js
vary(res, 'Origin')
vary(res, ['Accept', 'User-Agent'])
```

### `append(header, field)`

Returns `header` with the given `field` added, following the same rules as `vary`. Useful when
the header is not stored on a response object.

```js
append('', 'Origin') // 'Origin'
append('Accept', ['Origin', 'accept']) // 'Accept, Origin'
append('Accept', 'Origin, *') // '*'
```

## Example

```ts
import { App } from '@tinyhttp/app'
import { vary } from '@tinyhttp/vary'

new App()
  .use((req, res) => {
    // about to use req.headers['user-agent']
    vary(res, 'User-Agent')

    const ua = req.headers['user-agent'] || ''
    const isMobile = /mobi|android|touch|mini/i.test(ua)

    res.set('Content-Type', 'text/html').end(isMobile ? 'mobile site' : 'desktop site')
  })
  .listen(3000)
```
