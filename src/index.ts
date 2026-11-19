import { Plugin } from "@opencode/plugin"
import { Breeze, type Account, type Card, type Comment, type Person, type TodoList } from "./rpc.js"

const API = "https://api.breeze.pm"
const APP = "https://app.breeze.pm"
const INTEGRATION = "breeze"
const ENV = "BREEZE_API_TOKEN"

/** Where a card lives, cached under `card/<id>`: the project the card endpoints need and the team that can see it. */
interface Located {
  projectID: number
  team?: number
}

type Raw = Record<string, any>

export default Plugin.define({
  id: "breeze",
  async setup(ctx) {
    // The token lives in OpenCode's credential store as the "breeze" integration, or in BREEZE_API_TOKEN.
    await ctx.integration
      .transform((editor) => {
        editor.update(INTEGRATION, (integration) => {
          integration.name = "Breeze"
        })
        editor.method.update({ integrationID: INTEGRATION, method: { type: "key", label: "Personal API token" } })
        editor.method.update({ integrationID: INTEGRATION, method: { type: "env", names: [ENV] } })
      })
      .catch(() => {})

    const token = async () => {
      const connection = await ctx.integration.connection.active(INTEGRATION).catch(() => undefined)
      const credential = connection ? await ctx.integration.connection.resolve(connection).catch(() => undefined) : undefined
      if (credential?.type === "key") return credential.key
      return process.env[ENV] || undefined
    }

    const call = async <T = Raw>(
      path: string,
      init: { method?: string; body?: unknown; team?: number; key?: string } = {},
    ): Promise<T> => {
      const key = init.key ?? (await token())
      if (!key) throw new NotConnected()
      const url = new URL(path, API)
      if (init.team) url.searchParams.set("team_id", String(init.team))
      const response = await fetch(url, {
        method: init.method ?? "GET",
        headers: {
          authorization: `Basic ${btoa(`${key}:`)}`,
          accept: "application/json",
          ...(init.body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      })
      if (!response.ok) throw new BreezeError(response.status)
      const text = await response.text()
      return (text ? JSON.parse(text) : undefined) as T
    }

    let me: Promise<Raw> | undefined
    const self = () => (me ??= call("/me.json").catch((error) => ((me = undefined), Promise.reject(error))))
    const teams = async (): Promise<number[]> => {
      const info = await self()
      const list = Array.isArray(info.teams) ? info.teams : []
      return list.map((team: Raw) => Number(team.team_id ?? team.id)).filter((id: number) => id > 0)
    }

    // Accounts in several teams must name the team. Try the default first, then each team, and remember the one that works.
    const located = new Map<number, Located>()
    const locate = async (cardID: number): Promise<{ where: Located; raw: Raw }> => {
      const cached = located.get(cardID) ?? ((await ctx.storage.get(`card/${cardID}`)) as Located | undefined)
      if (cached) {
        const raw = await call(`/projects/${cached.projectID}/cards/${cardID}.json`, { team: cached.team }).catch(
          (error) => (error instanceof BreezeError && error.status === 404 ? undefined : Promise.reject(error)),
        )
        if (raw) return { where: cached, raw }
      }
      const candidates: (number | undefined)[] = [undefined, ...(await teams().catch(() => []))]
      let last: unknown
      for (const team of candidates) {
        try {
          const raw = await call(`/cards/${cardID}.json`, { team })
          const projectID = Number(raw.project_id ?? raw.project?.id)
          if (!projectID) throw new BreezeError(502)
          const where = { projectID, team }
          located.set(cardID, where)
          await ctx.storage.set(`card/${cardID}`, where as never)
          return { where, raw }
        } catch (error) {
          last = error
          if (!(error instanceof BreezeError) || ![403, 404].includes(error.status)) throw error
        }
      }
      throw last
    }

    const person = (raw: Raw | undefined): Person | undefined =>
      raw && raw.id ? { id: raw.id, name: raw.name || raw.email || "Unknown", email: raw.email, avatar: raw.avatar } : undefined

    const load = async (cardID: number): Promise<Card> => {
      const { where, raw } = await locate(cardID)
      const base = `/projects/${where.projectID}/cards/${cardID}`
      const team = where.team
      const [comments, lists, stages, project] = await Promise.all([
        call<Raw[]>(`${base}/comments.json`, { team }).catch(() => []),
        call<Raw[]>(`${base}/todo_lists.json`, { team }).catch(() => undefined),
        call<Raw[]>(`/projects/${where.projectID}/stages.json`, { team }).catch(() => []),
        call(`/projects/${where.projectID}.json`, { team }).catch(() => undefined),
      ])
      const todoLists: TodoList[] = lists
        ? lists.map((list) => ({
            id: list.id,
            name: list.name ?? "",
            todos: (list.todos ?? []).map((todo: Raw) => ({ id: todo.id, name: todo.name ?? "", done: !!todo.done })),
          }))
        : []
      // RPC output must be plain JSON, so drop undefined fields.
      return json<Card>({
        id: cardID,
        projectID: where.projectID,
        url: `${APP}/cards/${cardID}`,
        name: raw.name ?? "",
        description: raw.description ?? "",
        project: project?.name,
        stage: stages.find((stage) => stage.id === raw.stage_id)?.name,
        color: raw.color || undefined,
        startDate: raw.startdate ?? undefined,
        dueDate: raw.duedate ?? undefined,
        plannedMinutes: raw.planned_time ?? 0,
        trackedMinutes: raw.total_tracked ?? 0,
        tags: raw.tags ?? [],
        assignees: (raw.users ?? []).map(person).filter(Boolean) as Person[],
        todoLists,
        comments: comments
          .map(
            (comment): Comment => ({
              id: comment.id,
              body: comment.comment ?? "",
              createdAt: comment.created_at,
              author: person(comment.user),
            }),
          )
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        customFields: (raw.custom_fields ?? [])
          .filter((field: Raw) => field.value !== null && field.value !== "")
          .map((field: Raw) => ({ name: String(field.name), value: String(field.value) })),
        updatedAt: raw.updated_at,
        fetchedAt: Date.now(),
      })
    }

    const account = async (key?: string): Promise<Account> => {
      if (!key && !(await token())) return { connected: false }
      try {
        const info = key ? await call("/me.json", { key }) : await self()
        return { connected: true, name: info.name ?? undefined, email: info.email ?? undefined }
      } catch (error) {
        if (error instanceof BreezeError && error.status === 401)
          return { connected: false, error: "Breeze rejected the token." }
        return { connected: false, error: error instanceof Error ? error.message : String(error) }
      }
    }

    // Maps plugin errors to the RPC contract's typed errors.
    const guard = async <T>(context: { error: (...args: any[]) => any }, run: () => Promise<T>) => {
      try {
        return await run()
      } catch (error) {
        if (error instanceof NotConnected) return context.error("not_connected", error.message, {})
        if (error instanceof BreezeError) return context.error("breeze", error.message, { status: error.status })
        throw error
      }
    }

    const registration = await ctx.rpc.register(Breeze, {
      account: () => account(),
      connect: async (input) => {
        const { token: key } = input as { token: string }
        const result = await account(key.trim())
        if (!result.connected) return result
        await ctx.integration.connect.key({ integrationID: INTEGRATION, key: key.trim() })
        me = undefined
        located.clear()
        await registration.events.emit("connected", result as never)
        return result
      },
      card: (input, context) => guard(context, () => load((input as { cardID: number }).cardID)),
      todo: (input, context) =>
        guard(context, async () => {
          const { cardID, todoListID, todoID, done } = input as {
            cardID: number
            todoListID: number
            todoID: number
            done: boolean
          }
          const { where } = await locate(cardID)
          await call(
            `/projects/${where.projectID}/cards/${cardID}/todo_lists/${todoListID}/todos/${todoID}.json`,
            { method: "PUT", body: { done }, team: where.team },
          )
          return load(cardID)
        }),
      comment: (input, context) =>
        guard(context, async () => {
          const { cardID, text } = input as { cardID: number; text: string }
          const { where } = await locate(cardID)
          await call(`/projects/${where.projectID}/cards/${cardID}/comments.json`, {
            method: "POST",
            body: { comment: text },
            team: where.team,
          })
          return load(cardID)
        }),
    })
  },
})

const json = <T>(value: T): T => JSON.parse(JSON.stringify(value))

class NotConnected extends Error {
  constructor() {
    super("Breeze is not connected. Add your personal API token.")
  }
}

class BreezeError extends Error {
  constructor(readonly status: number) {
    super(
      status === 401
        ? "Breeze rejected the token."
        : status === 404
          ? "Breeze has no such card, or your token cannot see it."
          : `Breeze answered ${status}.`,
    )
  }
}
