import { For, Show, createSignal, onCleanup, onMount } from "solid-js"
import { usePlugin, type IconName } from "@opencode/plugin/gui"
import type { definition } from "./definition"

interface Tool {
  readonly id: string
  readonly label: string
  readonly keys?: string
  readonly icon?: IconName
  readonly text?: string
  readonly run: () => void
}

/** Wraps the selection in inline code, or unwraps it when it already is. */
const code = () => {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return
  const range = selection.getRangeAt(0)
  const parent = range.commonAncestorContainer.parentElement?.closest("code")
  if (parent) {
    parent.replaceWith(document.createTextNode(parent.textContent ?? ""))
    return
  }
  if (range.collapsed) return
  const element = document.createElement("code")
  element.textContent = range.toString()
  range.deleteContents()
  range.insertNode(element)
  selection.collapse(element.nextSibling ?? element, 0)
}

/**
 * A small rich text editor for Breeze comments: bold, italic, strikethrough, inline code, lists, quotes and links.
 * Pasted content arrives as plain text so foreign markup never reaches Breeze. `onSubmit` gets the HTML.
 */
export function RichEditor(props: {
  readonly placeholder: string
  readonly label: string
  readonly busy: boolean
  readonly onSubmit: (html: string) => Promise<boolean>
}) {
  const ctx = usePlugin<typeof definition>()
  const ui = ctx.ui
  let editor!: HTMLDivElement
  const [empty, setEmpty] = createSignal(true)
  const [active, setActive] = createSignal<Record<string, boolean>>({})

  const exec = (command: string, value?: string) => {
    editor.focus()
    document.execCommand(command, false, value)
    sync()
  }

  const link = async () => {
    const selection = window.getSelection()
    const range = selection && selection.rangeCount ? selection.getRangeAt(0).cloneRange() : undefined
    const url = await ctx.dialogs.prompt({ title: ctx.t("editor.link"), placeholder: "https://", submit: ctx.t("editor.link.add") })
    if (!url?.trim()) return
    editor.focus()
    if (range) {
      selection?.removeAllRanges()
      selection?.addRange(range)
    }
    const href = /^[a-z][a-z\d+.-]*:/i.test(url.trim()) ? url.trim() : `https://${url.trim()}`
    if (!range || range.collapsed) document.execCommand("insertHTML", false, `<a href="${escape(href)}">${escape(href)}</a>`)
    else document.execCommand("createLink", false, href)
    sync()
  }

  const tools: Tool[] = [
    { id: "bold", label: ctx.t("editor.bold"), keys: "⌘B", text: "B", run: () => exec("bold") },
    { id: "italic", label: ctx.t("editor.italic"), keys: "⌘I", text: "I", run: () => exec("italic") },
    { id: "strikeThrough", label: ctx.t("editor.strike"), keys: "⌘⇧X", text: "S", run: () => exec("strikeThrough") },
    { id: "code", label: ctx.t("editor.code"), keys: "⌘E", icon: "code", run: () => (editor.focus(), code(), sync()) },
    { id: "insertUnorderedList", label: ctx.t("editor.bullets"), icon: "bullet-list", run: () => exec("insertUnorderedList") },
    { id: "insertOrderedList", label: ctx.t("editor.numbers"), text: "1.", run: () => exec("insertOrderedList") },
    { id: "quote", label: ctx.t("editor.quote"), icon: "outline-quote", run: () => exec("formatBlock", quoted() ? "p" : "blockquote") },
    { id: "link", label: ctx.t("editor.link"), keys: "⌘K", icon: "link", run: () => void link() },
  ]

  const quoted = () => !!window.getSelection()?.anchorNode?.parentElement?.closest("blockquote")

  const sync = () => {
    setEmpty(!editor.textContent?.trim() && !editor.querySelector("img,li"))
    const inside = editor.contains(window.getSelection()?.anchorNode ?? null)
    setActive(
      inside
        ? {
            bold: document.queryCommandState("bold"),
            italic: document.queryCommandState("italic"),
            strikeThrough: document.queryCommandState("strikeThrough"),
            insertUnorderedList: document.queryCommandState("insertUnorderedList"),
            insertOrderedList: document.queryCommandState("insertOrderedList"),
            quote: quoted(),
            code: !!window.getSelection()?.anchorNode?.parentElement?.closest("code"),
          }
        : {},
    )
  }

  const submit = async () => {
    if (empty() || props.busy) return
    const html = clean(editor)
    if (await props.onSubmit(html)) {
      editor.innerHTML = ""
      sync()
    }
  }

  onMount(() => {
    // New lines become paragraphs, as Breeze's own editor writes them.
    document.execCommand("defaultParagraphSeparator", false, "p")
    const selection = () => sync()
    document.addEventListener("selectionchange", selection)
    onCleanup(() => document.removeEventListener("selectionchange", selection))
  })

  return (
    <div class="breeze-editor" classList={{ "breeze-editor-busy": props.busy }}>
      <div class="breeze-toolbar" role="toolbar" aria-label={props.label}>
        <For each={tools}>
          {(tool) => (
            <ui.Tooltip value={tool.keys ? `${tool.label} ${tool.keys}` : tool.label}>
              <button
                type="button"
                class="breeze-tool"
                classList={{ "breeze-tool-on": !!active()[tool.id], [`breeze-tool-${tool.id}`]: true }}
                aria-label={tool.label}
                aria-pressed={!!active()[tool.id]}
                // Keep the editor's selection when the toolbar is clicked.
                onMouseDown={(event) => event.preventDefault()}
                onClick={tool.run}
              >
                <Show when={tool.icon} fallback={tool.text}>
                  {(icon) => <ui.Icon name={icon()} size="small" />}
                </Show>
              </button>
            </ui.Tooltip>
          )}
        </For>
      </div>
      <div
        ref={editor}
        class="breeze-rich breeze-input-rich"
        classList={{ "breeze-empty": empty() }}
        contentEditable={!props.busy}
        role="textbox"
        aria-multiline="true"
        aria-label={props.label}
        data-placeholder={props.placeholder}
        onInput={sync}
        onPaste={(event) => {
          event.preventDefault()
          const text = event.clipboardData?.getData("text/plain") ?? ""
          document.execCommand("insertText", false, text)
        }}
        onKeyDown={(event) => {
          const mod = event.metaKey || event.ctrlKey
          if (!mod) return
          const key = event.key.toLowerCase()
          const run = (action: () => void) => {
            event.preventDefault()
            action()
          }
          if (key === "enter") return run(() => void submit())
          if (key === "k") return run(() => void link())
          if (key === "e") return run(() => (code(), sync()))
          if (key === "x" && event.shiftKey) return run(() => exec("strikeThrough"))
        }}
      />
      <div class="breeze-editor-foot">
        <ui.Button variant="contrast" size="small" disabled={empty()} busy={props.busy} onClick={() => void submit()}>
          {ctx.t("comment.post")}
        </ui.Button>
      </div>
    </div>
  )
}

const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const ALLOWED = new Set(["P", "BR", "B", "STRONG", "I", "EM", "S", "STRIKE", "DEL", "CODE", "UL", "OL", "LI", "BLOCKQUOTE", "A"])

/** The editor's HTML with only the tags the toolbar makes, links limited to http(s) and mailto, and bare text in paragraphs. */
function clean(root: HTMLElement): string {
  const copy = root.cloneNode(true) as HTMLElement
  const walk = (node: Element) => {
    for (const child of [...node.children]) {
      walk(child)
      if (child.tagName === "DIV") {
        const p = document.createElement("p")
        p.append(...child.childNodes)
        child.replaceWith(p)
        continue
      }
      if (!ALLOWED.has(child.tagName)) {
        child.replaceWith(...child.childNodes)
        continue
      }
      const href = child.tagName === "A" ? child.getAttribute("href") ?? "" : ""
      for (const attribute of [...child.attributes]) child.removeAttribute(attribute.name)
      if (child.tagName === "A") {
        if (/^(https?:|mailto:)/i.test(href)) child.setAttribute("href", href)
        else child.replaceWith(...child.childNodes)
      }
    }
  }
  walk(copy)
  // Wrap loose text and inline runs at the top level in paragraphs.
  const blocks = new Set(["P", "UL", "OL", "BLOCKQUOTE"])
  let run: HTMLParagraphElement | undefined
  for (const node of [...copy.childNodes]) {
    if (node instanceof Element && blocks.has(node.tagName)) {
      run = undefined
      continue
    }
    if (!run) {
      run = document.createElement("p")
      copy.insertBefore(run, node)
    }
    run.append(node)
  }
  for (const p of [...copy.querySelectorAll("p")]) if (!p.textContent?.trim() && !p.querySelector("br")) p.remove()
  return copy.innerHTML
}
