/**
 * shared/profileCache.ts
 * Caches rich LinkedIn profile data (about, skills, posts) keyed by profile slug.
 * Bridges the gap between visiting a profile page and being in messaging —
 * the messaging window never contains about/skills/posts in its DOM.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CachedProfile {
    slug: string;
    name: string;
    headline?: string;
    about?: string;
    skills: string[];
    recentPosts: string[];
    cachedAt: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CACHE_KEY = "li_profile_cache";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── Public API ───────────────────────────────────────────────────────────────

export async function saveProfileToCache(profile: CachedProfile): Promise<void> {
    const cache = await readCache();
    cache[profile.slug] = profile;
    await chrome.storage.local.set({ [CACHE_KEY]: cache });
}

export async function getProfileFromCache(slug: string): Promise<CachedProfile | null> {
    if (!slug) return null;
    const cache = await readCache();
    const entry = cache[slug];
    if (!entry) return null;
    if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
        delete cache[slug];
        await chrome.storage.local.set({ [CACHE_KEY]: cache });
        return null;
    }
    return entry;
}

export function extractSlugFromUrl(url: string): string | null {
    if (!url) return null;
    const cleanUrl = url.trim();

    // 1. Match full LinkedIn /in/ URLs or in/slug with optional trailing slashes, subpaths, or query params
    const fullMatch = /(?:linkedin\.com)?(?:\/|^)in\/([^/?#]+)/i.exec(cleanUrl);
    if (fullMatch && fullMatch[1]) {
        const slug = fullMatch[1].trim();
        if (slug && slug !== "me" && slug.length >= 2) {
            return slug;
        }
        if (slug === "me") return "me";
    }

    // 2. Fallback: strip leading /in/ or trailing query/path
    if (cleanUrl.includes("/in/")) {
        const stripped = cleanUrl.replace(/^.*\/in\//i, "").split(/[/?#]/)[0].replace(/[^a-zA-Z0-9_-]/g, "");
        if (stripped.length >= 2) return stripped;
    }

    // 3. If already a clean slug (alphanumeric with hyphens/underscores)
    if (/^[a-zA-Z0-9_-]{2,100}$/.test(cleanUrl)) {
        return cleanUrl;
    }

    return null;
}


export function currentPageSlug(): string | null {
    if (!window.location.pathname.startsWith("/in/")) return null;
    return extractSlugFromUrl(window.location.href);
}

export async function getAllCachedProfiles(): Promise<CachedProfile[]> {
    const cache = await readCache();
    const now = Date.now();
    return Object.values(cache).filter((p) => now - p.cachedAt <= CACHE_TTL_MS);
}

export async function clearProfileCache(): Promise<void> {
    await chrome.storage.local.remove(CACHE_KEY);
}

async function readCache(): Promise<Record<string, CachedProfile>> {
    const result = await chrome.storage.local.get(CACHE_KEY);
    return (result[CACHE_KEY] as Record<string, CachedProfile>) ?? {};
}

