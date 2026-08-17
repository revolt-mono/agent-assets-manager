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
import { SkillMarkdown } from '@renderer/components/skill-markdown'
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
import type { Skill, SkillBody } from '@shared/skill'

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
  const [body, setBody] = useState<SkillBody | null>(null)
  const [displayed, setDisplayed] = useState<Skill | null>(skill)
  const [confirmUninstall, setConfirmUninstall] = useState(false)
  const [busy, setBusy] = useState(false)

  const agent = skill?.agent
  const id = skill?.id

  useEffect(() => {
    if (skill) setDisplayed(skill)
  }, [skill])

  useEffect(() => {
    if (!agent || !id) return

    let cancelled = false
    setBody(null)
    window.api.skills
      .get(agent, id)
      .then((next) => {
        if (!cancelled) setBody(next)
      })
      .catch(() => {
        if (!cancelled) toast.add({ title: 'Could not open skill', type: 'error' })
      })

    return () => {
      cancelled = true
    }
  }, [agent, id])

  const current = skill ?? displayed
  const open = skill !== null
  const revealLabel =
    window.electron.process.platform === 'darwin'
      ? 'Reveal in Finder'
      : window.electron.process.platform === 'win32'
        ? 'Show in Explorer'
        : 'Show in folder'

  async function copyMarkdown(): Promise<void> {
    if (!body) return
    await navigator.clipboard.writeText(body.raw)
    toast.add({ title: 'Copied markdown', type: 'success' })
  }

  async function openInEditor(): Promise<void> {
    if (!current) return
    try {
      await window.api.skills.open(current.agent, current.id)
    } catch {
      toast.add({ title: 'Could not open skill', type: 'error' })
    }
  }

  async function uninstall(): Promise<void> {
    if (!current) return
    setBusy(true)
    try {
      await window.api.skills.uninstall(current.agent, current.id)
      setConfirmUninstall(false)
      onClose()
      onUninstalled(current.id)
      toast.add({ title: `Uninstalled ${current.name}`, type: 'success' })
    } catch {
      toast.add({ title: 'Could not uninstall skill', type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose()
        }}
      >
        <DialogContent showCloseButton={false} className="gap-0 overflow-hidden p-6 sm:max-w-lg!">
          {current ? (
            <div className="flex max-h-[min(85vh,40rem)] min-w-0 flex-col">
              <div className="flex shrink-0 items-start justify-between gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                  <HugeiconsIcon icon={CubeIcon} strokeWidth={2} className="size-5" />
                </div>
                <div className="flex items-center gap-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button type="button" variant="ghost" size="icon-sm" aria-label="More" />
                      }
                    >
                      <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-40">
                      <DropdownMenuItem
                        onClick={() => window.api.skills.reveal(current.agent, current.id)}
                      >
                        <HugeiconsIcon icon={FolderOpenIcon} strokeWidth={2} />
                        {revealLabel}
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

              <div className="shrink-0 space-y-1 pt-3">
                <DialogTitle className="text-xl font-semibold tracking-tight">
                  {current.name} <span className="font-normal text-muted-foreground">Skill</span>
                </DialogTitle>
                <DialogDescription className="text-sm/relaxed">
                  {current.description}
                </DialogDescription>
              </div>

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
                <Button
                  type="button"
                  variant="destructive"
                  className="rounded-full"
                  onClick={() => setConfirmUninstall(true)}
                >
                  Uninstall
                </Button>
                <Button type="button" className="shrink-0 rounded-full" onClick={openInEditor}>
                  <HugeiconsIcon icon={File01Icon} strokeWidth={2} />
                  Open in Editor
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmUninstall} onOpenChange={setConfirmUninstall}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Uninstall {current?.name}?</AlertDialogTitle>
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
