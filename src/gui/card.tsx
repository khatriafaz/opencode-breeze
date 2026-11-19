import { For, Show, createEffect, createSignal, onCleanup } from "solid-js"
import { usePanel, usePlugin, type MountedSession, type SessionScreen } from "@opencode/plugin/gui"
import type { Card, Comment, TodoList } from "../rpc"
import type { definition } from "./definition"
import { RichEditor } from "./editor"
import type { Cards } from "./state"
import { brief } from "./text"

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

/** `YYYY-MM-DD` for a date input, in UTC as Breeze stores dates without a time. */
const dateValue = (iso?: string) => (iso ? iso.slice(0, 10) : "")

const STALE = 60_000

export function CardView(props: {
  readonly cards: Cards
  readonly session: MountedSession
  readonly screen: SessionScreen
  readonly cardID: number
  readonly onConnect: () => void
}) {
  const ctx = usePlugin<typeof definition>()
  const ui = ctx.ui
  const panel = usePanel()
  const state = () => props.cards.get(props.cardID)
  const card = () => state()?.card
  const me = () => props.cards.account()?.id

  createEffect(() => void props.cards.ensure(props.session, props.cardID))

  const refresh = () => void props.cards.load(props.session, props.cardID)

  // Keep a visible card fresh: on showing the tab, on returning to the window, and every two minutes.
  const stale = () => Date.now() - (card()?.fetchedAt ?? Date.now()) > STALE
  createEffect(() => {
    if (panel.visible() && !state()?.loading && stale()) refresh()
  })
  const focus = () => panel.visible() && stale() && refresh()
  window.addEventListener("focus", focus)
  const timer = setInterval(() => panel.visible() && refresh(), 2 * STALE)
  onCleanup(() => {
    window.removeEventListener("focus", focus)
    clearInterval(timer)
  })
  createEffect(() => {
    if (panel.visible() && card()) props.cards.markSeen(props.cardID)
  })

  // Writes report failure in a toast; the card keeps the server's state.
  const write = async (run: () => Promise<boolean>, success?: string) => {
    const ok = await run()
    if (!ok) ctx.toast.show({ variant: "error", title: ctx.t("toast.failed"), description: state()?.error?.message })
    else if (success) ctx.toast.show({ variant: "success", title: success, duration: 2000 })
    return ok
  }

  const send = (current: Card) => {
    props.screen.composer.attach({
      type: "note",
      origin: ctx.id,
      commentID: `breeze-${current.id}-${Date.now()}`,
      label: current.name || ctx.t("card.untitled", { id: current.id }),
      subtitle: "Breeze card",
      icon: "checklist",
      subject: brief(current),
      comment: "",
      href: current.url,
    })
    props.screen.composer.focus()
    ctx.toast.show({ variant: "success", title: ctx.t("card.sent"), duration: 2000 })
  }

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
                    <For each={current().comments}>{(comment) => <CommentRow comment={comment} people={current().people} />}</For>
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
          <Show
            when={header.card.stages.length > 0}
            fallback={
              <Show when={header.card.stage}>
                <span class="breeze-stage">{header.card.stage}</span>
              </Show>
            }
          >
            <span class="breeze-stage-menu">
              <ui.Menu
                label={header.card.stage ?? ctx.t("card.stage")}
                trigger="button"
                icon="chevron-down"
                placement="bottom-start"
                items={[
                  {
                    type: "group",
                    label: ctx.t("card.stage"),
                    items: header.card.stages.map((stage) => ({
                      label: stage.name,
                      icon: stage.id === header.card.stageID ? ("check-small" as const) : undefined,
                      disabled: stage.id === header.card.stageID,
                      onSelect: () =>
                        void write(() => props.cards.update(props.session, props.cardID, { stageID: stage.id })),
                    })),
                  },
                ]}
              />
            </span>
          </Show>
        </div>
        <div class="breeze-title-row">
          <h2 class="breeze-title">{header.card.name || ctx.t("card.untitled", { id: header.card.id })}</h2>
          <div class="breeze-actions">
            <ui.Tooltip value={ctx.t("card.send")}>
              <ui.IconButton
                icon="arrow-up"
                label={ctx.t("card.send")}
                variant="ghost-muted"
                size="small"
                onClick={() => send(header.card)}
              />
            </ui.Tooltip>
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
          <span class="breeze-people">
            <Show when={facts.card.assignees.length > 0} fallback={<span class="breeze-muted">{ctx.t("card.nobody")}</span>}>
              <For each={facts.card.assignees}>
                {(person) => (
                  <span class="breeze-chip breeze-person">
                    {person.name}
                    <button
                      type="button"
                      class="breeze-chip-remove"
                      aria-label={ctx.t("card.unassign", { name: person.name })}
                      onClick={() => void write(() => props.cards.assign(props.session, props.cardID, { remove: [person.id] }))}
                    >
                      <ui.Icon name="close-small" size="small" />
                    </button>
                  </span>
                )}
              </For>
            </Show>
            <ui.Menu
              label={ctx.t("card.assign")}
              icon="plus-small"
              placement="bottom-start"
              items={(() => {
                const assigned = new Set(facts.card.assignees.map((person) => person.id))
                const free = facts.card.people.filter((person) => !assigned.has(person.id) && person.email)
                if (free.length === 0) return [{ label: ctx.t("card.everyone"), disabled: true, onSelect: () => {} }]
                return free.map((person) => ({
                  label: person.name,
                  onSelect: () => void write(() => props.cards.assign(props.session, props.cardID, { add: [person.email!] })),
                }))
              })()}
            />
          </span>
        </dd>
        <Show when={facts.card.startDate}>
          <dt>{ctx.t("card.start")}</dt>
          <dd>{day(facts.card.startDate)}</dd>
        </Show>
        <dt>{ctx.t("card.due")}</dt>
        <dd class="breeze-due" classList={{ "breeze-overdue": overdue(facts.card.dueDate) }}>
          <label class="breeze-date" title={ctx.t("card.due.set")}>
            <span>{day(facts.card.dueDate) ?? ctx.t("card.due.set")}</span>
            <input
              type="date"
              aria-label={ctx.t("card.due.set")}
              value={dateValue(facts.card.dueDate)}
              onChange={(event) => {
                const value = event.currentTarget.value
                if (value && value !== dateValue(facts.card.dueDate))
                  void write(() => props.cards.update(props.session, props.cardID, { dueDate: value }))
              }}
            />
          </label>
          <Show when={facts.card.dueDate}>
            <button
              type="button"
              class="breeze-chip-remove"
              aria-label={ctx.t("card.due.clear")}
              title={ctx.t("card.due.clear")}
              onClick={() => void write(() => props.cards.update(props.session, props.cardID, { dueDate: null }))}
            >
              <ui.Icon name="close-small" size="small" />
            </button>
          </Show>
        </dd>
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
                    void write(() => props.cards.todo(props.session, props.cardID, checklist.list.id, todo.id, !todo.done))
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

  function CommentRow(row: { readonly comment: Comment; readonly people: Card["people"] }) {
    const [editing, setEditing] = createSignal(false)
    const [busy, setBusy] = createSignal(false)
    const mine = () => !!me() && row.comment.author?.id === me()
    const save = async (html: string, mentionIDs: number[]) => {
      setBusy(true)
      const ok = await write(
        () => props.cards.editComment(props.session, props.cardID, row.comment.id, html, mentionIDs),
        ctx.t("comment.edited"),
      )
      setBusy(false)
      if (ok) setEditing(false)
      return ok
    }
    const remove = async () => {
      const confirmed = await ctx.dialogs.confirm({
        title: ctx.t("comment.delete.title"),
        description: ctx.t("comment.delete.description"),
        confirm: ctx.t("comment.delete"),
        danger: true,
      })
      if (confirmed)
        void write(() => props.cards.deleteComment(props.session, props.cardID, row.comment.id), ctx.t("comment.deleted"))
    }
    return (
      <li class="breeze-comment">
        <div class="breeze-comment-meta">
          <span class="breeze-author">{row.comment.author?.name ?? "—"}</span>
          <span class="breeze-muted">{ago(row.comment.createdAt)}</span>
          <Show when={mine() && !editing()}>
            <span class="breeze-comment-menu">
              <ui.Menu
                label={ctx.t("comment.actions")}
                items={[
                  { label: ctx.t("comment.edit"), icon: "edit-small-2", onSelect: () => setEditing(true) },
                  { label: ctx.t("comment.delete"), icon: "outline-trash", onSelect: () => void remove() },
                ]}
              />
            </span>
          </Show>
        </div>
        <Show when={editing()} fallback={<ui.Markdown class="breeze-rich" text={row.comment.body} />}>
          <RichEditor
            label={ctx.t("comment.edit")}
            placeholder={ctx.t("comment.placeholder")}
            busy={busy()}
            people={row.people}
            initial={row.comment.body}
            submit={ctx.t("editor.save")}
            onCancel={() => setEditing(false)}
            onSubmit={save}
          />
        </Show>
      </li>
    )
  }

  function Composer() {
    const [busy, setBusy] = createSignal(false)
    const post = async (html: string, mentionIDs: number[]) => {
      setBusy(true)
      const ok = await write(() => props.cards.comment(props.session, props.cardID, html, mentionIDs), ctx.t("toast.posted"))
      setBusy(false)
      return ok
    }
    return (
      <div class="breeze-composer">
        <RichEditor
          label={ctx.t("comment.label")}
          placeholder={ctx.t("comment.placeholder")}
          busy={busy()}
          people={card()?.people ?? []}
          onSubmit={post}
        />
      </div>
    )
  }
}
