/// <reference types="vite/client" />

import type { RendererApi } from '@shared/skill'

declare global {
  interface Window {
    api: RendererApi
  }
}
