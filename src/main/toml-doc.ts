type Section = { start: number; end: number }

const HEADER = /^\s*\[/

// Comment-preserving TOML line editor. The config file is shared with the
// user's hand edits, so mutations rewrite only the addressed entry and keep
// every other line (comments, spacing, unknown keys) byte-for-byte. `table`
// addresses entries under a `[table]` header; null addresses top-level entries
// before the first table.
export class TomlDoc {
  private lines: string[]

  constructor(raw: string) {
    this.lines = raw.split('\n')
    while (this.lines.length > 0 && this.lines[this.lines.length - 1] === '') this.lines.pop()
  }

  toString(): string {
    return this.lines.join('\n') + '\n'
  }

  get(table: string | null, key: string): string | undefined {
    const index = this.indexOf(table, key)
    return index === -1 ? undefined : unquote(valueOf(this.lines[index]))
  }

  // Booleans compare against the raw text so a quoted string like "true"
  // stays falsy, matching how Codex rejects non-boolean values.
  getBool(table: string, key: string): boolean | undefined {
    const index = this.indexOf(table, key)
    if (index === -1) return undefined
    return valueOf(this.lines[index]).split('#')[0].trim() === 'true'
  }

  set(table: string | null, key: string, value: string | boolean): void {
    const entry = value === true || value === false ? `${key} = ${value}` : `${key} = "${value}"`
    const index = this.indexOf(table, key)
    if (index !== -1) {
      const line = this.lines[index]
      const indent = line.match(/^\s*/)?.[0] ?? ''
      const comment = valueOf(line).match(/^(?:"[^"]*"|'[^']*'|[^#]*?)\s*(#.*)$/)?.[1]
      this.lines[index] = indent + entry + (comment ? ` ${comment}` : '')
      return
    }
    const section =
      table === null
        ? this.topLevelSection()
        : (this.tableSection(table) ?? this.createTable(table))
    // insert after the last non-blank line so entries stay clustered
    let at = section.end
    while (at > section.start && this.lines[at - 1].trim() === '') at--
    this.lines.splice(at, 0, entry)
  }

  delete(table: string | null, key: string): void {
    const index = this.indexOf(table, key)
    if (index !== -1) this.lines.splice(index, 1)
  }

  deleteTable(table: string): void {
    const section = this.tableSection(table)
    if (!section) return
    let start = section.start - 1 // the [table] header line
    while (start > 0 && this.lines[start - 1].trim() === '') start--
    this.lines.splice(start, section.end - start)
  }

  private createTable(table: string): Section {
    // one blank line separates a new table from whatever sits above
    const last = this.lines[this.lines.length - 1]
    if (last !== undefined && last.trim() !== '') this.lines.push('')
    this.lines.push(`[${table}]`)
    return { start: this.lines.length, end: this.lines.length }
  }

  private indexOf(table: string | null, key: string): number {
    const section = table === null ? this.topLevelSection() : this.tableSection(table)
    if (!section) return -1
    const pattern = new RegExp(`^\\s*${key}\\s*=`)
    for (let index = section.start; index < section.end; index++) {
      if (pattern.test(this.lines[index])) return index
    }
    return -1
  }

  private topLevelSection(): Section {
    const end = this.lines.findIndex((line) => HEADER.test(line))
    return { start: 0, end: end === -1 ? this.lines.length : end }
  }

  private tableSection(table: string): Section | null {
    const header = this.lines.findIndex(
      (line) => line.match(/^\s*\[\s*([^\]]+?)\s*\]\s*(#.*)?$/)?.[1] === table
    )
    if (header === -1) return null
    const next = this.lines.findIndex((line, index) => index > header && HEADER.test(line))
    return { start: header + 1, end: next === -1 ? this.lines.length : next }
  }
}

function valueOf(line: string): string {
  return line.slice(line.indexOf('=') + 1).trim()
}

function unquote(value: string): string {
  const match = value.match(/^"([^"]*)"|^'([^']*)'/)
  if (match) return match[1] ?? match[2]
  return value.split('#')[0].trim()
}
