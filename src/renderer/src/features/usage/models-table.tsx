import { useState } from 'react'
import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
  useTable,
  type Column,
  type SortingState
} from '@tanstack/react-table'
import { ArrowDown02Icon, ArrowUp02Icon, ArrowUpDownIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@renderer/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@renderer/components/ui/table'
import { cn } from '@renderer/lib/utils'
import { compact, usd } from '@renderer/features/usage/format'

export type ModelRow = {
  model: string
  agent: string
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  cost: number
}

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { text: sortFn_text, alphanumeric: sortFn_alphanumeric }
})

function SortButton<TValue>({
  column,
  title,
  align
}: {
  column: Column<typeof features, ModelRow, TValue>
  title: string
  align: 'left' | 'right'
}): React.JSX.Element {
  const sorted = column.getIsSorted()
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn('h-7 px-2 text-xs', align === 'right' ? '-mr-2 ml-auto flex' : '-ml-2')}
      onClick={() => column.toggleSorting(sorted !== 'desc')}
    >
      {title}
      <HugeiconsIcon
        icon={
          sorted === 'desc' ? ArrowDown02Icon : sorted === 'asc' ? ArrowUp02Icon : ArrowUpDownIcon
        }
        strokeWidth={2}
        className="size-3.5 text-muted-foreground"
      />
    </Button>
  )
}

const helper = createColumnHelper<typeof features, ModelRow>()

const numberCell = (value: number): React.JSX.Element => (
  <div className="text-right tabular-nums">{compact.format(value)}</div>
)

const columns = helper.columns([
  helper.accessor('model', {
    header: ({ column }) => <SortButton column={column} title="Model" align="left" />,
    cell: ({ row }) => <span className="font-medium">{row.original.model}</span>
  }),
  helper.accessor('agent', {
    header: ({ column }) => <SortButton column={column} title="Agent" align="left" />,
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.agent}</span>
  }),
  helper.accessor('input', {
    header: ({ column }) => <SortButton column={column} title="Input" align="right" />,
    cell: ({ row }) => numberCell(row.original.input)
  }),
  helper.accessor('cacheRead', {
    header: ({ column }) => <SortButton column={column} title="Cache read" align="right" />,
    cell: ({ row }) => numberCell(row.original.cacheRead)
  }),
  helper.accessor('cacheWrite', {
    header: ({ column }) => <SortButton column={column} title="Cache write" align="right" />,
    cell: ({ row }) => numberCell(row.original.cacheWrite)
  }),
  helper.accessor('output', {
    header: ({ column }) => <SortButton column={column} title="Output" align="right" />,
    cell: ({ row }) => numberCell(row.original.output)
  }),
  helper.accessor('cost', {
    header: ({ column }) => <SortButton column={column} title="Cost" align="right" />,
    cell: ({ row }) => (
      <div className="text-right font-medium tabular-nums">{usd.format(row.original.cost)}</div>
    )
  })
])

export function ModelsTable({ rows }: { rows: ModelRow[] }): React.JSX.Element {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'cost', desc: true }])
  const table = useTable({
    features,
    columns,
    data: rows,
    onSortingChange: setSorting,
    state: { sorting }
  })

  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-16 text-center text-muted-foreground"
              >
                No usage in this period.
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
