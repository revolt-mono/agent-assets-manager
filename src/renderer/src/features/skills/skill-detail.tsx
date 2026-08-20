import { Suspense, use, useState } from 'react'
import {
  Cancel01Icon,
  Copy01Icon,
  CubeIcon,
  File01Icon,
  FolderOpenIcon,
  MoreHorizontalIcon
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@renderer/components/ui/alert-dialog'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@renderer/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { toast } from '@renderer/components/ui/toast'
import { SkillMarkdown } from '@renderer/features/skills/skill-markdown'
import type { Skill, SkillBody } from '@shared/skill'

function lastUpdated(updatedAt: number): string {
  const days = Math.floor((Date.now() - updatedAt) / 86_400_000)
  if (days <= 0) return 'recently'
  return days === 1 ? '1 day ago' : `${days} days ago`
}

const REVEAL_LABEL =
  window.api.platform === 'darwin'
    ? 'Reveal in Finder'
    : window.api.platform === 'win32'
      ? 'Show in Explorer'
      : 'Show in folder'

export type SkillSelection = {
  skill: Skill
  body: Promise<SkillBody | null>
}

type SkillDetailProps = {
  selection: SkillSelection | null
  onClose: () => void
}

export function SkillDetail({ selection, onClose }: SkillDetailProps): React.JSX.Element {
  // The last open selection keeps rendering while the dialog animates closed.
  const [current, setCurrent] = useState(selection)
  if (selection && selection !== current) setCurrent(selection)

  return (
    <Dialog
      open={selection !== null}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[min(85vh,40rem)] flex-col gap-0 overflow-hidden p-6 sm:max-w-lg"
      >
        {current ? (
          <SkillDetailContent
            key={`${current.skill.agent}/${current.skill.id}`}
            selection={current}
            onClose={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function SkillDetailContent({
  selection: { skill, body },
  onClose
}: {
  selection: SkillSelection
  onClose: () => void
}): React.JSX.Element {
  const [confirmUninstall, setConfirmUninstall] = useState(false)
  const [busy, setBusy] = useState(false)

  const copyMarkdown = async (): Promise<void> => {
    try {
      const loaded = await body
      if (!loaded) return
      await navigator.clipboard.writeText(loaded.raw)
      toast.add({ title: 'Copied markdown', type: 'success' })
    } catch {
      toast.add({ title: 'Could not copy', type: 'error' })
    }
  }

  const openInEditor = async (): Promise<void> => {
    try {
      await window.api.skills.open(skill.agent, skill.id)
    } catch {
      toast.add({ title: 'Could not open skill', type: 'error' })
    }
  }

  const uninstall = async (): Promise<void> => {
    setBusy(true)
    try {
      await window.api.skills.uninstall(skill.agent, skill.id)
      setConfirmUninstall(false)
      onClose()
      toast.add({ title: `Uninstalled ${skill.name}`, type: 'success' })
    } catch {
      toast.add({ title: 'Could not uninstall skill', type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="flex shrink-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
            <HugeiconsIcon icon={CubeIcon} strokeWidth={2} className="size-5" />
          </div>
          <div className="min-w-0">
            <DialogTitle className="truncate">{skill.name}</DialogTitle>
            <p className="truncate text-xs text-muted-foreground">
              Last updated {lastUpdated(skill.updatedAt)}.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button type="button" variant="ghost" size="icon-sm" aria-label="More" />}
            >
              <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              <DropdownMenuItem onClick={() => window.api.skills.reveal(skill.agent, skill.id)}>
                <HugeiconsIcon icon={FolderOpenIcon} strokeWidth={2} />
                {REVEAL_LABEL}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={copyMarkdown}>
                <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
                Copy Markdown
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
          </Button>
        </div>
      </div>

      <DialogDescription className="shrink-0 pt-3">{skill.description}</DialogDescription>

      <div className="my-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-muted/60">
        <div className="scroll-fade my-2 min-h-0 flex-1 overflow-y-auto px-4 py-2">
          <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
            <SkillBodyView body={body} />
          </Suspense>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 pt-2">
        <Button type="button" variant="destructive" onClick={() => setConfirmUninstall(true)}>
          Uninstall
        </Button>
        <Button type="button" onClick={openInEditor}>
          <HugeiconsIcon icon={File01Icon} strokeWidth={2} />
          Open in Editor
        </Button>
      </div>

      <AlertDialog open={confirmUninstall} onOpenChange={setConfirmUninstall}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Uninstall {skill.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the skill folder from disk. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={busy} onClick={uninstall}>
              Uninstall
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function SkillBodyView({ body }: { body: Promise<SkillBody | null> }): React.JSX.Element {
  const loaded = use(body)
  if (!loaded) return <p className="text-sm text-muted-foreground">Could not load this skill.</p>
  return <SkillMarkdown source={loaded.markdown} />
}
