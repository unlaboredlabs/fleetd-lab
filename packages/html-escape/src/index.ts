const matchHtmlRegExp = /["'&<>]/

export function escapeHTML(str: string): string {
  const match = matchHtmlRegExp.exec(str)

  if (!match) {
    // stringify in case input is not a string
    return String(str)
  }

  let escapeChar: string
  let html = ''
  let index = 0
  let lastIndex = 0

  for (index = match.index; index < str.length; index++) {
    switch (str.charCodeAt(index)) {
      case 34: // "
        escapeChar = '&quot;'
        break
      case 38: // &
        escapeChar = '&amp;'
        break
      case 39: // '
        escapeChar = '&#39;'
        break
      case 60: //
        escapeChar = '&lt;'
        break
      case 62: // >
        escapeChar = '&gt;'
        break
      default:
        continue
    }

    if (lastIndex !== index) html += str.substring(lastIndex, index)

    lastIndex = index + 1
    html += escapeChar
  }

  return lastIndex !== index ? html + str.substring(lastIndex, index) : html
}
