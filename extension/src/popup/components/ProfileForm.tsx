import { useState, useEffect } from "react";
import { getUserProfile, saveUserProfile, getDefaultUserProfile } from "../../shared/storage.ts";
import type { UserProfile, CommunicationStyle } from "../../shared/types.ts";

const STYLE_OPTIONS: { value: CommunicationStyle; label: string; desc: string }[] = [
    { value: "professional", label: "Professional", desc: "Formal, business-appropriate tone" },
    { value: "casual", label: "Casual", desc: "Friendly and relaxed" },
    { value: "concise", label: "Concise", desc: "Short and to the point" },
    { value: "detailed", label: "Detailed", desc: "Thorough and comprehensive" },
];

export function ProfileForm() {
    const [profile, setProfile] = useState<UserProfile>(getDefaultUserProfile());
    const [skillInput, setSkillInput] = useState("");
    const [saved, setSaved] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getUserProfile().then((stored) => {
            if (stored) setProfile(stored);
            setLoading(false);
        });
    }, []);

    function handleChange(field: keyof UserProfile, value: UserProfile[typeof field]) {
        setProfile((prev) => ({ ...prev, [field]: value }));
        setSaved(false);
    }

    function addSkill() {
        const trimmed = skillInput.trim();
        if (!trimmed || profile.skills.includes(trimmed)) return;
        handleChange("skills", [...profile.skills, trimmed]);
        setSkillInput("");
    }

    function removeSkill(skill: string) {
        handleChange("skills", profile.skills.filter((s) => s !== skill));
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

            <div className="form-group">
                <label>Communication Style</label>
                <div className="style-options">
                    {STYLE_OPTIONS.map((opt) => (
                        <label
                            key={opt.value}
                            className={[
                                "style-option",
                                profile.style === opt.value ? "selected" : "",
                            ].join(" ")}
                        >
                            <input
                                type="radio"
                                name="style"
                                value={opt.value}
                                checked={profile.style === opt.value}
                                onChange={() => handleChange("style", opt.value)}
                            />
                            <span className="style-label">{opt.label}</span>
                            <span className="style-desc">{opt.desc}</span>
                        </label>
                    ))}
                </div>
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
