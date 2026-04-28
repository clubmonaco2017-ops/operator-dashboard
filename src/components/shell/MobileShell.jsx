import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SectionTitleProvider } from '../../hooks/useSectionTitle.jsx'
import { MobileTopBar } from './MobileTopBar.jsx'
import { MobileBottomNav } from './MobileBottomNav.jsx'
import { MobileNavDrawer } from './MobileNavDrawer.jsx'

/**
 * Root composition for mobile shell. Owns the drawer-open state and
 * closes it automatically on route change so navigation feels native.
 *
 * Layout: grid-rows [auto_1fr_auto] — TopBar / scrollable Outlet /
 * BottomNav. h-screen contains everything within the viewport.
 */
export function MobileShell() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

  return (
    <TooltipProvider delayDuration={300}>
      <SectionTitleProvider>
        <div
          data-slot="mobile-shell"
          className="grid grid-rows-[auto_1fr_auto] h-screen"
        >
          <MobileTopBar onMenuClick={() => setDrawerOpen(true)} />
          <main className="overflow-auto">
            <Outlet />
          </main>
          <MobileBottomNav />
        </div>
        <MobileNavDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
      </SectionTitleProvider>
    </TooltipProvider>
  )
}
