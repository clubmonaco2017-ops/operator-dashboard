import { useState } from 'react'
import { Calendar, ChevronDown } from 'lucide-react'
import Slider from 'rc-slider'
import 'rc-slider/assets/index.css'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useDashboardPeriod } from './DashboardPeriodProvider.jsx'

const TZ = 'Europe/Kiev'
const PRESETS = [
  { id: 'today', label: 'Сегодня' },
  { id: 'yesterday', label: 'Вчера' },
  { id: 'week', label: 'Неделя' },
  { id: 'month', label: 'Месяц' },
]

function todayStr() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: TZ })
}

function shiftDays(dateStr, deltaDays) {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + deltaDays)
  return d.toISOString().slice(0, 10)
}

function presetToDates(preset) {
  const today = todayStr()
  if (preset === 'today') return { from: today, to: today }
  if (preset === 'yesterday') {
    const y = shiftDays(today, -1)
    return { from: y, to: y }
  }
  if (preset === 'week') return { from: shiftDays(today, -6), to: today }
  if (preset === 'month') return { from: shiftDays(today, -29), to: today }
  return { from: today, to: today }
}

function presetLabel(preset) {
  return PRESETS.find((p) => p.id === preset)?.label ?? 'Период'
}

function rangeText(period) {
  return period.from === period.to ? period.from : `${period.from} — ${period.to}`
}

export function DateSelector() {
  const { period, setPeriod } = useDashboardPeriod()
  const [open, setOpen] = useState(false)

  function handlePreset(preset) {
    const { from, to } = presetToDates(preset)
    setPeriod((p) => ({ ...p, preset, from, to }))
    setOpen(false)
  }

  function handleFrom(e) {
    setPeriod((p) => ({ ...p, preset: 'custom', from: e.target.value }))
  }

  function handleTo(e) {
    setPeriod((p) => ({ ...p, preset: 'custom', to: e.target.value }))
  }

  function handleHours(val) {
    setPeriod((p) => ({ ...p, hours: val }))
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs hover:border-primary transition-colors"
            aria-label={`Период: ${presetLabel(period.preset)}, ${rangeText(period)}`}
          >
            <Calendar size={12} className="text-muted-foreground" />
            <span className="bg-primary text-primary-foreground px-2 py-0.5 rounded-full font-semibold">
              {presetLabel(period.preset)}
            </span>
            <span className="text-muted-foreground">{rangeText(period)}</span>
            <ChevronDown size={12} className="text-muted-foreground" />
          </button>
        }
      />
      <PopoverContent className="w-[400px]" align="end">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Период</p>
            <div className="flex gap-2 flex-wrap">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handlePreset(p.id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    period.preset === p.id
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-foreground hover:border-primary'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Даты</p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={period.from}
                max={period.to}
                onChange={handleFrom}
                className="border border-border rounded-md px-2 py-1 text-xs bg-card text-foreground"
                aria-label="Начало периода"
              />
              <span className="text-muted-foreground text-xs">—</span>
              <input
                type="date"
                value={period.to}
                min={period.from}
                onChange={handleTo}
                className="border border-border rounded-md px-2 py-1 text-xs bg-card text-foreground"
                aria-label="Конец периода"
              />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground">
                Часы: {String(period.hours[0]).padStart(2, '0')}:00 — {String(period.hours[1]).padStart(2, '0')}:00
              </p>
              {(period.hours[0] !== 0 || period.hours[1] !== 23) && (
                <button
                  type="button"
                  onClick={() => handleHours([0, 23])}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Сбросить
                </button>
              )}
            </div>
            <div className="px-1">
              <Slider range min={0} max={23} value={period.hours} onChange={handleHours} />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
