import { hasPermission } from '../../lib/permissions.js'

import { TotalRevenueCard } from './cards/TotalRevenueCard.jsx'
import { RevenuePerHourCard } from './cards/RevenuePerHourCard.jsx'
import { LeaderCard } from './cards/LeaderCard.jsx'
import { EngagementCard } from './cards/EngagementCard.jsx'
import { ShiftCard } from './cards/ShiftCard.jsx'
import { BestShiftCard } from './cards/BestShiftCard.jsx'
import { TopTeamCard } from './cards/TopTeamCard.jsx'
import { TeamDistributionCard } from './cards/TeamDistributionCard.jsx'
import { TeamEngagementCard } from './cards/TeamEngagementCard.jsx'
import { OverdueAllCard } from './cards/OverdueAllCard.jsx'
import { OverdueOwnCard } from './cards/OverdueOwnCard.jsx'

// Performance group (4 cards)
export const PRODUCTION_CARDS = [
  { id: 'total_revenue', component: TotalRevenueCard, requires: 'view_all_revenue' },
  { id: 'revenue_per_hour', component: RevenuePerHourCard, requires: 'view_all_revenue' },
  { id: 'leader', component: LeaderCard, requires: 'view_all_revenue' },
  { id: 'engagement', component: EngagementCard, requires: 'view_all_revenue' },
]

// Shift group (4 cards)
export const SHIFT_CARDS = [
  { id: 'shift_day', component: ShiftCard, requires: 'view_all_revenue', props: { shift: 'day' } },
  { id: 'shift_evening', component: ShiftCard, requires: 'view_all_revenue', props: { shift: 'evening' } },
  { id: 'shift_night', component: ShiftCard, requires: 'view_all_revenue', props: { shift: 'night' } },
  { id: 'best_shift', component: BestShiftCard, requires: 'view_all_revenue' },
]

// Team group (3 cards)
export const TEAM_CARDS = [
  { id: 'top_team', component: TopTeamCard, requires: 'view_all_revenue' },
  { id: 'team_distribution', component: TeamDistributionCard, requires: 'view_all_revenue' },
  { id: 'team_engagement', component: TeamEngagementCard, requires: 'view_all_revenue' },
]

// Combined analytics (11 cards) — convenience for whole-section iteration
export const ANALYTICS_CARDS = [...PRODUCTION_CARDS, ...SHIFT_CARDS, ...TEAM_CARDS]

// Tasks (2 cards)
export const TASK_CARDS = [
  { id: 'overdue_all', component: OverdueAllCard, requires: 'view_all_tasks' },
  { id: 'overdue_own', component: OverdueOwnCard, requires: 'view_own_tasks' },
]

/**
 * Render a registry filtered by user permissions.
 * Render-time `props` override registry-static `c.props` (spec §3.3).
 */
export function renderCards(registry, user, props = {}) {
  return registry
    .filter((c) => !c.requires || hasPermission(user, c.requires))
    .map((c) => {
      const Component = c.component
      return <Component key={c.id} {...c.props} {...props} />
    })
}
