---
"@tinyhttp/request": major
"@tinyhttp/response": major
"@tinyhttp/html-escape": major
"@tinyhttp/app": patch
---

Breaking rename: the request and response extension packages are now published as `@tinyhttp/request` and `@tinyhttp/response`, and `escapeHTML` moved into a new `@tinyhttp/html-escape` package.

`@tinyhttp/request` helpers are now named `requestHeader`, `requestRange`, `isRequestFresh` and `isXhr`.

`@tinyhttp/response` helpers are now named `responseHeader`, `setLinks`, `setVary`, `setLocation` and `formatByAccept`. `escapeHTML` is no longer exported from `@tinyhttp/response`; import it from `@tinyhttp/html-escape` instead.

`@tinyhttp/app` now depends on the renamed packages. Behavior is unchanged.
