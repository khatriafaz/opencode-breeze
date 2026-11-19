import { For, Show, createResource, createSignal } from "solid-js"
import { usePlugin, type MountedSession } from "@opencode/plugin/gui"
import type { definition } from "./definition"
import { cardID } from "./links"
import type { Cards } from "./state"

export function HomeView(props: {
  readonly cards: Cards
  readonly session: MountedSession
  readonly open: (id: number) => void
  readonly onConnect: () => void
}) {
  const ctx = usePlugin<typeof definition>()
  const ui = ctx.ui
  const [draft, setDraft] = createSignal("")
  const [found, { refetch }] = createResource(
    () => props.session,
    (session) => props.cards.scan(session).catch(() => [] as number[]),
  )

  void props.cards.refreshAccount(props.session)

  const submit = (value: string) => {
    const text = value.trim()
    const id = cardID(text) ?? (/^\d+$/.test(text) ? Number(text) : undefined)
    if (!id) return
    setDraft("")
    props.open(id)
  }

  return (
    <div class="breeze">
      <div class="breeze-scroll">
        <div class="breeze-account">
          <Show
            when={props.cards.account()?.connected}
            fallback={
              <>
                <div class="breeze-muted">{props.cards.account()?.error ?? ctx.t("home.disconnected")}</div>
                <ui.Button variant="contrast" size="small" onClick={props.onConnect}>
                  {ctx.t("home.connect")}
                </ui.Button>
              </>
            }
          >
            <div>{ctx.t("home.connected", { name: props.cards.account()?.name ?? props.cards.account()?.email ?? "" })}</div>
            <ui.Button variant="ghost-muted" size="small" onClick={props.onConnect}>
              {ctx.t("home.reconnect")}
            </ui.Button>
          </Show>
        </div>

        <section class="breeze-section">
          <div class="breeze-group">{ctx.t("home.open")}</div>
          <div class="breeze-input">
            <ui.TextInput
              label={ctx.t("home.open")}
              placeholder={ctx.t("home.open.placeholder")}
              value={draft()}
              onInput={setDraft}
              onSubmit={submit}
            />
          </div>
        </section>

        <section class="breeze-section">
          <div class="breeze-group-row">
            <div class="breeze-group">{ctx.t("home.found")}</div>
            <ui.IconButton
              icon="refresh"
              label={ctx.t("card.refresh")}
              variant="ghost-muted"
              size="small"
              busy={found.loading}
              onClick={() => void refetch()}
            />
          </div>
          <Show when={(found() ?? []).length > 0} fallback={<div class="breeze-muted">{ctx.t("home.none")}</div>}>
            <ul class="breeze-found">
              <For each={[...(found() ?? [])].reverse()}>
                {(id) => {
                  void props.cards.ensure(props.session, id)
                  const card = () => props.cards.get(id)?.card
                  return (
                    <li>
                      <button type="button" class="breeze-found-row" onClick={() => props.open(id)}>
                        <span class="breeze-found-name">{card()?.name ?? ctx.t("card.untitled", { id })}</span>
                        <span class="breeze-muted">
                          {[card()?.project, card()?.stage].filter(Boolean).join(" · ") || `#${id}`}
                        </span>
                      </button>
                    </li>
                  )
                }}
              </For>
            </ul>
          </Show>
        </section>

        <div class="breeze-muted breeze-hint">{ctx.t("home.hint")}</div>
      </div>
    </div>
  )
}
