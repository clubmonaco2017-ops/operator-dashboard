import { useIsMobile } from '@/hooks/use-mobile'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { cn } from '@/lib/utils'

/**
 * Responsive slide-out shell.
 *
 * - Mobile (`useIsMobile()` true): vaul Drawer with default behaviour:
 *   drag handle, max-h-80vh, swipe-down dismiss, internal scroll.
 * - Desktop: shadcn Sheet right side, configurable width.
 *
 * Props:
 * - `open`, `onOpenChange` — controlled open state.
 * - `title` — header text (string or ReactNode).
 * - `desktopWidth` — Tailwind class for desktop width (default `sm:max-w-md`).
 * - `footer` — ReactNode rendered in footer (e.g. submit/cancel buttons).
 * - `onKeyDown` — forwarded to content root (for Cmd+Enter handlers).
 * - `children` — form fields / body. Wrap in `<form id="...">` + use
 *   `<button form="..." type="submit">` in footer to preserve native submit.
 */
export function ResponsiveSlideOut({
  open,
  onOpenChange,
  title,
  desktopWidth = 'sm:max-w-md',
  footer,
  onKeyDown,
  children,
}) {
  const isMobile = useIsMobile()

  // Normalize onOpenChange to a single-arg `(open: boolean) => void`.
  // Base UI's Sheet passes `(open, details)` and vaul's Drawer also forwards
  // extra args; consumers shouldn't have to know the difference.
  const handleOpenChange = (next) => {
    onOpenChange?.(next)
  }

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleOpenChange}>
        <DrawerContent onKeyDown={onKeyDown}>
          <DrawerHeader className="border-b border-border px-6 py-4 text-left">
            <DrawerTitle className="text-lg font-bold text-foreground">
              {title}
            </DrawerTitle>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
          {footer && (
            <DrawerFooter className="border-t border-border px-6 py-4">
              {footer}
            </DrawerFooter>
          )}
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        onKeyDown={onKeyDown}
        className={cn('flex w-full flex-col gap-0', desktopWidth)}
      >
        <SheetHeader className="border-b border-border px-6 py-5">
          <SheetTitle className="text-lg font-bold text-foreground">
            {title}
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
        {footer && (
          <SheetFooter className="border-t border-border px-6 py-4">
            {footer}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}
