---
"@tinyhttp/res": patch
---

fix: do not modify the options passed to `res.cookie`

`res.cookie` converted `maxAge` from milliseconds to seconds and set `expires`
and `path` on the options object it was given, so reusing one options object
sent a smaller `Max-Age` on every call. The options are now copied before they
are adjusted.
