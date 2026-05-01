export function DetailEmptyHint({ error = null }) {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center">
      <p className={error ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
        {error ?? 'Выберите агентство слева'}
      </p>
    </div>
  )
}
