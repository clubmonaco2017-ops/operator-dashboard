import { pluralizePhotos, pluralizeVideos } from '../../lib/clients.js'

/**
 * Visual overlay поверх gallery при drag-and-drop файлов с системы.
 *
 * @param {object} props
 * @param {number} props.fileCount
 * @param {'photo'|'video'} props.type
 * @param {boolean} [props.reject] — true если файлы не подходят (формат/размер)
 * @param {string} [props.rejectMessage]
 */
export function DropOverlay({ fileCount, type, reject = false, rejectMessage }) {
  const limits =
    type === 'video'
      ? 'MP4 · WEBM · MOV (H.264) · до 500 МБ каждое'
      : 'JPG · PNG · WEBP · до 25 МБ каждое'
  const countText = type === 'video' ? pluralizeVideos(fileCount) : pluralizePhotos(fileCount)

  return (
    <div
      className={[
        'pointer-events-none absolute inset-0 z-40 flex items-center justify-center rounded-xl border-2 border-dashed transition-colors',
        reject
          ? 'border-[var(--danger)] bg-[var(--danger-soft)]/70'
          : 'border-primary bg-[var(--primary-soft)]/70',
      ].join(' ')}
      aria-hidden
    >
      <div className="rounded-2xl bg-card px-6 py-5 text-center shadow-xl border border-border">
        <div
          className={[
            'mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl',
            reject
              ? 'bg-[var(--danger-soft)] text-[var(--danger-ink)]'
              : 'bg-[var(--primary-soft)] text-[var(--primary-ink)]',
          ].join(' ')}
        >
          {reject ? <CloudXIcon /> : <CloudUploadIcon />}
        </div>
        <p className="text-base font-semibold text-foreground">
          {reject
            ? rejectMessage || 'Эти файлы не подходят'
            : `Отпустите, чтобы загрузить ${countText}`}
        </p>
        <p className="mt-1 font-mono text-xs text-muted-foreground">{limits}</p>
      </div>
    </div>
  )
}

function CloudUploadIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M6 16c-2 0-3-1.5-3-3 0-1.8 1.3-3 3-3 0-3 2.5-5 5.5-5 2.7 0 5 2 5.3 4.6C19.4 9.7 21 11.3 21 13.5 21 15.4 19.5 17 17.5 17H6z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M12 21V11M9 14l3-3 3 3"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CloudXIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M6 16c-2 0-3-1.5-3-3 0-1.8 1.3-3 3-3 0-3 2.5-5 5.5-5 2.7 0 5 2 5.3 4.6C19.4 9.7 21 11.3 21 13.5 21 15.4 19.5 17 17.5 17H6z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M9 14l6 6M15 14l-6 6"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  )
}
