import { Outlet } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { RailNav } from './RailNav.jsx'
import { AppHeader } from './AppHeader.jsx'

export function AppShell() {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="grid grid-cols-[56px_1fr] grid-rows-[48px_1fr] h-screen">
        <RailNav className="row-span-2" />
        <AppHeader />
        <main className="overflow-hidden">
          <Outlet />
        </main>
      </div>
    </TooltipProvider>
  )
}
