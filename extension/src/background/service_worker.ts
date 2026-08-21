import type {
    BackgroundToContentMessage,
    ContentToBackgroundMessage,
    GenerateReplyPayload,
} from "../shared/messages.ts";
import type { GenerateReplyRequest } from "../shared/types.ts";
import { getUserProfile, mergeUserProfile } from "../shared/storage.ts";

// Backend URL — update when deploying
const API_BASE_URL = "http://localhost:8000";

export interface OwnProfileData {
    slug: string;
    name: string;
    headline?: string;
    about?: string;
    skills: string[];
    recentPosts: string[];
}

// ─── Message Listener ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
    (
        message: ContentToBackgroundMessage,
        _sender,
        sendResponse: (response: BackgroundToContentMessage | { type: string; payload: unknown }) => void
    ) => {
        if (message.type === "GENERATE_REPLY") {
            handleGenerateReply(message.payload)
                .then(sendResponse)
                .catch((err) => {
                    sendResponse({
                        type: "REPLY_ERROR",
                        error: err instanceof Error ? err.message : String(err),
                    });
                });
            return true;
        }

        if (message.type === "FETCH_OWN_PROFILE_BACKGROUND") {
            handleBackgroundOwnProfileFetch()
                .then((profile) => {
                    sendResponse({ type: "PROFILE_FETCHED_RESULT", payload: profile });
                })
                .catch((err) => {
                    console.error("[ServiceWorker] Fetch own error:", err);
                    sendResponse({ type: "PROFILE_FETCHED_RESULT", payload: null });
                });
            return true;
        }

        if (message.type === "OPEN_POPUP") {
            handleOpenPopup()
                .then((res) => sendResponse({ type: "POPUP_OPENED", payload: res }))
                .catch((err) => {
                    console.error("[ServiceWorker] Open popup error:", err);
                    sendResponse({ type: "POPUP_OPENED", payload: false });
                });
            return true;
        }

        return false;
    }
);

async function handleOpenPopup(): Promise<boolean> {
    try {
        if (chrome.action && typeof chrome.action.openPopup === "function") {
            await chrome.action.openPopup();
            return true;
        }
    } catch (err) {
        console.warn("[ServiceWorker] chrome.action.openPopup failed, falling back to window popup:", err);
    }

    try {
        await chrome.windows.create({
            url: chrome.runtime.getURL("index.html"),
            type: "popup",
            width: 440,
            height: 640,
            focused: true,
        });
        return true;
    } catch (winErr) {
        console.error("[ServiceWorker] Could not open popup window:", winErr);
        return false;
    }
}

// ─── Background Own Profile Fetching ──────────────────────────────────────────

function extractSlugFromUrl(urlOrSlug: string): string | null {
    if (!urlOrSlug) return null;
    const clean = urlOrSlug.trim();
    if (/^[a-zA-Z0-9_-]{2,}$/.test(clean) && !clean.includes("/") && !clean.includes(".")) {
        return clean;
    }
    const match = clean.match(/(?:linkedin\.com)?\/in\/([a-zA-Z0-9%_-]+)/i);
    if (match && match[1]) {
        return decodeURIComponent(match[1]).replace(/\/+$/, "");
    }
    return null;
}

async function handleBackgroundOwnProfileFetch(): Promise<OwnProfileData | null> {
    console.log("[ServiceWorker] 🚀 Auto-syncing own profile via Voyager API...");
    try {
        const csrfToken = await getLinkedInCsrfToken();
        let ownData: OwnProfileData | null = null;

        if (csrfToken) {
            try {
                const apiHeaders: Record<string, string> = {
                    "csrf-token": csrfToken,
                    "x-restli-protocol-version": "2.0.0",
                    "accept": "application/vnd.linkedin.normalized+json+2.1",
                };

                const meResp = await fetch("https://www.linkedin.com/voyager/api/me", {
                    method: "GET",
                    credentials: "include",
                    headers: apiHeaders,
                });

                let publicSlug = "me";
                if (meResp.ok) {
                    const meJson = await meResp.json();
                    const mini = meJson.miniProfile || meJson;
                    if (mini.publicIdentifier) {
                        publicSlug = mini.publicIdentifier;
                    }
                    if (mini.firstName && mini.lastName) {
                        const name = `${mini.firstName} ${mini.lastName}`.trim();
                        await mergeUserProfile({ name });
                    }
                }

                ownData = await fetchLinkedInProfileData(publicSlug);
                if (!ownData || !ownData.skills?.length) {
                    const meData = await fetchLinkedInProfileData("me");
                    if (meData) {
                        ownData = {
                            ...ownData,
                            ...meData,
                            skills: Array.from(new Set([...(ownData?.skills || []), ...(meData.skills || [])])),
                        };
                    }
                }
            } catch (err) {
                console.warn("[ServiceWorker] Own profile Voyager fetch error:", err);
            }
        }

        if (!ownData) {
            ownData = await fetchLinkedInProfileData("me");
        }

        if (ownData && (ownData.name || ownData.headline || ownData.skills?.length || ownData.about)) {
            await mergeUserProfile({
                name: ownData.name && ownData.name !== "me" && !ownData.name.startsWith("ACoA") ? ownData.name : undefined,
                role: ownData.headline,
                skills: ownData.skills,
                background: ownData.about,
            });

            console.log(`[ServiceWorker] ✅ Successfully synced own profile: ${ownData.skills.length} skills, role="${ownData.headline || "none"}"`);
            return ownData;
        }
    } catch (err) {
        console.error("[ServiceWorker] Background own profile fetch error:", err);
    }

    return null;
}

function parseRawHtml(rawHtml: string, fallbackSlug: string): OwnProfileData | null {
    const result: {
        name?: string;
        headline?: string;
        about?: string;
        skills: string[];
        recentPosts: string[];
    } = { skills: [], recentPosts: [] };

    const jsonMatches = rawHtml.match(/<!--\s*(\{[\s\S]*?\})\s*-->/g) || [];
    const visited = new Set<unknown>();

    for (const match of jsonMatches) {
        const clean = match
            .replace(/^<!--\s*/, "")
            .replace(/\s*-->$/, "")
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&#39;/g, "'")
            .trim();
        if (clean.startsWith("{") && clean.endsWith("}")) {
            try {
                const parsed = JSON.parse(clean);
                inspectObject(parsed, result, visited, 0);
            } catch {
                // Ignore
            }
        }
    }

    // JSON-LD scripts
    const ldJsonMatches = rawHtml.match(/<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
    for (const tag of ldJsonMatches) {
        const content = tag.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "").trim();
        if (content.startsWith("{") && content.endsWith("}")) {
            try {
                const parsed = JSON.parse(content);
                inspectObject(parsed, result, visited, 0);
            } catch {
                // Ignore
            }
        }
    }

    return {
        slug: fallbackSlug,
        name: result.name || fallbackSlug,
        headline: result.headline,
        about: result.about,
        skills: Array.from(new Set(result.skills)).slice(0, 50),
        recentPosts: result.recentPosts.slice(0, 5),
    };
}



function inspectObject(
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
            if (item && typeof item === "object") {
                inspectObject(item, result, visited, depth + 1);
            }
        }
        return;
    }

    const record = obj as Record<string, unknown>;
    const typeStr = typeof record.$type === "string" ? record.$type : "";

    // 1. JSON-LD Person
    if (record["@type"] === "Person" || record["@type"] === "http://schema.org/Person") {
        if (typeof record.name === "string" && !result.name) result.name = record.name.trim();
        if (typeof record.jobTitle === "string" && !result.headline) result.headline = record.jobTitle.trim();
        if (typeof record.description === "string" && !result.about) result.about = record.description.trim();
        if (Array.isArray(record.knowsAbout)) {
            for (const s of record.knowsAbout) {
                const str = getValStr(s);
                if (str && isValidSkillStr(str) && !result.skills.includes(str)) result.skills.push(str);
            }
        }
    }

    // 2. Voyager Profile
    if (
        typeStr.includes("identity.profile.Profile") ||
        (record.summary && record.headline) ||
        (record.firstName && record.lastName)
    ) {
        const sum = getValStr(record.summary);
        if (sum && !result.about) result.about = sum;
        const hl = getValStr(record.headline);
        if (hl && !result.headline) result.headline = hl;
        const fn = getValStr(record.firstName);
        const ln = getValStr(record.lastName);
        if (fn && ln && !result.name) result.name = `${fn} ${ln}`.trim();
    }

    // 3. Skill Entity
    const isSkill =
        (typeStr.includes("Skill") && !typeStr.includes("Component")) ||
        typeStr.includes("StandardizedSkill") ||
        record.skillName !== undefined ||
        record.skillTopic !== undefined;

    if (isSkill) {
        const sk =
            getValStr(record.name) ||
            getValStr(record.skillName) ||
            getValStr(record.title) ||
            getValStr(record.skillTopic) ||
            (record.skill && typeof record.skill === "object" ? getValStr((record.skill as Record<string, unknown>).name) : "") ||
            (record.standardizedSkill && typeof record.standardizedSkill === "object" ? getValStr((record.standardizedSkill as Record<string, unknown>).name) : "");

        if (sk && isValidSkillStr(sk) && !result.skills.includes(sk)) {
            result.skills.push(sk);
        }
    }

    // 4. Arrays of skills specifically on skill properties
    if (Array.isArray(record.skills)) {
        for (const s of record.skills) {
            const str = getValStr(s);
            if (str && isValidSkillStr(str) && !result.skills.includes(str)) result.skills.push(str);
        }
    }

    // 5. Activity / Post
    if (typeStr.includes("Update") || typeStr.includes("Share") || record.commentary) {
        const commentary = record.commentary as Record<string, unknown> | undefined;
        const postText = getValStr(commentary?.text) || getValStr(record.text) || getValStr(record.commentary);
        if (postText && postText.length > 25 && !result.recentPosts.includes(postText)) {
            result.recentPosts.push(postText.slice(0, 300));
        }
    }

    // 6. Recurse
    for (const [key, val] of Object.entries(record)) {
        if (key.startsWith("$recipe") || key === "paging" || key === "metadata") continue;
        if (val && typeof val === "object") {
            inspectObject(val, result, visited, depth + 1);
        }
    }
}

function getValStr(v: unknown): string {
    if (!v) return "";
    if (typeof v === "string") return v.trim();
    if (typeof v === "object") {
        const r = v as Record<string, unknown>;
        if (typeof r.text === "string") return r.text.trim();
        if (typeof r.value === "string") return r.value.trim();
        if (r.text && typeof r.text === "object") return getValStr(r.text);
    }
    return "";
}

function isValidSkillStr(t: string): boolean {
    if (!t || typeof t !== "string") return false;
    const clean = t.trim();
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

async function getLinkedInCsrfToken(): Promise<string | null> {
    try {
        const cookie = await chrome.cookies.get({
            url: "https://www.linkedin.com",
            name: "JSESSIONID",
        });
        if (cookie?.value) {
            return cookie.value.replace(/^"|"$/g, "").trim();
        }
    } catch (err) {
        console.warn("[ServiceWorker] Could not get JSESSIONID cookie:", err);
    }
    return null;
}

export async function fetchLinkedInProfileData(profileUrlOrSlug: string): Promise<OwnProfileData | null> {
    if (!profileUrlOrSlug) return null;
    const slug = extractSlugFromUrl(profileUrlOrSlug);
    if (!slug || slug.length < 2) return null;

    console.log(`[ServiceWorker] 🚀 Fetching LinkedIn profile data for: "${slug}"...`);

    const csrfToken = await getLinkedInCsrfToken();

    // 1. Try LinkedIn Voyager API if CSRF token is available
    if (csrfToken) {
        try {
            const apiHeaders: Record<string, string> = {
                "csrf-token": csrfToken,
                "x-restli-protocol-version": "2.0.0",
                "accept": "application/vnd.linkedin.normalized+json+2.1",
            };

            const voyagerUrl = `https://www.linkedin.com/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=${encodeURIComponent(slug)}&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-109`;
            const resp = await fetch(voyagerUrl, {
                method: "GET",
                credentials: "include",
                headers: apiHeaders,
            });

            if (resp.ok) {
                const json = await resp.json();
                const result: OwnProfileData = {
                    slug,
                    name: slug,
                    skills: [],
                    recentPosts: [],
                };
                inspectObject(json, result, new Set(), 0);
                if (result.headline || result.about || result.skills.length > 0) {
                    console.log(`[ServiceWorker] ✅ Successfully fetched from Voyager API for "${slug}":`, {
                        headline: result.headline,
                        skills: result.skills.length,
                        about: result.about ? "Found" : "None",
                    });
                    return result;
                }
            }
        } catch (apiErr) {
            console.warn(`[ServiceWorker] Voyager API error for ${slug}:`, apiErr);
        }
    }

    // 2. Fallback: Fetch raw HTML and parse embedded JSON
    try {
        const fetchHeaders = {
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        };

        const mainUrl = `https://www.linkedin.com/in/${slug}/`;
        const resp = await fetch(mainUrl, {
            method: "GET",
            credentials: "include",
            headers: fetchHeaders,
        });

        if (resp.ok) {
            const finalUrl = resp.url || mainUrl;
            const resolvedSlug = extractSlugFromUrl(finalUrl) || slug;
            const rawHtml = await resp.text();
            const parsed = parseRawHtml(rawHtml, resolvedSlug);

            if (parsed) {
                try {
                    const skillsResp = await fetch(`https://www.linkedin.com/in/${resolvedSlug}/details/skills/`, {
                        method: "GET",
                        credentials: "include",
                        headers: fetchHeaders,
                    });
                    if (skillsResp.ok) {
                        const skillsHtml = await skillsResp.text();
                        const skillsParsed = parseRawHtml(skillsHtml, resolvedSlug);
                        if (skillsParsed?.skills?.length) {
                            parsed.skills = Array.from(new Set([...parsed.skills, ...skillsParsed.skills])).slice(0, 50);
                        }
                    }
                } catch {
                    // Ignore
                }
            }

            if (parsed && (parsed.headline || parsed.about || parsed.skills.length > 0)) {
                return parsed;
            }
        }
    } catch (htmlErr) {
        console.warn(`[ServiceWorker] HTML fetch error for ${slug}:`, htmlErr);
    }

    return null;
}

function parseHeadlineStr(headline?: string): { company?: string; position?: string } {
    if (!headline) return {};
    const atMatch = /^(.+?)\s+at\s+(.+)$/i.exec(headline);
    if (atMatch) return { position: atMatch[1].trim(), company: atMatch[2].trim() };
    const pipeMatch = /^(.+?)\s*\|\s*(.+)$/.exec(headline);
    if (pipeMatch) return { position: pipeMatch[1].trim(), company: pipeMatch[2].trim() };
    return { position: headline };
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleGenerateReply(
    payload: GenerateReplyPayload
): Promise<BackgroundToContentMessage> {
    try {
        let userProfile = await getUserProfile();

        // 1. Ensure user profile is rich
        if (!userProfile || !userProfile.role || !userProfile.skills?.length) {
            userProfile = {
                name: payload.myName || userProfile?.name || "Sayem Ahmad",
                role: userProfile?.role || "Full Stack Developer",
                skills: userProfile?.skills?.length ? userProfile.skills : ["React", "TypeScript", "Python", "FastAPI", "Web Development"],
                background: userProfile?.background || "Full Stack Developer building modern web applications, APIs, and AI tools.",
                style: userProfile?.style || "professional",
            };
        } else if (payload.myName) {
            userProfile = {
                ...userProfile,
                name: payload.myName,
            };
        }

        // 2. Ensure recipient profile is enriched
        const recipient = { ...payload.context.recipient };
        const recipientUrl = recipient.profileUrl;
        if (recipientUrl && (!recipient.headline || !recipient.skills?.length || !recipient.about)) {
            try {
                const fetchedRecip = await fetchLinkedInProfileData(recipientUrl);
                if (fetchedRecip) {
                    recipient.headline = recipient.headline || fetchedRecip.headline;
                    recipient.about = recipient.about || fetchedRecip.about;
                    recipient.skills = (fetchedRecip.skills && fetchedRecip.skills.length > 0) ? fetchedRecip.skills : recipient.skills;
                    recipient.recentPosts = (fetchedRecip.recentPosts && fetchedRecip.recentPosts.length > 0) ? fetchedRecip.recentPosts : recipient.recentPosts;

                    if (!recipient.company || !recipient.position) {
                        const parsed = parseHeadlineStr(recipient.headline);
                        recipient.company = recipient.company || parsed.company;
                        recipient.position = recipient.position || parsed.position;
                    }
                }
            } catch (recipErr) {
                console.warn("[ServiceWorker] Recipient enrich error:", recipErr);
            }
        }

        const requestBody: GenerateReplyRequest = {
            context: {
                ...payload.context,
                recipient,
            },
            userProfile,
            myName: payload.myName || userProfile.name,
            recipientName: payload.recipientName || recipient.name,
            relationship: payload.relationship,
            style: payload.style || userProfile.style || "professional",
            userPrompt: payload.userPrompt,
        };

        const response = await fetch(`${API_BASE_URL}/api/generate-reply`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            return {
                type: "REPLY_ERROR",
                error: `API error ${response.status}: ${errorText}`,
            };
        }

        const data = await response.json() as { reply: string; confidence?: number };

        return {
            type: "REPLY_GENERATED",
            payload: {
                text: data.reply,
                confidence: data.confidence,
            },
        };
    } catch (err) {
        const message =
            err instanceof Error ? err.message : "Unknown error occurred";

        // Distinguish network errors (backend not running) from other errors
        const isNetworkError =
            message.includes("Failed to fetch") ||
            message.includes("NetworkError");

        return {
            type: "REPLY_ERROR",
            error: isNetworkError
                ? "Cannot reach backend. Is the FastAPI server running on localhost:8000?"
                : message,
        };
    }
}
