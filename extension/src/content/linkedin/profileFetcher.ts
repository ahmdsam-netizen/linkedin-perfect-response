/**
 * content/linkedin/profileFetcher.ts
 *
 * Silently fetches and parses LinkedIn profiles in the background using the active
 * session cookies (same-origin fetch).
 *
 * Unwraps LinkedIn's embedded Voyager/GraphQL JSON hydration payloads (inside <code><!--{...}--></code>,
 * <script type="application/ld+json">, and Apollo client blobs) to extract About, Skills, and
 * Recent Activity in real time.
 */

import type { CachedProfile } from "../../shared/profileCache.ts";
import {
    saveProfileToCache,
    getProfileFromCache,
    extractSlugFromUrl,
} from "../../shared/profileCache.ts";

/**
 * Fetches a LinkedIn profile in the background and returns structured data.
 * Checks the local cache first before making a network request.
 */
export async function fetchProfileInBackground(
    profileUrlOrSlug: string
): Promise<CachedProfile | null> {
    if (!profileUrlOrSlug) return null;

    const slug = extractSlugFromUrl(profileUrlOrSlug);
    if (!slug || slug.length < 2) return null;

    // 1. Check local cache first
    const cached = await getProfileFromCache(slug);
    if (cached && (cached.about || cached.skills.length > 0)) {
        console.log(`[LinkedIn AI] ⚡ Serving "${slug}" from cache (${cached.skills.length} skills).`);
        return cached;
    }

    // 2. Perform silent background fetch
    const url = `https://www.linkedin.com/in/${slug}/`;
    console.log(`[LinkedIn AI] 🚀 Background fetching profile from: ${url}`);

    try {
        const response = await fetch(url, {
            method: "GET",
            credentials: "include",
            headers: {
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
        });

        if (!response.ok) {
            console.warn(`[LinkedIn AI] Background fetch failed for ${slug}: HTTP ${response.status}`);
            return null;
        }

        const html = await response.text();
        const extracted = parseProfileHtml(html, slug);

        if (extracted && (extracted.name || extracted.about || extracted.skills.length > 0)) {
            await saveProfileToCache(extracted);
            console.log(
                `[LinkedIn AI] ✅ Background-fetched "${slug}":`,
                `Name="${extracted.name}", Headline="${extracted.headline || "none"}", About=${extracted.about ? `"${extracted.about.slice(0, 40)}..."` : "none"}, Skills=${extracted.skills.length} [${extracted.skills.slice(0, 5).join(", ")}], Posts=${extracted.recentPosts.length}`
            );
            return extracted;
        }
    } catch (err) {
        console.error(`[LinkedIn AI] Background profile fetch error for ${slug}:`, err);
    }

    return null;
}

/**
 * Directly fetches the logged-in user's own profile in the background via /in/me/.
 */
export async function fetchOwnProfileDirectly(): Promise<CachedProfile | null> {
    console.log("[LinkedIn AI] 🚀 Auto-syncing your own profile via https://www.linkedin.com/in/me/ ...");
    try {
        const response = await fetch("https://www.linkedin.com/in/me/", {
            method: "GET",
            credentials: "include",
            headers: {
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
        });

        if (!response.ok) {
            console.warn("[LinkedIn AI] /in/me/ returned HTTP", response.status);
            return null;
        }

        const finalUrl = response.url || window.location.href;
        const slug = extractSlugFromUrl(finalUrl) || "me";
        const html = await response.text();

        const extracted = parseProfileHtml(html, slug);
        if (extracted && (extracted.name || extracted.about || extracted.skills.length > 0)) {
            await saveProfileToCache(extracted);
            console.log(
                `[LinkedIn AI] ✅ Auto-synced your own profile (${slug}):`,
                `Name="${extracted.name}", Role="${extracted.headline}", Skills=${extracted.skills.length} [${extracted.skills.slice(0, 5).join(", ")}]`
            );
            return extracted;
        }
    } catch (err) {
        console.error("[LinkedIn AI] Error fetching /in/me/:", err);
    }
    return null;
}

/**
 * Parses raw LinkedIn profile HTML using embedded hydration JSON and DOM parsing.
 */
export function parseProfileHtml(html: string, fallbackSlug: string): CachedProfile | null {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // ─── 1. Deep Extract from Embedded Hydration JSON ──────────────────────────
    const jsonExtracted = extractFromEmbeddedJson(doc, html);

    // ─── 2. DOM-based Fallback Extraction ──────────────────────────────────────
    const domName =
        doc.querySelector("h1.text-heading-xlarge")?.textContent?.trim() ||
        doc.querySelector("main h1")?.textContent?.trim() ||
        doc.title.split("|")[0]?.replace("LinkedIn", "")?.trim() ||
        fallbackSlug;

    const domHeadline =
        doc.querySelector(".text-body-medium.break-words")?.textContent?.trim() ||
        doc.querySelector(".pv-text-details__left-panel .text-body-medium")?.textContent?.trim();

    let domAbout: string | undefined = undefined;
    const aboutSection = findSectionByHeading(doc, ["about", "summary", "about me"]);
    if (aboutSection) {
        const text = findSubstantiveText(aboutSection);
        if (text) domAbout = cleanAbout(text);
    }

    const domSkills: string[] = [];
    const skillsSection = findSectionByHeading(doc, ["skills", "skills & endorsements", "top skills"]);
    if (skillsSection) {
        skillsSection.querySelectorAll("span[aria-hidden='true'], .hoverable-link-text").forEach((el) => {
            const text = cleanText(el.textContent || "");
            if (isValidSkill(text) && !domSkills.includes(text)) {
                domSkills.push(text);
            }
        });
    }

    // ─── 3. Combine JSON + DOM results ─────────────────────────────────────────
    const finalName = jsonExtracted.name || (domName !== fallbackSlug ? domName : fallbackSlug);
    const finalHeadline = jsonExtracted.headline || domHeadline;
    const finalAbout = jsonExtracted.about || domAbout;
    const finalSkills = Array.from(new Set([...(jsonExtracted.skills || []), ...domSkills]));
    const finalPosts = Array.from(new Set([...(jsonExtracted.recentPosts || [])]));

    return {
        slug: fallbackSlug,
        name: finalName,
        headline: finalHeadline,
        about: finalAbout,
        skills: finalSkills.slice(0, 50),
        recentPosts: finalPosts.slice(0, 5),
        cachedAt: Date.now(),
    };
}

/**
 * Searches through all embedded <code>, <script>, and JSON blobs in LinkedIn's HTML,
 * unwrapping HTML comments <!--{...}--> and decoding HTML entities.
 */
export function extractFromEmbeddedJson(doc: Document, rawHtml?: string): {
    name?: string;
    headline?: string;
    about?: string;
    skills: string[];
    recentPosts: string[];
} {
    const result: {
        name?: string;
        headline?: string;
        about?: string;
        skills: string[];
        recentPosts: string[];
    } = { skills: [], recentPosts: [] };

    const jsonStrings: string[] = [];
    const seenJsons = new Set<string>();

    function addJsonString(raw: string) {
        if (!raw) return;
        const decoded = decodeHtmlEntities(raw).trim();
        if (decoded.startsWith("{") && decoded.endsWith("}") && !seenJsons.has(decoded)) {
            seenJsons.add(decoded);
            jsonStrings.push(decoded);
        }
    }

    // 1. Inspect <code> elements and their child Comment nodes
    const codeTags = Array.from(doc.querySelectorAll("code"));
    codeTags.forEach((code) => {
        // Inspect Comment nodes inside <code>
        for (let i = 0; i < code.childNodes.length; i++) {
            const node = code.childNodes[i];
            if (node.nodeType === 8 /* Node.COMMENT_NODE */ && node.nodeValue) {
                let val = node.nodeValue.trim();
                if (val.startsWith("{") && val.endsWith("}")) {
                    addJsonString(val);
                }
            }
        }

        // Fallback: check innerHTML or textContent
        let inner = (code.innerHTML || code.textContent || "").trim();
        if (inner.startsWith("<!--")) {
            inner = inner.replace(/^<!--\s*/, "").replace(/\s*-->$/, "").trim();
        }
        if (inner.startsWith("{") && inner.endsWith("}")) {
            addJsonString(inner);
        }
    });

    // 2. Inspect <script> tags (JSON-LD, application/json, etc.)
    const scriptTags = Array.from(doc.querySelectorAll("script[type='application/ld+json'], script[type='application/json'], script"));
    scriptTags.forEach((script) => {
        const text = (script.textContent || "").trim();
        if (text.startsWith("{") && text.endsWith("}")) {
            addJsonString(text);
        }
    });

    // 3. Inspect raw HTML regex matches if provided
    if (rawHtml) {
        const rawMatches = rawHtml.match(/<!--\s*(\{[\s\S]*?\})\s*-->/g) || [];
        rawMatches.forEach((match) => {
            const clean = match.replace(/^<!--\s*/, "").replace(/\s*-->$/, "").trim();
            if (clean.startsWith("{") && clean.endsWith("}")) {
                addJsonString(clean);
            }
        });
    }

    // 4. Parse all JSON payloads and inspect
    const visited = new Set<unknown>();
    for (const jsonStr of jsonStrings) {
        try {
            const data = JSON.parse(jsonStr);
            inspectJsonObject(data, result, visited, 0);
        } catch {
            // Ignore malformed chunks
        }
    }

    return result;
}

/**
 * Recursively inspects JSON objects and arrays from LinkedIn's Redux / Voyager store / JSON-LD.
 */
function inspectJsonObject(
    obj: unknown,
    result: {
        name?: string;
        headline?: string;
        about?: string;
        skills: string[];
        recentPosts: string[];
    },
    visited: Set<unknown>,
    depth: number
): void {
    if (!obj || typeof obj !== "object" || depth > 15) return;
    if (visited.has(obj)) return;
    visited.add(obj);

    if (Array.isArray(obj)) {
        for (const item of obj) {
            if (typeof item === "string" && isValidSkill(item)) {
                // If array is a list of skill strings (e.g. knowsAbout or skills list)
                if (!result.skills.includes(item)) {
                    result.skills.push(cleanText(item));
                }
            } else if (typeof item === "object") {
                inspectJsonObject(item, result, visited, depth + 1);
            }
        }
        return;
    }

    const record = obj as Record<string, unknown>;

    // ─── 1. JSON-LD / Schema.org Person ───────────────────────────────────────
    if (record["@type"] === "Person" || record["@type"] === "http://schema.org/Person") {
        if (typeof record.name === "string" && !result.name) {
            result.name = cleanText(record.name);
        }
        if (typeof record.jobTitle === "string" && !result.headline) {
            result.headline = cleanText(record.jobTitle);
        }
        if (typeof record.description === "string" && !result.about) {
            result.about = cleanAbout(record.description);
        }
        if (Array.isArray(record.knowsAbout)) {
            for (const s of record.knowsAbout) {
                const sText = extractText(s);
                if (sText && isValidSkill(sText) && !result.skills.includes(sText)) {
                    result.skills.push(sText);
                }
            }
        }
    }

    // ─── 2. LinkedIn Voyager Profile Entity ────────────────────────────────────
    const typeStr = typeof record.$type === "string" ? record.$type : "";

    if (
        typeStr.includes("identity.profile.Profile") ||
        (record.summary && record.headline) ||
        (record.firstName && record.lastName)
    ) {
        const summary = extractText(record.summary);
        if (summary && !result.about) {
            result.about = cleanAbout(summary);
        }
        const headline = extractText(record.headline);
        if (headline && !result.headline) {
            result.headline = cleanText(headline);
        }
        const firstName = extractText(record.firstName);
        const lastName = extractText(record.lastName);
        if (firstName && lastName && !result.name) {
            result.name = `${firstName} ${lastName}`.trim();
        }
    }

    // ─── 3. LinkedIn Skill Entity ──────────────────────────────────────────────
    const isSkillType =
        typeStr.includes("Skill") ||
        typeStr.includes("StandardizedSkill") ||
        typeStr.includes("ProfileComponent") ||
        record.skillName !== undefined ||
        record.skillTopic !== undefined;

    if (isSkillType) {
        const possibleSkill =
            extractText(record.name) ||
            extractText(record.skillName) ||
            extractText(record.title) ||
            extractText(record.skillTopic) ||
            (record.skill && typeof record.skill === "object" ? extractText((record.skill as Record<string, unknown>).name) : "") ||
            (record.standardizedSkill && typeof record.standardizedSkill === "object" ? extractText((record.standardizedSkill as Record<string, unknown>).name) : "");

        if (possibleSkill && isValidSkill(possibleSkill) && !result.skills.includes(possibleSkill)) {
            result.skills.push(cleanText(possibleSkill));
        }
    }

    // ─── 4. Direct Skill Arrays (e.g. record.skills = [...]) ──────────────────
    if (Array.isArray(record.skills)) {
        for (const sk of record.skills) {
            const skillStr = extractText(sk);
            if (skillStr && isValidSkill(skillStr) && !result.skills.includes(skillStr)) {
                result.skills.push(cleanText(skillStr));
            }
        }
    }
    if (Array.isArray(record.knowsAbout)) {
        for (const sk of record.knowsAbout) {
            const skillStr = extractText(sk);
            if (skillStr && isValidSkill(skillStr) && !result.skills.includes(skillStr)) {
                result.skills.push(cleanText(skillStr));
            }
        }
    }

    // ─── 5. Post / Activity / Update Entity ────────────────────────────────────
    if (typeStr.includes("Update") || typeStr.includes("Share") || record.commentary) {
        const commentary = record.commentary as Record<string, unknown> | undefined;
        let postText = extractText(commentary?.text) || extractText(record.text) || extractText(record.commentary);
        if (postText && postText.length > 25 && !result.recentPosts.includes(postText)) {
            result.recentPosts.push(cleanText(postText).slice(0, 300));
        }
    }

    // ─── 6. Recurse into all object values ─────────────────────────────────────
    for (const val of Object.values(record)) {
        if (val && typeof val === "object") {
            inspectJsonObject(val, result, visited, depth + 1);
        }
    }
}

/**
 * Extracts a clean string from various LinkedIn text representations
 * (string, { text: "..." }, { value: "..." }, etc.)
 */
function extractText(val: unknown): string {
    if (!val) return "";
    if (typeof val === "string") return val.trim();
    if (typeof val === "object") {
        const rec = val as Record<string, unknown>;
        if (typeof rec.text === "string") return rec.text.trim();
        if (typeof rec.value === "string") return rec.value.trim();
        if (rec.text && typeof rec.text === "object") {
            return extractText(rec.text);
        }
    }
    return "";
}

/**
 * Decodes HTML entities commonly found in raw server-rendered comments
 */
function decodeHtmlEntities(str: string): string {
    return str
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");
}

// ─── DOM Inspection Helpers ───────────────────────────────────────────────────

function findSectionByHeading(doc: Document, keywords: string[]): HTMLElement | null {
    const sections = Array.from(doc.querySelectorAll<HTMLElement>("section, div.artdeco-card"));
    for (const sec of sections) {
        const h2 = sec.querySelector("h2, h3, div.pvs-header__title");
        const title = h2?.textContent?.toLowerCase().trim() || "";
        if (keywords.some((kw) => title.includes(kw))) {
            return sec;
        }
    }
    return null;
}

function findSubstantiveText(container: HTMLElement): string | null {
    const spans = Array.from(container.querySelectorAll<HTMLElement>("span[aria-hidden='true'], .inline-show-more-text, p"));
    for (const span of spans) {
        const text = span.textContent?.trim();
        if (text && text.length > 25 && !text.toLowerCase().includes("about")) {
            return text;
        }
    }
    return null;
}

function cleanText(text: string): string {
    return text
        .replace(/[\n\r\t]+/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
}

function cleanAbout(text: string): string {
    return text
        .replace(/…\s*see more/gi, "")
        .replace(/\.\.\.\s*see more/gi, "")
        .replace(/[\n\r\t]+/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
}

export function isValidSkill(text: string): boolean {
    if (!text || typeof text !== "string") return false;
    const clean = text.trim();
    if (clean.length < 2 || clean.length > 60) return false;
    const lower = clean.toLowerCase();

    // Exclude noise, LinkedIn buttons, numbers, and sub-labels
    return !(
        lower.includes("endorsement") ||
        lower.includes("experience across") ||
        lower.includes("experiences across") ||
        lower.includes("see all") ||
        lower.includes("show all") ||
        lower.startsWith("passed") ||
        lower.startsWith("badge") ||
        lower.startsWith("skill badge") ||
        lower.includes("skill assessment") ||
        lower.startsWith("http") ||
        lower.startsWith("urn:li:") ||
        /^\d+$/.test(clean)
    );
}

