import { useState, useEffect } from "react";
import { getAllCachedProfiles, clearProfileCache, type CachedProfile } from "../../shared/profileCache.ts";

export function Settings() {
    const [cachedProfiles, setCachedProfiles] = useState<CachedProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [msg, setMsg] = useState<string | null>(null);

    useEffect(() => {
        loadCache();
    }, []);

    async function loadCache() {
        setLoading(true);
        try {
            const profiles = await getAllCachedProfiles();
            setCachedProfiles(profiles);
        } catch (err) {
            console.error("Error reading profile cache:", err);
        } finally {
            setLoading(false);
        }
    }

    async function handleClearCache() {
        await clearProfileCache();
        setCachedProfiles([]);
        setMsg("🧹 Profile cache cleared!");
        setTimeout(() => setMsg(null), 3000);
    }

    return (
        <div className="settings">
            <div className="cache-section">
                <div className="cache-header">
                    <div>
                        <h3 className="section-title">⚡ Background Fetched Profiles</h3>
                        <p className="section-subtitle">
                            {cachedProfiles.length} profile(s) cached silently from LinkedIn
                        </p>
                    </div>
                    <div className="cache-actions">
                        <button type="button" className="btn-cache-action" onClick={loadCache}>
                            🔄 Refresh
                        </button>
                        {cachedProfiles.length > 0 && (
                            <button type="button" className="btn-cache-action danger" onClick={handleClearCache}>
                                🗑️ Clear
                            </button>
                        )}
                    </div>
                </div>

                {msg && <div className="sync-status-msg">{msg}</div>}

                {loading ? (
                    <div className="loading">Loading cached profiles...</div>
                ) : cachedProfiles.length === 0 ? (
                    <div className="empty-cache-box">
                        <span className="empty-cache-icon">🔍</span>
                        <p>No profiles cached yet.</p>
                        <span className="empty-cache-tip">
                            When you open conversations or visit profiles, the silent background fetcher auto-caches their skills, headline, and about!
                        </span>
                    </div>
                ) : (
                    <div className="cached-list">
                        {cachedProfiles.map((p) => (
                            <div key={p.slug} className="cached-item-card">
                                <div className="cached-item-top">
                                    <span className="cached-name">{p.name}</span>
                                    <span className="cached-slug">/in/{p.slug}</span>
                                </div>
                                {p.headline && <div className="cached-headline">{p.headline}</div>}
                                {p.about && (
                                    <div className="cached-about">
                                        <strong>About:</strong> {p.about.slice(0, 100)}...
                                    </div>
                                )}
                                <div className="cached-skills-block">
                                    <span className="cached-skills-label">
                                        Skills ({p.skills.length}):
                                    </span>
                                    {p.skills.length > 0 ? (
                                        <div className="cached-skills-tags">
                                            {p.skills.map((s) => (
                                                <span key={s} className="cached-skill-pill">
                                                    {s}
                                                </span>
                                            ))}
                                        </div>
                                    ) : (
                                        <span className="no-skills-text">No skills found</span>
                                    )}
                                </div>
                                {p.recentPosts && p.recentPosts.length > 0 && (
                                    <div className="cached-posts-count">
                                        📝 {p.recentPosts.length} recent activity post(s)
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

