// Breeze card links come as https://app.breeze.pm/cards/<id> or
// https://app.breeze.pm/projects/<project>[-slug]/cards/<id>[-slug].
const CARD = /https?:\/\/app\.breeze\.pm\/(?:projects\/\d+[^/\s]*\/)?cards\/(\d+)/gi

/** The card id a link points to, or undefined when it is not a Breeze card link. */
export function cardID(href: string): number | undefined {
  CARD.lastIndex = 0
  const match = CARD.exec(href)
  return match ? Number(match[1]) : undefined
}

/** Every card id linked in a text, in order of first appearance. */
export function cardIDs(text: string): number[] {
  const ids = new Set<number>()
  for (const match of text.matchAll(CARD)) ids.add(Number(match[1]))
  return [...ids]
}

export const tabID = (id: number) => `card-${id}`

export const fromTab = (tab: string) => (/^card-(\d+)$/.exec(tab) ? Number(tab.slice(5)) : undefined)
