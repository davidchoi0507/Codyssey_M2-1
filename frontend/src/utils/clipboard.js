/**
 * Clipboard & URL Utilities
 */

/**
 * Robust clipboard copy supporting Modern Clipboard API with textarea fallback
 * Works across HTTPS, HTTP, localhost, mobile, and iframe environments.
 */
export async function copyToClipboard(text) {
  if (!text) return false;

  // 1. Try Modern Clipboard API if available and in secure context
  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      console.warn('navigator.clipboard.writeText failed, using fallback:', e);
    }
  }

  // 2. Fallback: document.execCommand('copy') via hidden textarea
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return Boolean(successful);
  } catch (err) {
    console.error('execCommand copy fallback failed:', err);
    return false;
  }
}

/**
 * Returns a full absolute web URL for frontend app routes (e.g. /community/manage?...)
 */
export function toAppUrl(path) {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}${base}${cleanPath}`;
}

