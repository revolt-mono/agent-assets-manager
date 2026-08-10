import { useState } from 'react'
import { Button } from '@renderer/components/ui/button'

function App(): React.JSX.Element {
  const [count, setCount] = useState(0)

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Electron + Vite + shadcn</h1>
      <p className="text-sm text-muted-foreground">
        Electron {window.electron.process.versions.electron} · Chromium{' '}
        {window.electron.process.versions.chrome} · Node {window.electron.process.versions.node}
      </p>
      <div className="flex gap-2">
        <Button onClick={() => setCount((c) => c + 1)}>Count is {count}</Button>
        <Button variant="outline" onClick={() => window.electron.ipcRenderer.send('ping')}>
          Send IPC
        </Button>
      </div>
    </div>
  )
}

export default App
