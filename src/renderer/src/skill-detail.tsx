import { useEffect, useState } from 'react'
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
import { SkillMarkdown } from '@renderer/skill-markdown'
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

type SkillDetailProps = {
  skill: Skill | null
  onClose: () => void
  onUninstalled: (id: string) => void
}

export function SkillDetail({
  skill,
  onClose,
  onUninstalled
}: SkillDetailProps): React.JSX.Element {
  const [current, setCurrent] = useState(skill)
  if (skill && skill !== current) setCurrent(skill)

  return (
    <Dialog
      open={skill !== null}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent showCloseButton={false} className="gap-0 overflow-hidden p-6 sm:max-w-lg!">
        {current ? (
          <SkillDetailContent
            key={`${current.agent}/${current.id}`}
            skill={current}
            onClose={onClose}
            onUninstalled={onUninstalled}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function SkillDetailContent({
  skill,
  onClose,
  onUninstalled
}: {
  skill: Skill
  onClose: () => void
  onUninstalled: (id: string) => void
}): React.JSX.Element {
  const [body, setBody] = useState<SkillBody | null>(null)
  const [confirmUninstall, setConfirmUninstall] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    window.api.skills
      .get(skill.agent, skill.id)
      .then((next) => {
        if (!cancelled) setBody(next)
      })
      .catch(() => {
        if (!cancelled) toast.add({ title: 'Could not open skill', type: 'error' })
      })

    return () => {
      cancelled = true
    }
  }, [skill])

  async function copyMarkdown(): Promise<void> {
    if (!body) return
    await navigator.clipboard.writeText(body.raw)
    toast.add({ title: 'Copied markdown', type: 'success' })
  }

  async function openInEditor(): Promise<void> {
    try {
      await window.api.skills.open(skill.agent, skill.id)
    } catch {
      toast.add({ title: 'Could not open skill', type: 'error' })
    }
  }

  async function uninstall(): Promise<void> {
    setBusy(true)
    try {
      await window.api.skills.uninstall(skill.agent, skill.id)
      setConfirmUninstall(false)
      onUninstalled(skill.id)
      toast.add({ title: `Uninstalled ${skill.name}`, type: 'success' })
    } catch {
      toast.add({ title: 'Could not uninstall skill', type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="flex max-h-[min(85vh,40rem)] min-w-0 flex-col">
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
                <DropdownMenuItem onClick={copyMarkdown} disabled={!body}>
                  <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
                  Copy Markdown
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Close"
              onClick={onClose}
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
            </Button>
          </div>
        </div>

        <DialogDescription className="shrink-0 pt-3">{skill.description}</DialogDescription>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col py-4">
          <div className="min-h-0 flex-1 overflow-hidden rounded-xl bg-muted/60 py-4">
            <div className="scroll-fade h-full overflow-y-auto px-4">
              {body ? (
                <SkillMarkdown source={body.markdown} />
              ) : (
                <p className="text-sm text-muted-foreground">Loading…</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 pt-2">
          <Button type="button" variant="destructive" onClick={() => setConfirmUninstall(true)}>
            Uninstall
          </Button>
          <Button type="button" className="shrink-0" onClick={openInEditor}>
            <HugeiconsIcon icon={File01Icon} strokeWidth={2} />
            Open in Editor
          </Button>
        </div>
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
