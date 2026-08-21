import { useState, useEffect } from "react";
import { getUserProfile, saveUserProfile, getDefaultUserProfile } from "../../shared/storage.ts";
import type { UserProfile } from "../../shared/types.ts";

export function ProfileForm() {
    const [profile, setProfile] = useState<UserProfile>(getDefaultUserProfile());
    const [skillInput, setSkillInput] = useState("");
    const [saved, setSaved] = useState(false);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [syncMessage, setSyncMessage] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        getUserProfile().then((stored) => {
            if (isMounted) {
                if (stored) {
                    setProfile({
                        ...getDefaultUserProfile(),
                        ...stored,
                        skills: Array.isArray(stored.skills) ? stored.skills : [],
                    });
                }
                setLoading(false);
            }
        });
        return () => {
            isMounted = false;
        };
    }, []);

    async function loadProfile() {
        const stored = await getUserProfile();
        if (stored) {
            setProfile({
                ...getDefaultUserProfile(),
                ...stored,
                skills: Array.isArray(stored.skills) ? stored.skills : [],
            });
        }
        setLoading(false);
    }

    async function handleSyncFromLinkedIn() {
        setSyncing(true);
        setSyncMessage(null);

        try {
            // 1. Trigger background Voyager API sync directly using authenticated session cookies
            await chrome.runtime.sendMessage({
                type: "FETCH_OWN_PROFILE_BACKGROUND",
            });

            // 2. Also try page extraction if active tab is on LinkedIn
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            const activeTab = tabs[0];
            if (activeTab?.id && activeTab.url?.includes("linkedin.com")) {
                try {
                    await chrome.tabs.sendMessage(activeTab.id, {
                        type: "EXTRACT_PAGE_PROFILE",
                    });
                } catch {
                    // Ignore content script message failure
                }
            }

            // 3. Reload profile from storage into form
            await loadProfile();
            const current = await getUserProfile();
            const skillCount = current?.skills?.length || 0;
            const role = current?.role || "";

            setSyncMessage(
                `✨ Synced from LinkedIn! (${skillCount} skills detected${role ? `, Role: "${role.slice(0, 30)}..."` : ""})`
            );
        } catch (err) {
            console.error("Sync error:", err);
            setSyncMessage("ℹ️ Tip: Open your LinkedIn tab and try syncing again!");
        } finally {
            setSyncing(false);
            setTimeout(() => setSyncMessage(null), 6000);
        }
    }

    function updateAndPersist(updated: UserProfile) {
        setProfile(updated);
        saveUserProfile(updated).then(() => {
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        });
    }

    function handleChange(field: keyof UserProfile, value: UserProfile[typeof field]) {
        const updated = { ...profile, [field]: value };
        updateAndPersist(updated);
    }

    function addSkill() {
        const trimmed = skillInput.trim();
        if (!trimmed || profile.skills.includes(trimmed)) return;
        const updated = { ...profile, skills: [...profile.skills, trimmed] };
        updateAndPersist(updated);
        setSkillInput("");
    }

    function removeSkill(skill: string) {
        const updated = { ...profile, skills: profile.skills.filter((s) => s !== skill) };
        updateAndPersist(updated);
    }

    function handleSkillKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter") {
            e.preventDefault();
            addSkill();
        }
    }

    async function handleSave() {
        await saveUserProfile(profile);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
    }

    if (loading) {
        return <div className="loading">Loading profile...</div>;
    }

    return (
        <div className="profile-form">
            <div className="sync-banner">
                <div className="sync-banner-header">
                    <span className="sync-badge">⚡ Auto-Sync Active</span>
                    <button
                        type="button"
                        className="btn-sync"
                        onClick={handleSyncFromLinkedIn}
                        disabled={syncing}
                    >
                        {syncing ? "🔄 Syncing..." : "🔄 Sync from Page"}
                    </button>
                </div>
                <p className="sync-tip">
                    Extension auto-detects your name, headline, skills & about when you browse LinkedIn or visit your profile!
                </p>
                {syncMessage && <div className="sync-status-msg">{syncMessage}</div>}
            </div>

            <div className="form-group">
                <label htmlFor="name">Your Name</label>
                <input
                    id="name"
                    type="text"
                    placeholder="e.g. Sam Johnson"
                    value={profile.name}
                    onChange={(e) => handleChange("name", e.target.value)}
                />
            </div>

            <div className="form-group">
                <label htmlFor="role">Your Role</label>
                <input
                    id="role"
                    type="text"
                    placeholder="e.g. Software Engineering Student"
                    value={profile.role}
                    onChange={(e) => handleChange("role", e.target.value)}
                />
            </div>

            <div className="form-group">
                <label>Skills</label>
                <div className="skill-input-row">
                    <input
                        type="text"
                        placeholder="Add a skill (press Enter)"
                        value={skillInput}
                        onChange={(e) => setSkillInput(e.target.value)}
                        onKeyDown={handleSkillKeyDown}
                    />
                    <button type="button" className="btn-add-skill" onClick={addSkill}>
                        +
                    </button>
                </div>
                {profile.skills.length > 0 && (
                    <div className="skill-tags">
                        {profile.skills.map((skill) => (
                            <span key={skill} className="skill-tag">
                                {skill}
                                <button
                                    type="button"
                                    onClick={() => removeSkill(skill)}
                                    aria-label={`Remove ${skill}`}
                                >
                                    x
                                </button>
                            </span>
                        ))}
                    </div>
                )}
            </div>

            <div className="form-group">
                <label htmlFor="background">Background</label>
                <textarea
                    id="background"
                    rows={3}
                    placeholder="Brief background about yourself that helps the AI craft better replies..."
                    value={profile.background}
                    onChange={(e) => handleChange("background", e.target.value)}
                />
            </div>

            <button
                type="button"
                className={["btn-save", saved ? "saved" : ""].join(" ")}
                onClick={handleSave}
            >
                {saved ? "✅ Saved!" : "Save Profile"}
            </button>
        </div>
    );
}
