import { createSignal } from "solid-js"
import { createStore, produce, reconcile } from "solid-js/store"
import type { MountedSession } from "@opencode/plugin/gui"
import { Breeze, type Account, type Card } from "../rpc"
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

/** Card cache keyed by card id. Cards are the same in every session; the server part holds the token. */
export function createCards() {
  const [cards, setCards] = createStore<Record<number, CardState>>({})
  const [account, setAccount] = createSignal<Account>()

  const run = async (id: number, call: () => Promise<unknown>) => {
    setCards(id, (current) => ({ ...current, loading: true, error: undefined }))
    try {
      const card = (await call()) as Card
      setCards(id, reconcile({ card, loading: false }))
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
    comment: (session: MountedSession, id: number, text: string) =>
      run(id, () => api(session).comment({ cardID: id, text }, where(session))),
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
