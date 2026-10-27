const ALLOWED = new Set(["http:", "https:", "mailto:"]);

/** Returns a normalized safe URL or null. Bare domains get https://. */
export function safeUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const withProto = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withProto);
    if (!ALLOWED.has(u.protocol)) return null;
    if (u.protocol !== "mailto:" && !u.hostname.includes(".") && u.hostname !== "localhost")
      return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Returns a privacy-enhanced YouTube embed URL, or null if unrecognised. */
export function youtubeEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    let id: string | null = null;
    if (host === "youtu.be") id = u.pathname.slice(1);
    else if (host === "youtube.com") {
      if (u.pathname === "/watch") id = u.searchParams.get("v");
      else if (u.pathname.startsWith("/embed/") || u.pathname.startsWith("/shorts/"))
        id = u.pathname.split("/")[2] ?? null;
    }
    return id && /^[\w-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  } catch {
    return null;
  }
}

interface PMNode {
  type?: unknown;
  marks?: { type?: string; attrs?: { href?: string } }[];
  content?: unknown[];
  html?: unknown;
}

/** Walk Tiptap JSON, dropping link marks with unsafe hrefs and any raw HTML fields. */
export function sanitizeDoc(node: unknown): unknown {
  if (!node || typeof node !== "object") return null;
  const n: PMNode = { ...(node as PMNode) };
  if (typeof n.type !== "string") return null;
  if (Array.isArray(n.marks))
    n.marks = n.marks.filter((m) => m?.type !== "link" || safeUrl(m.attrs?.href ?? "") !== null);
  if (Array.isArray(n.content)) n.content = n.content.map(sanitizeDoc).filter(Boolean);
  delete n.html;
  return n;
}
