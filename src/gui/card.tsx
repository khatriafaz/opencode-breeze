import { For, Show, createEffect, createSignal } from "solid-js"
import { usePlugin, type MountedSession } from "@opencode/plugin/gui"
import type { Card, Comment, TodoList } from "../rpc"
import type { definition } from "./definition"
import type { Cards } from "./state"

const day = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : undefined

const ago = (iso: string) => {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (minutes < 1) return "now"
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.round(hours / 24)
  return days < 30 ? `${days}d` : (day(iso) ?? "")
}

const duration = (minutes: number) => {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return hours ? (rest ? `${hours}h ${rest}m` : `${hours}h`) : `${rest}m`
}

const overdue = (iso?: string) => !!iso && Date.parse(iso) < Date.now()

export function CardView(props: {
  readonly cards: Cards
  readonly session: MountedSession
  readonly cardID: number
  readonly onConnect: () => void
}) {
  const ctx = usePlugin<typeof definition>()
  const ui = ctx.ui
  const state = () => props.cards.get(props.cardID)
  const card = () => state()?.card

  createEffect(() => void props.cards.ensure(props.session, props.cardID))

  const refresh = () => void props.cards.load(props.session, props.cardID)

  return (
    <div class="breeze">
      <Show when={card()} fallback={<Pending />}>
        {(current) => (
          <>
            <div class="breeze-scroll">
              <Header card={current()} />
              <Show when={state()?.error}>
                <div class="breeze-error">{state()?.error?.message}</div>
              </Show>
              <Facts card={current()} />
              <Section title={ctx.t("card.description")}>
                <Show when={current().description.trim()} fallback={<div class="breeze-muted">{ctx.t("card.empty")}</div>}>
                  <ui.Markdown class="breeze-rich" text={current().description} />
                </Show>
              </Section>
              <Show when={current().todoLists.length > 0}>
                <Section title={ctx.t("card.todos")}>
                  <For each={current().todoLists}>{(list) => <Checklist list={list} />}</For>
                </Section>
              </Show>
              <Section title={`${ctx.t("card.comments")} (${current().comments.length})`}>
                <Show when={current().comments.length > 0} fallback={<div class="breeze-muted">{ctx.t("card.nocomments")}</div>}>
                  <ul class="breeze-comments">
                    <For each={current().comments}>{(comment) => <CommentRow comment={comment} />}</For>
                  </ul>
                </Show>
              </Section>
            </div>
            <Composer />
          </>
        )}
      </Show>
    </div>
  )

  function Pending() {
    return (
      <div class="breeze-scroll">
        <Show when={state()?.error} fallback={<div class="breeze-center"><ui.Loader /></div>}>
          {(error) => (
            <div class="breeze-center">
              <div class="breeze-muted">
                {error().code === "not_connected" ? ctx.t("error.not_connected") : error().message || ctx.t("error.generic")}
              </div>
              <Show
                when={error().code === "not_connected"}
                fallback={<ui.Button variant="neutral" size="small" onClick={refresh}>{ctx.t("card.refresh")}</ui.Button>}
              >
                <ui.Button variant="contrast" size="small" onClick={props.onConnect}>{ctx.t("home.connect")}</ui.Button>
              </Show>
            </div>
          )}
        </Show>
      </div>
    )
  }

  function Header(header: { readonly card: Card }) {
    return (
      <div class="breeze-head" style={header.card.color ? { "--breeze-color": header.card.color } : undefined}>
        <div class="breeze-crumbs">
          <Show when={header.card.project}>
            <span>{header.card.project}</span>
          </Show>
          <Show when={header.card.stage}>
            <span class="breeze-stage">{header.card.stage}</span>
          </Show>
        </div>
        <div class="breeze-title-row">
          <h2 class="breeze-title">{header.card.name || ctx.t("card.untitled", { id: header.card.id })}</h2>
          <div class="breeze-actions">
            <ui.Tooltip value={ctx.t("card.refresh")}>
              <ui.IconButton
                icon="refresh"
                label={ctx.t("card.refresh")}
                variant="ghost-muted"
                size="small"
                busy={state()?.loading}
                onClick={refresh}
              />
            </ui.Tooltip>
            <ui.Tooltip value={ctx.t("card.external")}>
              <ui.IconButton
                icon="outline-arrow-up-right"
                label={ctx.t("card.external")}
                variant="ghost-muted"
                size="small"
                onClick={() => ctx.system.openExternal(header.card.url)}
              />
            </ui.Tooltip>
          </div>
        </div>
      </div>
    )
  }

  function Facts(facts: { readonly card: Card }) {
    const time = () => {
      const { trackedMinutes: tracked, plannedMinutes: planned } = facts.card
      if (!tracked && !planned) return undefined
      return planned
        ? ctx.t("card.time.value", { tracked: duration(tracked), planned: duration(planned) })
        : ctx.t("card.time.tracked", { tracked: duration(tracked) })
    }
    return (
      <dl class="breeze-facts">
        <dt>{ctx.t("card.assignees")}</dt>
        <dd>
          <Show when={facts.card.assignees.length > 0} fallback={<span class="breeze-muted">{ctx.t("card.nobody")}</span>}>
            <span class="breeze-people">
              <For each={facts.card.assignees}>{(person) => <span class="breeze-chip">{person.name}</span>}</For>
            </span>
          </Show>
        </dd>
        <Show when={facts.card.startDate}>
          <dt>{ctx.t("card.start")}</dt>
          <dd>{day(facts.card.startDate)}</dd>
        </Show>
        <Show when={facts.card.dueDate}>
          <dt>{ctx.t("card.due")}</dt>
          <dd classList={{ "breeze-overdue": overdue(facts.card.dueDate) }}>{day(facts.card.dueDate)}</dd>
        </Show>
        <Show when={time()}>
          <dt>{ctx.t("card.time")}</dt>
          <dd>{time()}</dd>
        </Show>
        <Show when={facts.card.tags.length > 0}>
          <dt>{ctx.t("card.tags")}</dt>
          <dd>
            <span class="breeze-people">
              <For each={facts.card.tags}>{(tag) => <span class="breeze-chip breeze-tag">{tag}</span>}</For>
            </span>
          </dd>
        </Show>
        <For each={facts.card.customFields}>
          {(field) => (
            <>
              <dt>{field.name}</dt>
              <dd>{field.value}</dd>
            </>
          )}
        </For>
      </dl>
    )
  }

  function Section(section: { readonly title: string; readonly children: any }) {
    return (
      <section class="breeze-section">
        <div class="breeze-group">{section.title}</div>
        {section.children}
      </section>
    )
  }

  function Checklist(checklist: { readonly list: TodoList }) {
    const done = () => checklist.list.todos.filter((todo) => todo.done).length
    return (
      <div class="breeze-checklist">
        <div class="breeze-checklist-head">
          <span>{checklist.list.name}</span>
          <span class="breeze-muted">
            {done()}/{checklist.list.todos.length}
          </span>
        </div>
        <ul class="breeze-todos">
          <For each={checklist.list.todos}>
            {(todo) => (
              <li class="breeze-todo" classList={{ "breeze-done": todo.done }}>
                <button
                  type="button"
                  class="breeze-check"
                  role="checkbox"
                  aria-checked={todo.done}
                  aria-label={todo.name}
                  onClick={() =>
                    void props.cards
                      .todo(props.session, props.cardID, checklist.list.id, todo.id, !todo.done)
                      .then((ok) => ok || ctx.toast.show({ variant: "error", title: ctx.t("toast.failed") }))
                  }
                >
                  <Show when={todo.done}>
                    <ui.Icon name="check-small" size="small" />
                  </Show>
                </button>
                <span class="breeze-todo-text">{todo.name}</span>
              </li>
            )}
          </For>
        </ul>
      </div>
    )
  }

  function CommentRow(row: { readonly comment: Comment }) {
    return (
      <li class="breeze-comment">
        <div class="breeze-comment-meta">
          <span class="breeze-author">{row.comment.author?.name ?? "—"}</span>
          <span class="breeze-muted">{ago(row.comment.createdAt)}</span>
        </div>
        <ui.Markdown class="breeze-rich" text={row.comment.body} />
      </li>
    )
  }

  function Composer() {
    const [draft, setDraft] = createSignal("")
    const [busy, setBusy] = createSignal(false)
    const post = async () => {
      const text = draft().trim()
      if (!text || busy()) return
      setBusy(true)
      const ok = await props.cards.comment(props.session, props.cardID, text)
      setBusy(false)
      if (!ok) return ctx.toast.show({ variant: "error", title: ctx.t("toast.failed") })
      setDraft("")
      ctx.toast.show({ variant: "success", title: ctx.t("toast.posted"), duration: 2000 })
    }
    return (
      <div class="breeze-composer">
        <textarea
          class="breeze-textarea"
          aria-label={ctx.t("comment.label")}
          placeholder={ctx.t("comment.placeholder")}
          rows={2}
          value={draft()}
          disabled={busy()}
          onInput={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              void post()
            }
          }}
        />
        <ui.Button variant="contrast" size="small" disabled={!draft().trim()} busy={busy()} onClick={() => void post()}>
          {ctx.t("comment.post")}
        </ui.Button>
      </div>
    )
  }
}
