import type { ConfigApi } from './config'
import type { SkillsApi } from './skill'
import type { UpdateApi } from './update'
import type { UsageApi } from './usage'

export type RendererApi = {
  platform: 'darwin' | 'win32' | 'other'
  skills: SkillsApi
  config: ConfigApi
  usage: UsageApi
  update: UpdateApi
}
