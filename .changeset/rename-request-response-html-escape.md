---
"@tinyhttp/request": major
"@tinyhttp/response": major
"@tinyhttp/html-escape": major
---

Rename the request and response extension packages to `@tinyhttp/request` and `@tinyhttp/response`, along with their header helpers: `requestHeader`, `requestRange`, `isRequestFresh` and `isXhr` in `@tinyhttp/request`; `responseHeader`, `setLinks`, `setVary`, `setLocation` and `formatByAccept` in `@tinyhttp/response`. `escapeHTML` is no longer exported from `@tinyhttp/response` and now lives in the new `@tinyhttp/html-escape` package. No behavior change.
