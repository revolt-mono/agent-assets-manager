import { Schema } from 'effect'
import {
  AgentId,
  CONFIG_SCHEMAS,
  Skill,
  SkillBody,
  SkillId,
  UpdateState,
  UsageBucket
} from './ipc-schema'

const empty = Schema.Tuple([])

export const IPC_METHODS = {
  'skills:list': {
    request: Schema.Tuple([AgentId]),
    result: Schema.mutable(Schema.Array(Skill))
  },
  'skills:get': { request: Schema.Tuple([AgentId, SkillId]), result: SkillBody },
  'skills:uninstall': { request: Schema.Tuple([AgentId, SkillId]), result: Schema.Void },
  'skills:open': { request: Schema.Tuple([AgentId, SkillId]), result: Schema.Void },
  'skills:reveal': { request: Schema.Tuple([AgentId, SkillId]), result: Schema.Void },
  'config:claude:get': { request: empty, result: CONFIG_SCHEMAS.claude },
  'config:claude:save': {
    request: Schema.Tuple([CONFIG_SCHEMAS.claude]),
    result: Schema.Void
  },
  'config:codex:get': { request: empty, result: CONFIG_SCHEMAS.codex },
  'config:codex:save': {
    request: Schema.Tuple([CONFIG_SCHEMAS.codex]),
    result: Schema.Void
  },
  'usage:get': {
    request: Schema.Tuple([Schema.Boolean]),
    result: Schema.mutable(Schema.Array(UsageBucket))
  }
} as const

export const IPC_MAIN_EVENTS = {
  'skills:changed': empty,
  'config:changed': Schema.Tuple([AgentId]),
  'update:changed': Schema.Tuple([UpdateState])
} as const

export const IPC_RENDERER_EVENTS = {
  'renderer:ready': empty,
  'update:subscribe': empty,
  'update:proceed': empty
} as const

export type IpcMethodChannel = keyof typeof IPC_METHODS
export type IpcRequest<C extends IpcMethodChannel> = (typeof IPC_METHODS)[C]['request']['Type']
export type IpcResult<C extends IpcMethodChannel> = (typeof IPC_METHODS)[C]['result']['Type']

export type IpcMainEventChannel = keyof typeof IPC_MAIN_EVENTS
export type IpcMainEvent<C extends IpcMainEventChannel> = (typeof IPC_MAIN_EVENTS)[C]['Type']

export type IpcRendererEventChannel = keyof typeof IPC_RENDERER_EVENTS
export type IpcRendererEvent<C extends IpcRendererEventChannel> =
  (typeof IPC_RENDERER_EVENTS)[C]['Type']
