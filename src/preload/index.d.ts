import { ElectronAPI } from '@electron-toolkit/preload'
import type { SkillsApi } from '../shared/skill'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      skills: SkillsApi
    }
  }
}
