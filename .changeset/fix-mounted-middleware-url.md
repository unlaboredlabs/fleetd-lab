---
"@tinyhttp/app": patch
---

fix: match the remaining middleware and routes against the original url after a middleware mounted on a path

A middleware mounted on a path is given the url relative to its mount path, e.g. `app.use('/api', fn)` receives `/me`
for a request to `/api/me`. That url was never restored when the middleware called `next()`, so the rest of the chain
was matched against `/me`: the request was answered by `app.get('/me')` instead of `app.get('/api/me')`, and
middleware registered after the mounted one, such as a guard, was skipped.

- the url and `req.baseUrl` are restored when a mounted middleware calls `next()` without changing `req.url` itself
- the prefix stripped from `req.url` is the part of the raw url the mount path matched, so mount paths with
  percent-encoded params get the right `req.url` and `req.baseUrl`
- when a middleware rewrites `req.url`, the middleware that has not run yet is matched against the new url, so it still
  runs, exactly once, instead of being dropped
