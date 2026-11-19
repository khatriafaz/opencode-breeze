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

export interface Stage {
  id: number
  name: string
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
  stageID?: number
  /** The project's lists, in board order. */
  stages: Stage[]
  /** The project's members, for assigning and mentioning. */
  people: Person[]
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
  /** Your Breeze user id. */
  id?: number
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
    id: { type: "integer" },
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
        properties: {
          ...cardID,
          text: { type: "string", minLength: 1 },
          mentionIDs: { type: "array", items: { type: "integer" } },
        },
        required: ["cardID", "text"],
        additionalProperties: false,
      },
      output: card,
      errors,
    },
    editComment: {
      input: {
        type: "object",
        properties: {
          ...cardID,
          commentID: { type: "integer" },
          text: { type: "string", minLength: 1 },
          mentionIDs: { type: "array", items: { type: "integer" } },
        },
        required: ["cardID", "commentID", "text"],
        additionalProperties: false,
      },
      output: card,
      errors,
    },
    deleteComment: {
      input: {
        type: "object",
        properties: { ...cardID, commentID: { type: "integer" } },
        required: ["cardID", "commentID"],
        additionalProperties: false,
      },
      output: card,
      errors,
    },
    update: {
      input: {
        type: "object",
        properties: {
          ...cardID,
          stageID: { type: "integer" },
          /** `YYYY-MM-DD`, or null to clear. */
          dueDate: { type: ["string", "null"] },
        },
        required: ["cardID"],
        additionalProperties: false,
      },
      output: card,
      errors,
    },
    assign: {
      input: {
        type: "object",
        properties: {
          ...cardID,
          add: { type: "array", items: { type: "string" } },
          remove: { type: "array", items: { type: "integer" } },
        },
        required: ["cardID"],
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
