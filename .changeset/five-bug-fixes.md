---
"@tinyhttp/app": patch
"@tinyhttp/cookie": patch
"@tinyhttp/rate-limit": patch
"@tinyhttp/res": patch
---

- HEAD requests only run GET, HEAD and `all` routes, wherever they were registered
- `req.hostname` (and `getHost`) lowercases the host but no longer percent-decodes it
- `req.protocol` / `req.secure` (and `getProtocol`) report `https` on encrypted connections
- the rate limiter's default key falls back to the socket's remote address when `req.ip` is not set
- `res.cookie` and `cookie.serialize` no longer modify the options object they are given
