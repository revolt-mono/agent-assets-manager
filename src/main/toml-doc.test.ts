import { expect, test } from 'vitest'
import { TomlDoc } from './toml-doc'

const RAW = [
  '# hand-written codex config',
  'model = "gpt-5.5"  # pinned',
  'model_reasoning_effort = "low"',
  '',
  '[features] # toggles',
  'apps = true',
  '',
  '[projects."~/repo"]',
  'trust_level = "trusted"',
  ''
].join('\n')

test('set rewrites only the addressed line; every other byte survives', () => {
  const doc = new TomlDoc(RAW)
  doc.set(null, 'model_reasoning_effort', 'high')
  expect(doc.toString()).toBe(
    RAW.replace('model_reasoning_effort = "low"', 'model_reasoning_effort = "high"')
  )
})

test('set keeps the inline comment of the line it rewrites', () => {
  const doc = new TomlDoc(RAW)
  doc.set(null, 'model', 'gpt-5.4')
  expect(doc.toString()).toContain('model = "gpt-5.4" # pinned\n')
})

test('new keys land in their section, before trailing blank lines', () => {
  const doc = new TomlDoc(RAW)
  doc.set('features', 'memories', false)
  doc.set(null, 'model_verbosity', 'high')
  expect(doc.toString()).toContain('apps = true\nmemories = false\n\n[projects."~/repo"]')
  expect(doc.toString()).toContain('model_reasoning_effort = "low"\nmodel_verbosity = "high"\n\n')
})

test('a missing table is appended with a separating blank line', () => {
  const doc = new TomlDoc('model = "gpt-5.5"\n')
  doc.set('features', 'apps', true)
  expect(doc.toString()).toBe('model = "gpt-5.5"\n\n[features]\napps = true\n')
})

test('get unquotes values and drops inline comments outside quotes', () => {
  const doc = new TomlDoc(['key = "a#b" # note', "single = 'x'", 'bare = 8080 # port'].join('\n'))
  expect(doc.get(null, 'key')).toBe('a#b')
  expect(doc.get(null, 'single')).toBe('x')
  expect(doc.get(null, 'bare')).toBe('8080')
  expect(doc.get(null, 'missing')).toBeUndefined()
  expect(doc.get('projects."~/repo"', 'trust_level')).toBeUndefined()
})

test('getBool: bare true is true, quoted "true" and comments are handled', () => {
  const doc = new TomlDoc('[features]\non = true # enabled\nquoted = "true"\noff = false\n')
  expect(doc.getBool('features', 'on')).toBe(true)
  expect(doc.getBool('features', 'quoted')).toBe(false)
  expect(doc.getBool('features', 'off')).toBe(false)
  expect(doc.getBool('features', 'missing')).toBeUndefined()
})

test('deleteTable removes the header, its entries, and preceding blanks', () => {
  const doc = new TomlDoc(RAW)
  doc.deleteTable('features')
  expect(doc.toString()).toBe(
    [
      '# hand-written codex config',
      'model = "gpt-5.5"  # pinned',
      'model_reasoning_effort = "low"',
      '[projects."~/repo"]',
      'trust_level = "trusted"',
      ''
    ].join('\n')
  )
})

test('delete removes a single entry and leaves the rest intact', () => {
  const doc = new TomlDoc(RAW)
  doc.delete('features', 'apps')
  doc.delete('features', 'not-there')
  expect(doc.toString()).toBe(RAW.replace('apps = true\n', ''))
})
