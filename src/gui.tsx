import { Match, Show, Switch, createEffect, onCleanup } from "solid-js"
import {
  Command,
  LinkHandler,
  MenuItem,
  Panel,
  Plugin,
  Style,
  createKeyed,
  type MountedSession,
  type PanelTab,
} from "@opencode/plugin/gui"
import { Breeze } from "./rpc"
import { CardView } from "./gui/card"
import { definition } from "./gui/definition"
import { HomeView } from "./gui/home"
import { cardID, fromTab, tabID } from "./gui/links"
import { createCards } from "./gui/state"
import css from "./gui/style.css?inline"

export default Plugin.define({
  ...definition,
  setup(ctx) {
    const cards = createCards()
    const HOME = "home"
    const key = (tab: string) => `${ctx.id}:${tab}`

    ctx.add(Style, css)

    const open = (session: MountedSession, id: number) => {
      void cards.ensure(session, id)
      ctx.layout.open(key(tabID(id)), session, { tab: "select" })
    }

    const connect = async (session: MountedSession) => {
      const token = await ctx.dialogs.prompt({
        title: ctx.t("connect.title"),
        description: ctx.t("connect.description"),
        secret: true,
        submit: ctx.t("connect.submit"),
      })
      if (!token?.trim()) return
      const result = await cards.connect(session, token.trim())
      if (result.connected) ctx.toast.show({ variant: "success", title: ctx.t("toast.connected"), duration: 2000 })
      else ctx.toast.show({ variant: "error", title: result.error ?? ctx.t("error.not_connected") })
    }

    // Your Breeze user id decides which comments you can edit.
    createKeyed(
      () => ctx.sessions.current(),
      (session) => void cards.refreshAccount(session),
      { equals: (a, b) => a.server.client === b.server.client },
    )

    // Restored card tabs load their card, so their titles show the card's name.
    createEffect(() => {
      const session = ctx.sessions.current()
      if (!session) return
      for (const tab of ctx.layout.stored(session)) {
        const id = fromTab(tab)
        if (id) void cards.ensure(session, id)
      }
    })

    // Cards in hidden tabs refresh every five minutes, so their tabs can show new comments.
    const poll = setInterval(() => {
      const session = ctx.sessions.current()
      if (!session || !cards.account()?.connected) return
      for (const tab of ctx.layout.stored(session)) {
        const id = fromTab(tab)
        if (id && ctx.layout.state(key(tab), session) !== "visible") void cards.load(session, id)
      }
    }, 5 * 60_000)
    onCleanup(() => clearInterval(poll))

    // Composer chips from "Send to agent" open their card.
    ctx.add(LinkHandler, {
      match: (link) => link.origin === ctx.id && cardID(link.href) !== undefined,
      open: (link) => {
        const session = ctx.sessions.current()
        const id = cardID(link.href)
        if (session && id) open(session, id)
      },
    })

    // Reload open cards once the token changes, from this window or another.
    createKeyed(
      () => ctx.sessions.current()?.server.client,
      (client) =>
        onCleanup(
          client.rpc(Breeze).events.on("connected", () => {
            const session = ctx.sessions.current()
            if (!session) return
            void cards.refreshAccount(session)
            for (const tab of ctx.layout.stored(session)) {
              const id = fromTab(tab)
              if (id) void cards.load(session, id)
            }
          }),
        ),
    )

    // Breeze card links open in the side panel. The host sends http(s) links to the system browser and gives plugins no
    // hook for them, so take the click first. A modified click (⌘, ctrl, shift, alt) still opens the browser.
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null
      if (!(anchor instanceof HTMLAnchorElement)) return
      const id = cardID(anchor.href)
      const session = ctx.sessions.current()
      if (!id || !session) return
      event.preventDefault()
      event.stopImmediatePropagation()
      open(session, id)
    }
    document.addEventListener("click", click, true)
    onCleanup(() => document.removeEventListener("click", click, true))

    const tabs = new Map<string, PanelTab>()
    const tab = (id: string): PanelTab => {
      const cached = tabs.get(id)
      if (cached) return cached
      const card = fromTab(id)
      const created: PanelTab =
        card === undefined
          ? {
              id,
              get title() {
                return ctx.t("title")
              },
              closable: "compact",
            }
          : {
              id,
              get title() {
                return cards.get(card)?.card?.name || ctx.t("card.untitled", { id: card })
              },
              label: () => (
                <span class="breeze-tab">
                  <span class="breeze-tab-name">{cards.get(card)?.card?.name || ctx.t("card.untitled", { id: card })}</span>
                  <Show when={cards.unseen(card) > 0}>
                    <span class="breeze-dot" title={ctx.plural("card.new", cards.unseen(card))} />
                  </Show>
                </span>
              ),
              closable: "hover",
            }
      tabs.set(id, created)
      return created
    }

    ctx.add(Panel, {
      id: "cards",
      region: "side",
      width: 400,
      mobile: {
        get title() {
          return ctx.t("title")
        },
        order: 55,
        kind: "menu",
        icon: "checklist",
      },
      list: (input) => input.open.filter((id) => id === HOME || fromTab(id) !== undefined).map(tab),
      render: (props) => (
        <Switch>
          <Match when={fromTab(props.tab.id)}>
            {(id) => (
              <CardView
                cards={cards}
                session={props.session}
                screen={props.screen}
                cardID={id()}
                onConnect={() => void connect(props.session)}
              />
            )}
          </Match>
          <Match when={props.tab.id === HOME}>
            <HomeView
              cards={cards}
              session={props.session}
              open={(id) => open(props.session, id)}
              onConnect={() => void connect(props.session)}
            />
          </Match>
        </Switch>
      ),
    })

    ctx.add(
      MenuItem,
      (): MenuItem => {
        const session = ctx.sessions.current()
        return {
          menu: "session.panel",
          id: "open",
          title: ctx.t("title"),
          icon: "checklist",
          opened: !!session && ctx.layout.state(key(HOME), session) !== "closed",
          run: () => {
            if (session) ctx.layout.open(key(HOME), session, { tab: "select" })
          },
        }
      },
    )

    ctx.add(
      Command,
      (): Command => ({
        id: "open",
        title: ctx.t("command.open"),
        group: ctx.t("command.group"),
        keywords: "breeze card task kanban",
        section: "session",
        enabled: !!ctx.sessions.current(),
        run: () => {
          const session = ctx.sessions.current()
          if (session) ctx.layout.open(key(HOME), session, { tab: "select" })
        },
      }),
    )
  },
})
