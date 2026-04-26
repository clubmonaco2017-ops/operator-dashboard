import { Outlet } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { RailNav } from './RailNav.jsx'

export function AppShell() {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="grid grid-cols-[56px_1fr] grid-rows-[1fr] h-screen">
        <RailNav />
        <main className="overflow-auto">
          <Outlet />
        </main>
      </div>
    </TooltipProvider>
  )
}
