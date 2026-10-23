import { type ParsedUrlQuery, parse } from 'node:querystring'

type Regex = {
  keys: string[] | false
  pattern: RegExp
}

export const getURLParams = ({ pattern, keys }: Regex, reqUrl = '/'): URLParams => {
  const matches = pattern.exec(reqUrl)

  const params: URLParams = {}

  if (matches && typeof keys !== 'boolean')
    for (const [i, key] of keys.entries()) {
      const match = matches[i + 1]
      if (match) {
        params[key] = decodeURIComponent(match)
      }
    }

  return params
}

export type URLParams = {
  [key: string]: string
}

const getQueryIndex = (url: string): number => {
  const index = url.indexOf('?')
  return index === -1 ? url.length : index
}

export const getPathname = (url: string): string => url.slice(0, getQueryIndex(url))

export const getQueryParams = (url = '/'): ParsedUrlQuery => parse(url.slice(getQueryIndex(url) + 1))
