# @tinyhttp/html-escape

[![npm (scoped)][npm-badge]](https://npmjs.com/package/@tinyhttp/html-escape) [![npm][dl-badge]](https://npmjs.com/package/@tinyhttp/html-escape) [![][web-badge]](https://tinyhttp.v1rtl.site)

Escape special HTML characters (`"`, `&`, `'`, `<`, `>`) in a string.

## Install

```sh
pnpm i @tinyhttp/html-escape
```

## API

```ts
import { escapeHTML } from '@tinyhttp/html-escape'

escapeHTML('<a href="/">Tom & Jerry</a>') // '&lt;a href=&quot;/&quot;&gt;Tom &amp; Jerry&lt;/a&gt;'
```

### `escapeHTML(str)`

Returns `str` with special HTML characters replaced by their entities. Non-string input is stringified.

[npm-badge]: https://img.shields.io/npm/v/@tinyhttp/html-escape?style=flat-square
[dl-badge]: https://img.shields.io/npm/dt/@tinyhttp/html-escape?style=flat-square
[web-badge]: https://img.shields.io/badge/website-visit-hotpink?style=flat-square
