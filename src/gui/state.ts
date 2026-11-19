import { createSignal } from "solid-js"
import { createStore, produce, reconcile } from "solid-js/store"
import type { MountedSession } from "@opencode/plugin/gui"
import { Breeze, type Account, type Card, type Linked } from "../rpc"
import { cardIDs } from "./links"

export interface CardState {
  card?: Card
  loading: boolean
  /** `not_connected` when there is no token; otherwise Breeze's or the server's message. */
  error?: { code: "not_connected" | "other"; message: string }
}

const api = (session: MountedSession) => session.server.client.rpc(Breeze)
const where = (session: MountedSession) => ({ location: { directory: session.directory } })

const describe = (error: unknown): CardState["error"] => {
  const text = error instanceof Error ? error.message : String(error)
  const raw = JSON.stringify(error, error instanceof Object ? Object.getOwnPropertyNames(error) : undefined) ?? ""
  return { code: raw.includes("not_connected") ? "not_connected" : "other", message: text }
}

const SEEN = "opencode-breeze:seen"

const read = (): Record<number, number> => {
  try {
    return JSON.parse(localStorage.getItem(SEEN) ?? "{}")
  } catch {
    return {}
  }
}

/** Card cache keyed by card id. Cards are the same in every session; the server part holds the token. */
export function createCards() {
  const [cards, setCards] = createStore<Record<number, CardState>>({})
  const [account, setAccount] = createSignal<Account>()
  // Cards linked to each session, by session id.
  const [links, setLinks] = createStore<Record<string, number[]>>({})
  // The newest comment id seen per card, kept across restarts.
  const [seen, setSeen] = createStore<Record<number, number>>(read())

  const run = async (id: number, call: () => Promise<unknown>) => {
    setCards(id, (current) => ({ ...current, loading: true, error: undefined }))
    try {
      const card = (await call()) as Card
      setCards(id, reconcile({ card, loading: false }))
      if (seen[id] === undefined) {
        setSeen(id, Math.max(0, ...card.comments.map((comment) => comment.id)))
        localStorage.setItem(SEEN, JSON.stringify(seen))
      }
      return true
    } catch (error) {
      setCards(id, (current) => ({ card: current?.card, loading: false, error: describe(error) }))
      return false
    }
  }

  return {
    get: (id: number): CardState | undefined => cards[id],
    load: (session: MountedSession, id: number) => run(id, () => api(session).card({ cardID: id }, where(session))),
    /** Loads a card unless it is cached or loading. */
    ensure(session: MountedSession, id: number) {
      const state = cards[id]
      if (!state || (!state.card && !state.loading && state.error?.code !== "not_connected"))
        return run(id, () => api(session).card({ cardID: id }, where(session)))
    },
    todo(session: MountedSession, id: number, todoListID: number, todoID: number, done: boolean) {
      // Tick at once; the server's answer replaces the card.
      setCards(
        id,
        produce((state) => {
          const todo = state.card?.todoLists.find((list) => list.id === todoListID)?.todos.find((t) => t.id === todoID)
          if (todo) todo.done = done
        }),
      )
      return run(id, () => api(session).todo({ cardID: id, todoListID, todoID, done }, where(session)))
    },
    comment: (session: MountedSession, id: number, text: string, mentionIDs: number[]) =>
      run(id, () => api(session).comment({ cardID: id, text, mentionIDs }, where(session))),
    editComment: (session: MountedSession, id: number, commentID: number, text: string, mentionIDs: number[]) =>
      run(id, () => api(session).editComment({ cardID: id, commentID, text, mentionIDs }, where(session))),
    deleteComment: (session: MountedSession, id: number, commentID: number) =>
      run(id, () => api(session).deleteComment({ cardID: id, commentID }, where(session))),
    update: (session: MountedSession, id: number, patch: { stageID?: number; dueDate?: string | null }) =>
      run(id, () => api(session).update({ cardID: id, ...patch }, where(session))),
    assign: (session: MountedSession, id: number, change: { add?: string[]; remove?: number[] }) =>
      run(id, () => api(session).assign({ cardID: id, ...change }, where(session))),
    /** Comments newer than the last ones seen in this card's tab. */
    unseen(id: number) {
      const card = cards[id]?.card
      const last = seen[id]
      if (!card || last === undefined) return 0
      return card.comments.filter((comment) => comment.id > last).length
    },
    /** Marks every loaded comment seen. A card seen for the first time starts with nothing new. */
    markSeen(id: number) {
      const card = cards[id]?.card
      if (!card) return
      const last = Math.max(0, ...card.comments.map((comment) => comment.id))
      if (seen[id] === last) return
      setSeen(id, last)
      localStorage.setItem(SEEN, JSON.stringify(seen))
    },
    /** Card ids linked to the session. */
    linked: (session: { id: string }) => links[session.id] ?? [],
    async loadLinked(session: MountedSession) {
      const result = (await api(session).linked({ sessionID: session.id }, where(session)).catch(() => undefined)) as
        | Linked
        | undefined
      if (result) setLinks(result.sessionID, result.cardIDs)
    },
    async link(session: MountedSession, id: number, linked: boolean) {
      const result = (await api(session).link({ sessionID: session.id, cardID: id, linked }, where(session))) as Linked
      setLinks(result.sessionID, result.cardIDs)
    },
    /** Applies a `linked` event from the server. */
    linkedChanged: (result: Linked) => setLinks(result.sessionID, result.cardIDs),
    account,
    async refreshAccount(session: MountedSession) {
      try {
        setAccount((await api(session).account({}, where(session))) as Account)
      } catch (error) {
        setAccount({ connected: false, error: describe(error)?.message })
      }
    },
    async connect(session: MountedSession, token: string) {
      const result = (await api(session).connect({ token }, where(session))) as Account
      setAccount(result)
      if (result.connected) setCards(reconcile({}))
      return result
    },
    /** Card ids linked anywhere in the session's messages, newest last. */
    async scan(session: MountedSession) {
      const ids = new Set<number>()
      let cursor: string | undefined
      for (let page = 0; page < 10; page++) {
        const result = await session.server.client.message.list({ sessionID: session.id, limit: 100, order: "asc", cursor })
        for (const id of cardIDs(JSON.stringify(result.data))) ids.add(id)
        cursor = result.cursor.next ?? undefined
        if (!cursor) break
      }
      return [...ids]
    },
  }
}

export type Cards = ReturnType<typeof createCards>
