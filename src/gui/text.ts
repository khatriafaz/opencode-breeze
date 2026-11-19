import type { Card } from "../rpc"

const BLOCKS = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "BLOCKQUOTE", "PRE", "TABLE", "TR"])

/** Breeze HTML as readable plain text: paragraphs, "- " list items and "text (url)" links. */
export function plain(html: string): string {
  const root = new DOMParser().parseFromString(html, "text/html").body
  let out = ""
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += (node.textContent ?? "").replace(/\s+/g, " ")
      return
    }
    if (!(node instanceof HTMLElement)) return
    const tag = node.tagName
    if (tag === "BR") {
      out += "\n"
      return
    }
    if (tag === "IMG") {
      out += `[image${node.getAttribute("alt") ? `: ${node.getAttribute("alt")}` : ""}]`
      return
    }
    if (tag === "LI") out += `\n${node.parentElement?.tagName === "OL" ? `${[...node.parentElement.children].indexOf(node) + 1}.` : "-"} `
    if (BLOCKS.has(tag)) out += "\n"
    node.childNodes.forEach(walk)
    if (tag === "A") {
      const href = node.getAttribute("href")
      if (href && href !== node.textContent?.trim()) out += ` (${href})`
    }
    if (BLOCKS.has(tag)) out += "\n"
  }
  walk(root)
  return out
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

const date = (iso?: string) => (iso ? iso.slice(0, 10) : undefined)

/** A card as context for the model. Card text is quoted, since others wrote it. */
export function brief(card: Card): string {
  const facts = [
    card.project && `Project: ${card.project}`,
    card.stage && `List: ${card.stage}`,
    `Assignees: ${card.assignees.map((person) => person.name).join(", ") || "nobody"}`,
    date(card.dueDate) && `Due: ${date(card.dueDate)}`,
    card.tags.length > 0 && `Tags: ${card.tags.join(", ")}`,
    ...card.customFields.map((field) => `${field.name}: ${field.value}`),
  ].filter(Boolean)
  const lines = [`the Breeze card "${card.name}" (${card.url})`, ...facts]
  const description = plain(card.description)
  if (description) lines.push("", "Description:", '"""', description, '"""')
  for (const list of card.todoLists) {
    lines.push("", `Checklist "${list.name}":`)
    for (const todo of list.todos) lines.push(`- [${todo.done ? "x" : " "}] ${todo.name}`)
  }
  const recent = card.comments.slice(-5)
  if (recent.length > 0) {
    lines.push("", `Latest ${recent.length} of ${card.comments.length} comments, oldest first:`)
    for (const comment of recent)
      lines.push(`${comment.author?.name ?? "Someone"} (${date(comment.createdAt)}):`, '"""', plain(comment.body), '"""')
  }
  return lines.join("\n")
}
