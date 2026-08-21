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

export interface ExtractedProfileData {
    slug: string;
    name: string;
    headline?: string;
    about?: string;
    skills: string[];
    recentPosts: string[];
}

export function extractSlugFromUrl(urlOrSlug: string): string | null {
    if (!urlOrSlug) return null;
    let clean = urlOrSlug.trim();

    // Remove query params and hash
    clean = clean.split("?")[0].split("#")[0];

    // If pure slug string like "sayem-ahmad-4abb2b385"
    if (/^[a-zA-Z0-9_-]{2,}$/.test(clean) && !clean.includes("/") && !clean.includes(".")) {
        return clean;
    }

    // Match /in/slug or /in/slug/details/...
    const match = clean.match(/(?:linkedin\.com)?\/in\/([a-zA-Z0-9%_-]+)/i);
    if (match && match[1]) {
        const extracted = decodeURIComponent(match[1]).replace(/\/+$/, "");
        return extracted.length > 0 ? extracted : null;
    }
    return null;
}

/**
 * Fetches a LinkedIn profile in the background and returns structured data.
 * Concurrently fetches the main profile for about/headline and /details/skills/ for the full skill set.
 */
export async function fetchProfileInBackground(
    profileUrlOrSlug: string
): Promise<ExtractedProfileData | null> {
    if (!profileUrlOrSlug) return null;

    let slug = extractSlugFromUrl(profileUrlOrSlug);
    if (!slug || slug.length < 2) return null;

    const mainUrl = `https://www.linkedin.com/in/${slug}/`;
    console.log(`[LinkedIn AI] 🚀 Background fetching profile for "${slug}"...`);

    try {
        const fetchHeaders = {
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        };

        const mainResp = await fetch(mainUrl, { method: "GET", credentials: "include", headers: fetchHeaders });
        if (!mainResp.ok) return null;

        // Check if redirected to public vanity URL (e.g. from ACoA... to abdul-rub-faheemi-aa3b633a6)
        const finalUrl = mainResp.url || mainUrl;
        const resolvedSlug = extractSlugFromUrl(finalUrl) || slug;

        const mainHtml = await mainResp.text();
        const extractedMain = parseProfileHtml(mainHtml, resolvedSlug);

        // Fetch skills page using resolved slug
        let extractedSkills: ExtractedProfileData | null = null;
        try {
            const skillsUrl = `https://www.linkedin.com/in/${resolvedSlug}/details/skills/`;
            const skillsResp = await fetch(skillsUrl, { method: "GET", credentials: "include", headers: fetchHeaders });
            if (skillsResp.ok) {
                const skillsHtml = await skillsResp.text();
                extractedSkills = parseProfileHtml(skillsHtml, resolvedSlug);
            }
        } catch {
            // Ignore skills sub-fetch error
        }

        // Combine findings from main page and dedicated skills page
        const combinedSkills = Array.from(
            new Set([...(extractedMain?.skills || []), ...(extractedSkills?.skills || [])])
        ).filter(isValidSkill).slice(0, 50);

        const combinedPosts = Array.from(
            new Set([...(extractedMain?.recentPosts || []), ...(extractedSkills?.recentPosts || [])])
        ).slice(0, 5);

        const finalName = extractedMain?.name && extractedMain.name !== resolvedSlug && !extractedMain.name.startsWith("ACoA")
            ? extractedMain.name
            : (extractedSkills?.name && extractedSkills.name !== resolvedSlug && !extractedSkills.name.startsWith("ACoA") ? extractedSkills.name : resolvedSlug);

        const finalHeadline = extractedMain?.headline || extractedSkills?.headline;
        const finalAbout = extractedMain?.about || extractedSkills?.about;

        if (finalName || finalHeadline || combinedSkills.length > 0 || finalAbout) {
            const result: ExtractedProfileData = {
                slug: resolvedSlug,
                name: finalName,
                headline: finalHeadline,
                about: finalAbout,
                skills: combinedSkills,
                recentPosts: combinedPosts,
            };

            console.log(
                `[LinkedIn AI] ✅ Background-fetched profile for "${resolvedSlug}":`,
                `Name="${result.name}", Headline="${result.headline || "none"}", About=${result.about ? `"${result.about.slice(0, 40)}..."` : "none"}, Skills=${result.skills.length} [${result.skills.slice(0, 5).join(", ")}]`
            );
            return result;
        }
    } catch (err) {
        console.error(`[LinkedIn AI] Background profile fetch error for ${slug}:`, err);
    }

    return null;
}

/**
 * Directly fetches the logged-in user's own profile in the background.
 * Queries /in/me/ and /in/me/details/skills/ using active session cookies.
 */
export async function fetchOwnProfileDirectly(): Promise<ExtractedProfileData | null> {
    console.log("[LinkedIn AI] 🚀 Auto-syncing your own profile & skills via /in/me/ and /details/skills/...");

    try {
        const fetchHeaders = {
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        };

        const [meResp, skillsResp] = await Promise.allSettled([
            fetch("https://www.linkedin.com/in/me/", {
                method: "GET",
                credentials: "include",
                headers: fetchHeaders,
            }),
            fetch("https://www.linkedin.com/in/me/details/skills/", {
                method: "GET",
                credentials: "include",
                headers: fetchHeaders,
            }),
        ]);

        let extractedMe: ExtractedProfileData | null = null;
        let extractedSkills: ExtractedProfileData | null = null;
        let resolvedSlug = "me";

        if (meResp.status === "fulfilled" && meResp.value.ok) {
            const finalUrl = meResp.value.url || "";
            resolvedSlug = extractSlugFromUrl(finalUrl) || "me";
            const meHtml = await meResp.value.text();
            extractedMe = parseProfileHtml(meHtml, resolvedSlug);
        }

        if (skillsResp.status === "fulfilled" && skillsResp.value.ok) {
            const skillsHtml = await skillsResp.value.text();
            extractedSkills = parseProfileHtml(skillsHtml, resolvedSlug);
        }

        const combinedSkills = Array.from(
            new Set([...(extractedMe?.skills || []), ...(extractedSkills?.skills || [])])
        ).filter(isValidSkill).slice(0, 50);

        const finalName = extractedMe?.name && extractedMe.name !== "me" && extractedMe.name !== resolvedSlug
            ? extractedMe.name
            : (extractedSkills?.name && extractedSkills.name !== "me" ? extractedSkills.name : resolvedSlug);

        const finalHeadline = extractedMe?.headline || extractedSkills?.headline;
        const finalAbout = extractedMe?.about || extractedSkills?.about;

        if (finalName || finalHeadline || combinedSkills.length > 0 || finalAbout) {
            const result: ExtractedProfileData = {
                slug: resolvedSlug,
                name: finalName,
                headline: finalHeadline,
                about: finalAbout,
                skills: combinedSkills,
                recentPosts: extractedMe?.recentPosts || [],
            };

            console.log(
                `[LinkedIn AI] ✅ Auto-synced own profile (${resolvedSlug}):`,
                `Name="${result.name}", Role="${result.headline || "none"}", Skills=${result.skills.length} [${result.skills.slice(0, 5).join(", ")}]`
            );
            return result;
        }
    } catch (err) {
        console.error("[LinkedIn AI] Error fetching /in/me/ profile:", err);
    }

    // Fallback: Check service worker
    try {
        const swResponse = await chrome.runtime.sendMessage({
            type: "FETCH_OWN_PROFILE_BACKGROUND",
        });
        if (swResponse?.payload && (swResponse.payload.skills?.length > 0 || swResponse.payload.about)) {
            return swResponse.payload;
        }
    } catch {
        // Ignore service worker fallback failure
    }

    return null;
}

/**
 * Parses raw LinkedIn profile HTML using embedded hydration JSON and DOM parsing.
 */
export function parseProfileHtml(html: string, fallbackSlug: string): ExtractedProfileData | null {
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
    // 1. Dedicated skills section if present
    const skillsSection = findSectionByHeading(doc, ["skills", "skills & endorsements", "top skills"]);
    const skillContainers = skillsSection ? [skillsSection] : [doc.body || doc];

    skillContainers.forEach((container) => {
        container.querySelectorAll(
            "a[data-field='skill_card_skill_topic'] span[aria-hidden='true'], .hoverable-link-text span[aria-hidden='true'], div[data-view-name*='skill'] span[aria-hidden='true'], .pvs-list__paged-list-item .mr1.hoverable-link-text span[aria-hidden='true'], .pvs-list__paged-list-item div.t-bold span[aria-hidden='true']"
        ).forEach((el) => {
            const text = cleanText(el.textContent || "");
            if (isValidSkill(text) && !domSkills.includes(text)) {
                domSkills.push(text);
            }
        });
    });

    // ─── 3. Combine JSON + DOM results ─────────────────────────────────────────
    const finalName = jsonExtracted.name || (domName !== fallbackSlug ? domName : fallbackSlug);
    const finalHeadline = jsonExtracted.headline || domHeadline;
    const finalAbout = jsonExtracted.about || domAbout;
    const finalSkills = Array.from(new Set([...(jsonExtracted.skills || []), ...domSkills])).filter(isValidSkill);
    const finalPosts = Array.from(new Set([...(jsonExtracted.recentPosts || [])]));

    return {
        slug: fallbackSlug,
        name: finalName,
        headline: finalHeadline,
        about: finalAbout,
        skills: finalSkills.slice(0, 50),
        recentPosts: finalPosts.slice(0, 5),
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
                const val = node.nodeValue.trim();
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
        typeStr.includes("MiniProfile") ||
        (record.summary && record.headline) ||
        (record.firstName && record.lastName) ||
        record.headline !== undefined ||
        record.occupation !== undefined
    ) {
        const summary = extractText(record.summary) || extractText(record.about);
        if (summary && !result.about) {
            result.about = cleanAbout(summary);
        }
        const headline =
            extractText(record.headline) ||
            extractText(record.occupation) ||
            extractText(record.primarySubtitle) ||
            extractText(record.secondarySubtitle) ||
            extractText(record.jobTitle) ||
            extractText(record.subline);

        if (headline && !result.headline && isValidSkill(headline)) {
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
        (typeStr.includes("Skill") && !typeStr.includes("Component")) ||
        typeStr.includes("StandardizedSkill") ||
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

    // ─── 5. Post / Activity / Update Entity ────────────────────────────────────
    if (typeStr.includes("Update") || typeStr.includes("Share") || record.commentary) {
        const commentary = record.commentary as Record<string, unknown> | undefined;
        const postText = extractText(commentary?.text) || extractText(record.text) || extractText(record.commentary);
        if (postText && postText.length > 25 && !result.recentPosts.includes(postText)) {
            result.recentPosts.push(cleanText(postText).slice(0, 300));
        }
    }

    // ─── 6. Recurse into all object values ─────────────────────────────────────
    for (const [key, val] of Object.entries(record)) {
        if (key.startsWith("$recipe") || key === "paging" || key === "metadata") continue;
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
    if (clean.length < 2 || clean.length > 50) return false;

    // Exclude Java/schema namespaces, internal LinkedIn identifiers, recipes, and noise
    if (
        clean.startsWith("com.") ||
        clean.startsWith("org.") ||
        clean.startsWith("net.") ||
        clean.includes("linkedin.") ||
        clean.includes("voyager.") ||
        clean.includes("recipe.") ||
        clean.includes("dash.deco") ||
        clean.includes("Anon") ||
        clean.startsWith("urn:li:") ||
        clean.startsWith("http") ||
        clean.includes("://") ||
        clean.includes("/") ||
        clean.includes("\\") ||
        clean.includes("{") ||
        clean.includes("}") ||
        clean.includes("$") ||
        /^[a-z0-9_.-]+\.[a-z0-9_.-]+$/i.test(clean) ||
        /^\d+$/.test(clean)
    ) {
        return false;
    }

    const lower = clean.toLowerCase();
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
        lower === "fullpaging" ||
        lower === "vectorartifact" ||
        lower === "locale" ||
        lower === "industry" ||
        lower === "date" ||
        lower === "daterange" ||
        lower === "minischool" ||
        lower === "minicompany" ||
        lower === "coordinate2dfull" ||
        lower === "vectorimage"
    );
}

