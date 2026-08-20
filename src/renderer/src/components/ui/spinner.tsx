import { cn } from "@renderer/lib/utils"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { Loading03Icon } from "@hugeicons/core-free-icons"

function Spinner({ icon = Loading03Icon, className, ...props }: Omit<React.ComponentProps<"svg">, "strokeWidth"> & { icon?: IconSvgElement }) {
  return (
    <HugeiconsIcon icon={icon} strokeWidth={2} data-slot="spinner" role="status" aria-label="Loading" className={cn("size-4 animate-spin", className)} {...props} />
  )
}

export { Spinner }
