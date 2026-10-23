# @tinyhttp/basic-auth

[![npm (scoped)](https://img.shields.io/npm/v/@tinyhttp/basic-auth?style=flat-square)](https://npmjs.com/package/@tinyhttp/basic-auth) [![npm](https://img.shields.io/npm/dt/@tinyhttp/basic-auth?style=flat-square)](https://npmjs.com/package/@tinyhttp/basic-auth)

> A rewrite of [basic-auth](https://github.com/jshttp/basic-auth) module.

HTTP Basic Authorization header parser for Node.js.

## Install

```sh
pnpm i @tinyhttp/basic-auth
```

## API

```js
import { auth, parse } from '@tinyhttp/basic-auth'
```

### `auth(req)`

Get the basic auth credentials from the `Authorization` header of the given request. Returns an object
with `name` and `pass` properties, or `undefined` if the header is missing or malformed.

Throws a `TypeError` if `req` is missing or has no `headers` object.

### `parse(header)`

Parse a basic auth `Authorization` header string. Returns an object with `name` and `pass` properties,
or `undefined` if the string is invalid.

```js
parse('Basic Zm9vOmJhcg==')
// { name: 'foo', pass: 'bar' }
```

## Example

```js
import { App } from '@tinyhttp/app'
import { auth } from '@tinyhttp/basic-auth'

const app = new App()

app.use((req, res) => {
  const credentials = auth(req)

  if (!credentials || credentials.name !== 'john' || credentials.pass !== 'secret') {
    res.status(401).set('WWW-Authenticate', 'Basic realm="example"').send('Access denied')
  } else {
    res.send('Access granted')
  }
})

app.listen(3000)
```
