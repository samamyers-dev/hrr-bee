/**
 * Minimal HTML sanitizer for RSS episode descriptions.
 *
 * Uses the browser's DOMParser to parse the HTML, then strips known-dangerous
 * tags and attributes. Falls back to a regex-based scrubber when DOMParser is
 * unavailable (e.g. during SSR or in test environments).
 */

const DANGEROUS_TAGS = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'textarea',
  'button',
]);

const DANGEROUS_URLS = /^(javascript|data|vbscript):/i;

function sanitizeWithDom(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
  const toRemove: Element[] = [];

  let node: Element | null = walker.nextNode() as Element | null;
  while (node) {
    const tag = node.tagName.toLowerCase();

    if (DANGEROUS_TAGS.has(tag)) {
      toRemove.push(node);
      node = walker.nextNode() as Element | null;
      continue;
    }

    // Strip event-handler attributes and dangerous URLs.
    for (const attr of Array.from(node.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value;
      if (name.startsWith('on')) {
        node.removeAttribute(attr.name);
      } else if ((name === 'href' || name === 'src') && DANGEROUS_URLS.test(value)) {
        node.removeAttribute(attr.name);
      }
    }

    node = walker.nextNode() as Element | null;
  }

  for (const el of toRemove) {
    el.remove();
  }

  return doc.body.innerHTML;
}

function sanitizeWithRegex(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/\s+on\w+\s*=\s*["'][^"']*?["']/gi, '')
    .replace(/\s+on\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/(href|src)\s*=\s*["'](javascript|data|vbscript):[^"']*?["']/gi, '');
}

export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return '';
  try {
    if (typeof DOMParser !== 'undefined') {
      return sanitizeWithDom(html);
    }
  } catch {
    // fall through to regex scrubber
  }
  return sanitizeWithRegex(html);
}
