import { Fragment } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

export function useDerivedBreadcrumb(pathname) {
  if (pathname === '/') return []
  if (pathname.startsWith('/staff/new')) {
    return [{ label: 'Сотрудники', to: '/staff' }, { label: 'Новый' }]
  }
  if (pathname.startsWith('/staff/')) {
    return [{ label: 'Сотрудники', to: '/staff' }, { label: 'Профиль' }]
  }
  if (pathname === '/staff') return [{ label: 'Сотрудники' }]
  if (pathname.startsWith('/clients')) return [{ label: 'Клиенты' }]
  if (pathname.startsWith('/teams')) return [{ label: 'Команды' }]
  if (pathname.startsWith('/tasks/outbox')) {
    return [{ label: 'Задачи', to: '/tasks' }, { label: 'Исходящие' }]
  }
  if (pathname.startsWith('/tasks/all')) {
    return [{ label: 'Задачи', to: '/tasks' }, { label: 'Все' }]
  }
  if (pathname.startsWith('/tasks')) return [{ label: 'Задачи' }]
  if (pathname.startsWith('/notifications')) return [{ label: 'Оповещения' }]
  return []
}

export function AppHeader() {
  const location = useLocation()
  const crumbs = useDerivedBreadcrumb(location.pathname)

  return (
    <header className="h-12 border-b border-border bg-background flex items-center px-4">
      {crumbs.length > 0 && (
        <Breadcrumb>
          <BreadcrumbList>
            {crumbs.map((crumb, i) => {
              const isLast = i === crumbs.length - 1
              return (
                <Fragment key={crumb.to ?? `${crumb.label}-${i}`}>
                  {i > 0 && <BreadcrumbSeparator />}
                  <BreadcrumbItem>
                    {isLast || !crumb.to ? (
                      <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink href={crumb.to}>{crumb.label}</BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              )
            })}
          </BreadcrumbList>
        </Breadcrumb>
      )}
    </header>
  )
}
