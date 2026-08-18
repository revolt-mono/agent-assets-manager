import { Children, isValidElement, memo, useEffect, useRef, useState } from 'react'
import { Copy01Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import Markdown, { type Components } from 'react-markdown'
import { Button } from '@renderer/components/ui/button'
import remarkGfm from 'remark-gfm'

const REMARK_PLUGINS = [remarkGfm]

const COMPONENTS: Components = {
  h1: ({ children }) => <h1 className="text-lg font-semibold tracking-tight">{children}</h1>,
  h2: ({ children }) => <h2 className="text-base font-semibold tracking-tight">{children}</h2>,
  h3: ({ children }) => <h3 className="text-base font-semibold tracking-tight">{children}</h3>,
  ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="underline underline-offset-3 hover:text-foreground"
    >
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rounded-md bg-muted px-1.5 py-0.5 text-[0.8125rem]">{children}</code>
  ),
  pre: ({ children }) => <CodeBlockFromPre>{children}</CodeBlockFromPre>,
  hr: () => <hr className="border-border" />,
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-border px-2 py-1.5 font-semibold">{children}</th>
  ),
  td: ({ children }) => <td className="border-b border-border px-2 py-1.5">{children}</td>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-border pl-3 text-muted-foreground">
      {children}
    </blockquote>
  )
}

export const SkillMarkdown = memo(function SkillMarkdown({
  source
}: {
  source: string
}): React.JSX.Element {
  return (
    <div className="space-y-3 text-sm/relaxed">
      <Markdown remarkPlugins={REMARK_PLUGINS} components={COMPONENTS}>
        {source}
      </Markdown>
    </div>
  )
})

function CodeBlockFromPre({ children }: { children?: React.ReactNode }): React.JSX.Element {
  const child = Children.toArray(children)[0]
  if (!isValidElement<{ className?: string; children?: React.ReactNode }>(child)) {
    return <pre>{children}</pre>
  }
  const lang = /language-([\w-]+)/.exec(child.props.className ?? '')?.[1] ?? ''
  const code = String(child.props.children ?? '').replace(/\n$/, '')
  return <CodeBlock lang={lang} code={code} />
}

function CodeBlock({ lang, code }: { lang: string; code: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const resetTimer = useRef(0)

  useEffect(() => () => window.clearTimeout(resetTimer.current), [])

  async function copy(): Promise<void> {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    window.clearTimeout(resetTimer.current)
    resetTimer.current = window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <div className="overflow-hidden rounded-lg bg-muted">
      <div className="flex items-center justify-between px-3 py-1.5 text-xs text-muted-foreground">
        <span className="capitalize">{lang || 'Code'}</span>
        <Button type="button" size="icon-xs" variant="ghost" onClick={copy}>
          <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} strokeWidth={2} />
          <span className="sr-only">Copy</span>
        </Button>
      </div>
      <pre className="max-w-full overflow-x-auto px-3 pb-3 text-[13px] leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  )
}
