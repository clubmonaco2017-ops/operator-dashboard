import { RefreshCw } from 'lucide-react'
import { Section, SubSection } from './Section.jsx'
import {
  DashboardPeriodProvider,
  useDashboardPeriod,
} from './DashboardPeriodProvider.jsx'
import { DateSelector } from './DateSelector.jsx'
import { useDashboardData, useTeamMembershipsMap } from '../../hooks/useDashboardData.js'
import {
  PRODUCTION_CARDS,
  SHIFT_CARDS,
  TEAM_CARDS,
  renderCards,
} from './cardRegistry.jsx'
import { RevenueByHourChart } from './RevenueByHourChart.jsx'
import { TopOperatorsList } from './TopOperatorsList.jsx'
import { HourlyOperatorTable } from './HourlyOperatorTable.jsx'

function SectionAnalyticsInner({ user }) {
  const { period, previousPeriod } = useDashboardPeriod()
  const { rows, operatorMap, loading, error, reload } = useDashboardData({
    from: period.from,
    to: period.to,
  })
  const { rows: prevRows } = useDashboardData({
    from: previousPeriod.from,
    to: previousPeriod.to,
  })
  const { teamMap } = useTeamMembershipsMap(user?.id)

  const cardProps = { rows, prevRows, operatorMap, teamMap, period, loading }

  const productionRendered = renderCards(PRODUCTION_CARDS, user, cardProps)
  const shiftRendered = renderCards(SHIFT_CARDS, user, cardProps)
  const teamRendered = renderCards(TEAM_CARDS, user, cardProps)

  const anyAnalyticsVisible =
    productionRendered.length > 0 || shiftRendered.length > 0 || teamRendered.length > 0

  const actions = (
    <>
      <DateSelector />
      <button
        type="button"
        onClick={reload}
        disabled={loading}
        aria-label="Обновить данные"
        className="p-1.5 rounded-md border border-border text-muted-foreground hover:border-primary hover:text-foreground transition-colors disabled:opacity-50"
      >
        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
      </button>
    </>
  )

  return (
    <Section id="analytics" title="Аналитика периода" actions={actions}>
      {!anyAnalyticsVisible ? (
        <p className="text-sm text-muted-foreground">Нет данных по вашим правам</p>
      ) : (
        <>
          {productionRendered.length > 0 && (
            <SubSection title="Производительность">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{productionRendered}</div>
            </SubSection>
          )}
          {shiftRendered.length > 0 && (
            <SubSection title="По сменам">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{shiftRendered}</div>
            </SubSection>
          )}
          {teamRendered.length > 0 && (
            <SubSection title="По командам">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">{teamRendered}</div>
            </SubSection>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-2">
              <RevenueByHourChart rows={rows} period={period} />
            </div>
            <div>
              <TopOperatorsList rows={rows} operatorMap={operatorMap} period={period} />
            </div>
          </div>
          <HourlyOperatorTable
            rows={rows}
            operatorMap={operatorMap}
            period={period}
            loading={loading}
            error={error}
          />
        </>
      )}
    </Section>
  )
}

export function SectionAnalytics({ user }) {
  return (
    <DashboardPeriodProvider>
      <SectionAnalyticsInner user={user} />
    </DashboardPeriodProvider>
  )
}
