/**
 * Image proxy — Drive-hosted images need an authenticated fetch via the
 * background worker. Web images load naturally with error state handling.
 */

type FetchImageResponse = { ok: true; dataUrl: string } | { ok: false; error: string }

/**
 * Extract a Drive fileId from common Drive image URL formats.
 */
function extractDriveFileId(url: string): string | null {
  // https://drive.google.com/file/d/{id}/view
  let m = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (m) return m[1]
  // https://drive.google.com/uc?id={id} or ?export=view&id={id}
  m = url.match(/drive\.google\.com\/uc[^?]*\?[^#]*[?&]id=([a-zA-Z0-9_-]+)/)
  if (m) return m[1]
  // https://lh3.googleusercontent.com/d/{id}
  m = url.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/)
  if (m) return m[1]
  return null
}

async function proxyDriveImage(img: HTMLImageElement, fileId: string): Promise<void> {
  img.classList.add('mdp-img--loading')
  return new Promise(resolve => {
    chrome.runtime.sendMessage(
      { type: 'FETCH_IMAGE', payload: { fileId } },
      (res: FetchImageResponse) => {
        img.classList.remove('mdp-img--loading')
        if (!chrome.runtime.lastError && res?.ok) {
          img.src = res.dataUrl
          img.classList.add('mdp-img--loaded')
        } else {
          img.classList.add('mdp-img--error')
          if (!img.alt) img.alt = 'Image unavailable'
        }
        resolve()
      }
    )
  })
}

/**
 * Process all images in the viewer:
 * - Drive URLs are proxied through the background worker with auth
 * - Web URLs load naturally with loading/error state classes
 */
export function processImages(viewer: HTMLElement): void {
  for (const img of viewer.querySelectorAll<HTMLImageElement>('img[src]')) {
    img.classList.add('mdp-img')

    const src = img.getAttribute('src') ?? ''
    const fileId = extractDriveFileId(src)

    if (fileId) {
      void proxyDriveImage(img, fileId)
    } else {
      // Web image — just track load/error state
      if (img.complete) {
        img.classList.add(img.naturalWidth ? 'mdp-img--loaded' : 'mdp-img--error')
      } else {
        img.addEventListener('load',  () => img.classList.add('mdp-img--loaded'), { once: true })
        img.addEventListener('error', () => img.classList.add('mdp-img--error'),  { once: true })
      }
    }
  }
}
