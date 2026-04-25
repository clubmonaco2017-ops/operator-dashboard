import { supabase } from '../supabaseClient'

/**
 * Sentinel-флаг на error.cause, чтобы caller мог отличить network failure
 * (имеет смысл retry'ить) от HTTP-ответа сервера (бессмысленно).
 */
export const NETWORK_ERROR = Symbol('upload-network-error')

/**
 * Загрузка файла в Supabase Storage с real-time progress.
 *
 * supabase-js v2 использует fetch (нет onUploadProgress), поэтому идём через
 * createSignedUploadUrl + XMLHttpRequest, у которого есть xhr.upload.onprogress.
 *
 * @param {string} bucket — имя bucket (например, 'client-photos')
 * @param {string} path — путь внутри bucket (например, '123/abc.jpg')
 * @param {File} file
 * @param {(loaded: number, total: number) => void} [onProgress]
 * @returns {Promise<void>}
 */
export async function uploadWithProgress(bucket, path, file, onProgress) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path)
  if (error) throw new Error(error.message)

  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded, e.total)
    })
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`HTTP ${xhr.status}: ${xhr.responseText || xhr.statusText}`))
    })
    xhr.addEventListener('error', () => {
      const err = new Error('Сетевая ошибка при загрузке')
      err.cause = NETWORK_ERROR
      reject(err)
    })
    xhr.addEventListener('abort', () => reject(new Error('Загрузка отменена')))
    xhr.open('PUT', data.signedUrl)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.send(file)
  })
}

/**
 * Обёртка с одним auto-retry на network errors (Q-20 default: 1 retry).
 * НЕ ретраит HTTP 4xx/5xx ответы — только обрыв сети (xhr.onerror).
 *
 * @param {string} bucket
 * @param {string} path
 * @param {File} file
 * @param {(loaded: number, total: number) => void} [onProgress]
 * @param {() => void} [onRetry] — вызовется один раз перед второй попыткой
 */
export async function uploadWithRetry(bucket, path, file, onProgress, onRetry) {
  try {
    await uploadWithProgress(bucket, path, file, onProgress)
  } catch (err) {
    if (err?.cause === NETWORK_ERROR) {
      onRetry?.()
      // Reset progress UI к нулю на retry
      onProgress?.(0, file.size)
      await uploadWithProgress(bucket, path, file, onProgress)
    } else {
      throw err
    }
  }
}
