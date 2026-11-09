const LINK = /(https:\/\/\S+)/

/** The distinct https links of a text, in order. */
export function linksIn(text: string): string[] {
  return [...new Set(text.split(LINK).filter((_, i) => i % 2 === 1))]
}

/** A web link, opened apart from the app. */
export function WebLink({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {href}
    </a>
  )
}

/** Plain text with its https links clickable. */
export function LinkedText({ text }: { text: string }) {
  let offset = 0
  return text.split(LINK).map((part, i) => {
    const at = offset
    offset += part.length
    return i % 2 === 1 ? <WebLink key={at} href={part} /> : part
  })
}
