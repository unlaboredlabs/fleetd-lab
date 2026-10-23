---
"@tinyhttp/app": patch
---

Fix `req.protocol` and `req.secure` on HTTPS servers: `getProtocol` now returns `https` when the connection socket is encrypted, without requiring `X-Forwarded-Proto`.
