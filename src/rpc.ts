import { Rpc } from "@opencode/plugin/rpc"

export interface Person {
  id: number
  name: string
  email?: string
  avatar?: string
}

export interface Todo {
  id: number
  name: string
  done: boolean
}

export interface TodoList {
  id: number
  name: string
  todos: Todo[]
}

export interface Comment {
  id: number
  /** HTML or plain text, as Breeze stores it. */
  body: string
  createdAt: string
  author?: Person
}

export interface CustomField {
  name: string
  value: string
}

export interface Card {
  id: number
  projectID: number
  url: string
  name: string
  /** HTML or plain text, as Breeze stores it. */
  description: string
  project?: string
  stage?: string
  color?: string
  startDate?: string
  dueDate?: string
  plannedMinutes: number
  trackedMinutes: number
  tags: string[]
  assignees: Person[]
  todoLists: TodoList[]
  comments: Comment[]
  customFields: CustomField[]
  updatedAt?: string
  fetchedAt: number
}

export interface Account {
  connected: boolean
  name?: string
  email?: string
  /** Set when the token was rejected or Breeze could not be reached. */
  error?: string
}

const card = { type: "object" } as const
const account = {
  type: "object",
  properties: {
    connected: { type: "boolean" },
    name: { type: "string" },
    email: { type: "string" },
    error: { type: "string" },
  },
  required: ["connected"],
} as const

const cardID = { cardID: { type: "integer", minimum: 1 } } as const

const failure = {
  type: "object",
  properties: { status: { type: "integer" } },
  required: ["status"],
  additionalProperties: false,
} as const

const errors = { not_connected: { type: "object" }, breeze: failure } as const

export const Breeze = Rpc.define({
  id: "breeze",
  methods: {
    account: {
      input: { type: "object", properties: {}, additionalProperties: false },
      output: account,
    },
    connect: {
      input: {
        type: "object",
        properties: { token: { type: "string", minLength: 1 } },
        required: ["token"],
        additionalProperties: false,
      },
      output: account,
    },
    card: {
      input: { type: "object", properties: cardID, required: ["cardID"], additionalProperties: false },
      output: card,
      errors,
    },
    todo: {
      input: {
        type: "object",
        properties: {
          ...cardID,
          todoListID: { type: "integer" },
          todoID: { type: "integer" },
          done: { type: "boolean" },
        },
        required: ["cardID", "todoListID", "todoID", "done"],
        additionalProperties: false,
      },
      output: card,
      errors,
    },
    comment: {
      input: {
        type: "object",
        properties: { ...cardID, text: { type: "string", minLength: 1 } },
        required: ["cardID", "text"],
        additionalProperties: false,
      },
      output: card,
      errors,
    },
  },
  events: {
    connected: {
      schema: account,
    },
  },
})
