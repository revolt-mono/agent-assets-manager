import { useState } from 'react'
import { Copy01Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@renderer/components/ui/button'

type Block =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'code'; lang: string; code: string }
  | { type: 'hr' }

export function SkillMarkdown({ source }: { source: string }): React.JSX.Element {
  return (
    <div className="space-y-3 text-sm/relaxed text-foreground">
      {parseBlocks(source).map((block, index) => (
        <BlockView key={index} block={block} />
      ))}
    </div>
  )
}

function BlockView({ block }: { block: Block }): React.JSX.Element {
  if (block.type === 'heading') {
    const Tag = `h${block.level}` as 'h1' | 'h2' | 'h3'
    return (
      <Tag
        className={
          block.level === 1
            ? 'text-lg font-semibold tracking-tight'
            : 'text-base font-semibold tracking-tight'
        }
      >
        <Inline text={block.text} />
      </Tag>
    )
  }

  if (block.type === 'paragraph') {
    return (
      <p>
        <Inline text={block.text} />
      </p>
    )
  }

  if (block.type === 'list') {
    const Tag = block.ordered ? 'ol' : 'ul'
    return (
      <Tag className={block.ordered ? 'list-decimal space-y-1 pl-5' : 'list-disc space-y-1 pl-5'}>
        {block.items.map((item, index) => (
          <li key={index}>
            <Inline text={item} />
          </li>
        ))}
      </Tag>
    )
  }

  if (block.type === 'code') {
    return <CodeBlock lang={block.lang} code={block.code} />
  }

  return <hr className="border-border" />
}

function CodeBlock({ lang, code }: { lang: string; code: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false)

  async function copy(): Promise<void> {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
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

function Inline({ text }: { text: string }): React.JSX.Element {
  const nodes: React.ReactNode[] = []
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g
  let last = 0
  let match: RegExpExecArray | null
  let key = 0

  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index))
    const token = match[0]
    if (token.startsWith('`')) {
      nodes.push(
        <code key={key} className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.8125rem]">
          {token.slice(1, -1)}
        </code>
      )
    } else if (token.startsWith('**')) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>)
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
      if (link) {
        nodes.push(
          <a
            key={key}
            href={link[2]}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-3 hover:text-foreground"
          >
            {link[1]}
          </a>
        )
      }
    }
    key += 1
    last = match.index + token.length
  }

  if (last < text.length) nodes.push(text.slice(last))
  return <>{nodes}</>
}

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    if (line.trim() === '') {
      index += 1
      continue
    }

    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const buf: string[] = []
      index += 1
      while (index < lines.length && !lines[index].startsWith('```')) {
        buf.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push({ type: 'code', lang, code: buf.join('\n') })
      continue
    }

    if (/^---+$/.test(line.trim())) {
      blocks.push({ type: 'hr' })
      index += 1
      continue
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/)
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1].length as 1 | 2 | 3,
        text: heading[2]
      })
      index += 1
      continue
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*]\s+/, ''))
        index += 1
      }
      blocks.push({ type: 'list', ordered: false, items })
      continue
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+\.\s+/, ''))
        index += 1
      }
      blocks.push({ type: 'list', ordered: true, items })
      continue
    }

    const para = [line]
    index += 1
    while (
      index < lines.length &&
      lines[index].trim() !== '' &&
      !/^(#{1,3}\s|```|---+$|\s*[-*]\s+|\s*\d+\.\s+)/.test(lines[index])
    ) {
      para.push(lines[index])
      index += 1
    }
    blocks.push({ type: 'paragraph', text: para.join(' ') })
  }

  return blocks
}
