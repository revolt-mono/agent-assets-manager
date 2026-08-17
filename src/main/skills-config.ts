import { normalize } from 'path'

type SkillConfigTable = {
  headerIndex: number
  endIndex: number
  path?: string
  enabled?: boolean
  enabledLine?: number
}

export function applySkillEnabled(text: string, skillFile: string, enabled: boolean): string {
  const { lines, newline } = splitToml(text)
  const target = normalize(skillFile)
  const tables = parseSkillConfigTables(lines)
  const table = tables.find((item) => item.path && normalize(item.path) === target)

  if (table) {
    if (table.enabledLine !== undefined) {
      lines[table.enabledLine] = lines[table.enabledLine].replace(
        /enabled\s*=\s*(true|false)/,
        `enabled = ${enabled}`
      )
    } else {
      lines.splice(table.endIndex, 0, `enabled = ${enabled}`)
    }
    return joinToml(lines, newline, text.endsWith(newline) || text.endsWith('\n'))
  }

  if (enabled) return text

  const block = ['[[skills.config]]', `path = ${JSON.stringify(skillFile)}`, 'enabled = false', '']
  const next = [...lines]
  if (next.length === 1 && next[0] === '') {
    return block.join(newline)
  }
  if (next[next.length - 1] !== '') next.push('')
  if (next.length > 1 && next[next.length - 2] !== '') next.push('')
  next.push(...block)
  return joinToml(next, newline, true)
}

export function disabledSkillPaths(text: string): string[] {
  return parseSkillConfigTables(splitToml(text).lines)
    .filter((table) => table.path && table.enabled === false)
    .map((table) => normalize(table.path as string))
}

function parseSkillConfigTables(lines: string[]): SkillConfigTable[] {
  const tables: SkillConfigTable[] = []
  let index = 0
  while (index < lines.length) {
    if (!isSkillsConfigHeader(lines[index])) {
      index += 1
      continue
    }
    const headerIndex = index
    index += 1
    let path: string | undefined
    let enabled: boolean | undefined
    let enabledLine: number | undefined
    while (index < lines.length && !isTableHeader(lines[index])) {
      const nextPath = parseTomlPath(lines[index])
      if (nextPath) path = nextPath
      const nextEnabled = parseTomlEnabled(lines[index])
      if (nextEnabled !== undefined) {
        enabled = nextEnabled
        enabledLine = index
      }
      index += 1
    }
    tables.push({ headerIndex, endIndex: index, path, enabled, enabledLine })
  }
  return tables
}

function isTableHeader(line: string): boolean {
  return /^\s*\[/.test(line)
}

function isSkillsConfigHeader(line: string): boolean {
  return /^\s*\[\[skills\.config\]\]\s*(#.*)?$/.test(line)
}

function parseTomlPath(line: string): string | undefined {
  const match = line.match(/^\s*path\s*=\s*(?:"([^"]+)"|'([^']+)')\s*(#.*)?$/)
  return match?.[1] ?? match?.[2]
}

function parseTomlEnabled(line: string): boolean | undefined {
  const match = line.match(/^\s*enabled\s*=\s*(true|false)\s*(#.*)?$/)
  if (!match) return undefined
  return match[1] === 'true'
}

function splitToml(text: string): { lines: string[]; newline: string } {
  const newline = text.includes('\r\n') ? '\r\n' : '\n'
  return { lines: text.split(/\r?\n/), newline }
}

function joinToml(lines: string[], newline: string, trailingNewline: boolean): string {
  const body = lines.join(newline)
  if (!trailingNewline) return body
  return body.endsWith(newline) ? body : `${body}${newline}`
}
