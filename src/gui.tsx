import { Match, Switch, onCleanup } from "solid-js"
import { Command, MenuItem, Panel, Plugin, Style, createKeyed, type MountedSession, type PanelTab } from "@opencode/plugin/gui"
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
              <CardView cards={cards} session={props.session} cardID={id()} onConnect={() => void connect(props.session)} />
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
