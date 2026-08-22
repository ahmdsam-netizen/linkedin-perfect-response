import { useState, useEffect } from "react";
import { getUserProfile, getDefaultUserProfile } from "../../shared/storage.ts";
import type { CommunicationStyle, ConversationContext, ReplyOption, UserProfile } from "../../shared/types.ts";
import type {
    ContentToBackgroundMessage,
    BackgroundToContentMessage,
    PopupToContentMessage,
    ContentToPopupMessage,
} from "../../shared/messages.ts";

const RELATIONSHIPS = [
    { label: "🤝 Connection", value: "Connection" },
    { label: "💼 Colleague", value: "Colleague" },
    { label: "🎯 Recruiter", value: "Recruiter" },
    { label: "🚀 Hiring Manager", value: "Hiring Manager" },
    { label: "🏢 Client / Lead", value: "Client / Lead" },
    { label: "👥 Friend", value: "Friend" },
    { label: "❄️ Cold Outreach", value: "Cold Outreach" },
    { label: "🎓 Mentor / Mentee", value: "Mentor / Mentee" },
];

const STYLES: { label: string; value: CommunicationStyle; desc: string }[] = [
    { label: "💼 Professional", value: "professional", desc: "Polite & business-ready" },
    { label: "☕ Casual & Friendly", value: "casual", desc: "Warm & conversational" },
    { label: "⚡ Concise & Direct", value: "concise", desc: "Short & to the point" },
    { label: "📝 Detailed", value: "detailed", desc: "Thorough & in-depth" },
    { label: "🎯 Persuasive / Pitch", value: "persuasive", desc: "Value-driven & engaging" },
    { label: "🔥 Enthusiastic", value: "enthusiastic", desc: "Energetic & eager" },
];

const PROMPT_SUGGESTIONS = [
    { label: "📅 Ask for 15-min Call", text: "Suggest a quick 15-minute introductory call next week." },
    { label: "🙏 Thank & Connect", text: "Thank them for reaching out and say I would love to connect and follow their updates." },
    { label: "💼 Share Experience", text: "Highlight relevant background and offer to collaborate on upcoming projects." },
    { label: "👋 Follow-up", text: "Politely follow up on the previous message and ask for an update." },
    { label: "🤝 Polite Decline", text: "Thank them for the opportunity but politely decline while keeping the door open for future." },
];

export function ReplyGenerator() {
    const [userProfile, setUserProfile] = useState<UserProfile>(getDefaultUserProfile());
    const [myName, setMyName] = useState("");
    const [recipientName, setRecipientName] = useState("");
    const [relationship, setRelationship] = useState("Connection");
    const [style, setStyle] = useState<CommunicationStyle>("professional");
    const [promptText, setPromptText] = useState("");
    const [context, setContext] = useState<ConversationContext | null>(null);

    const [activeTabConnected, setActiveTabConnected] = useState(false);
    const [recipientHeadline, setRecipientHeadline] = useState<string | null>(null);

    const [recipientUrl, setRecipientUrl] = useState("");

    const [generating, setGenerating] = useState(false);
    const [generatedReply, setGeneratedReply] = useState("");
    const [replyOptions, setReplyOptions] = useState<ReplyOption[]>([]);
    const [activeOptionIndex, setActiveOptionIndex] = useState(0);

    const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

    useEffect(() => {
        let isMounted = true;

        // 1. Load user profile for default sender name
        getUserProfile().then((stored) => {
            if (isMounted && stored) {
                setUserProfile(stored);
                if (stored.name) setMyName(stored.name);
            }
        });

        // 2. Check storage for the last active conversation context clicked
        chrome.storage.local.get("activeConversationContext").then((res) => {
            if (isMounted && res.activeConversationContext) {
                const ctx = res.activeConversationContext as ConversationContext;
                setContext(ctx);
                if (ctx.recipient?.name && ctx.recipient.name !== "Unknown") {
                    setRecipientName(ctx.recipient.name);
                    setActiveTabConnected(true);
                    if (ctx.recipient.headline) {
                        setRecipientHeadline(ctx.recipient.headline);
                    }
                    if (ctx.recipient.profileUrl) {
                        setRecipientUrl(ctx.recipient.profileUrl);
                    }
                }
            }
        });

        // 3. Query active tab and auto-extract active conversation as live sync
        chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
            const tab = tabs[0];
            if (isMounted && tab?.id && tab.url?.includes("linkedin.com")) {
                const message: PopupToContentMessage = { type: "EXTRACT_ACTIVE_CONVERSATION" };
                chrome.tabs.sendMessage(tab.id, message).then((response: ContentToPopupMessage) => {
                    if (isMounted && response?.type === "CONVERSATION_EXTRACTED" && response.payload) {
                        const ctx = response.payload;
                        setContext(ctx);
                        if (ctx.recipient?.name && ctx.recipient.name !== "Unknown") {
                            setRecipientName(ctx.recipient.name);
                            setActiveTabConnected(true);
                            if (ctx.recipient.headline) {
                                setRecipientHeadline(ctx.recipient.headline);
                            }
                            if (ctx.recipient.profileUrl) {
                                setRecipientUrl(ctx.recipient.profileUrl);
                            }
                        }
                    }
                }).catch(() => {
                    // Content script not loaded or not on active chat
                });
            }
        });

        return () => {
            isMounted = false;
        };
    }, []);

    async function handleGenerate() {
        setGenerating(true);
        setStatusMessage(null);

        try {
            const latestProfile = (await getUserProfile()) || userProfile;

            // Build conversation context
            const activeContext: ConversationContext = context || {
                recipient: {
                    name: recipientName.trim() || "Recipient",
                },
                messages: [],
            };

            const payload = {
                context: {
                    ...activeContext,
                    recipient: {
                        ...activeContext.recipient,
                        name: recipientName.trim() || activeContext.recipient.name,
                        profileUrl: recipientUrl.trim() || activeContext.recipient.profileUrl,
                    },
                },
                myName: myName.trim() || latestProfile.name || "LinkedIn User",
                recipientName: recipientName.trim() || activeContext.recipient.name,
                relationship,
                style,
                userPrompt: promptText.trim(),
            };

            const message: ContentToBackgroundMessage = {
                type: "GENERATE_REPLY",
                payload,
            };

            const response = await chrome.runtime.sendMessage<
                ContentToBackgroundMessage,
                BackgroundToContentMessage
            >(message);

            if (response && response.type === "REPLY_GENERATED") {
                const opts = response.payload.replies || [
                    { style: style || "professional", text: response.payload.text }
                ];
                setReplyOptions(opts);
                setActiveOptionIndex(0);
                setGeneratedReply(opts[0]?.text || response.payload.text || "");
            } else if (response && response.type === "REPLY_ERROR") {
                setStatusMessage({ type: "error", text: response.error || "Failed to generate reply." });
            } else {
                setStatusMessage({ type: "error", text: "Background worker did not respond." });
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setStatusMessage({ type: "error", text: msg });
        } finally {
            setGenerating(false);
        }
    }

    function selectReplyTab(idx: number) {
        setActiveOptionIndex(idx);
        if (replyOptions[idx]) {
            setGeneratedReply(replyOptions[idx].text);
        }
    }

    async function handleInsertIntoChat() {
        if (!generatedReply.trim()) return;

        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            const tab = tabs[0];

            if (!tab?.id || !tab.url?.includes("linkedin.com")) {
                setStatusMessage({ type: "error", text: "⚠️ Please focus an open LinkedIn tab to insert the reply!" });
                return;
            }

            const message: PopupToContentMessage = {
                type: "INSERT_REPLY_TEXT",
                payload: { text: generatedReply },
            };

            const response = await chrome.tabs.sendMessage(tab.id, message) as ContentToPopupMessage;

            if (response?.type === "REPLY_INSERTED" && response.success) {
                setStatusMessage({ type: "success", text: "🚀 Reply inserted into LinkedIn message box!" });
                setTimeout(() => setStatusMessage(null), 4000);
            } else {
                setStatusMessage({ type: "info", text: "ℹ️ Please open a message chat in LinkedIn and click insert again!" });
            }
        } catch (err) {
            console.error("Insert error:", err);
            setStatusMessage({ type: "info", text: "ℹ️ Message box not found on page. Copied to clipboard instead!" });
            await navigator.clipboard.writeText(generatedReply);
        }
    }

    async function handleCopy() {
        if (!generatedReply.trim()) return;
        try {
            await navigator.clipboard.writeText(generatedReply);
            setStatusMessage({ type: "success", text: "✅ Copied to clipboard!" });
            setTimeout(() => setStatusMessage(null), 3000);
        } catch (err) {
            console.error("Copy error:", err);
        }
    }

    function applyPromptSuggestion(text: string) {
        setPromptText(text);
    }

    const styleLabels: Record<string, string> = {
        professional: "💼 Professional",
        conversational: "☕ Conversational",
        concise: "⚡ Concise",
    };

    return (
        <div className="reply-generator-root">
            {/* Active Chat Detection Banner */}
            <div className={`chat-status-banner ${activeTabConnected ? "connected" : "idle"}`}>
                <div className="chat-status-indicator">
                    <span className="dot"></span>
                    <span className="chat-status-text">
                        {activeTabConnected
                            ? `Connected: ${recipientName}${recipientHeadline ? ` • ${recipientHeadline.slice(0, 40)}...` : ""}`
                            : "Auto-detect: Open any LinkedIn message chat"}
                    </span>
                </div>
            </div>

            {/* Status alerts */}
            {statusMessage && (
                <div className={`status-banner ${statusMessage.type}`}>
                    {statusMessage.text}
                </div>
            )}

            {/* Names Row */}
            <div className="form-row-2">
                <div className="form-group-compact">
                    <label htmlFor="input-my-name">Your Name</label>
                    <input
                        id="input-my-name"
                        type="text"
                        placeholder="Your Name"
                        value={myName}
                        onChange={(e) => setMyName(e.target.value)}
                    />
                </div>
                <div className="form-group-compact">
                    <label htmlFor="input-recip-name">Recipient Name</label>
                    <input
                        id="input-recip-name"
                        type="text"
                        placeholder="Other User Name"
                        value={recipientName}
                        onChange={(e) => setRecipientName(e.target.value)}
                    />
                </div>
            </div>

            {/* Recipient Profile URL Field */}
            <div className="form-group-compact">
                <label htmlFor="input-recip-url">Recipient Profile URL (Auto-detected / Optional)</label>
                <input
                    id="input-recip-url"
                    type="url"
                    placeholder="https://www.linkedin.com/in/username/"
                    value={recipientUrl}
                    onChange={(e) => setRecipientUrl(e.target.value)}
                />
            </div>

            {/* Relationship Chips */}
            <div className="form-group-compact">
                <label>Relationship Between Us</label>
                <div className="chips-grid">
                    {RELATIONSHIPS.map((r) => (
                        <button
                            type="button"
                            key={r.value}
                            className={`chip-btn ${relationship === r.value ? "active" : ""}`}
                            onClick={() => setRelationship(r.value)}
                        >
                            {r.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Style Chips */}
            <div className="form-group-compact">
                <label>Style for Reply</label>
                <div className="chips-grid">
                    {STYLES.map((s) => (
                        <button
                            type="button"
                            key={s.value}
                            className={`chip-btn ${style === s.value ? "active" : ""}`}
                            onClick={() => setStyle(s.value)}
                            title={s.desc}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Prompt Textarea */}
            <div className="form-group-compact">
                <label htmlFor="input-prompt">Prompt / Specific Goal (Optional)</label>
                <textarea
                    id="input-prompt"
                    rows={2}
                    placeholder="e.g. Congratulate them on the role, mention our mutual project, and ask for a 15-min call next week..."
                    value={promptText}
                    onChange={(e) => setPromptText(e.target.value)}
                />
                <div className="prompt-suggestion-chips">
                    {PROMPT_SUGGESTIONS.map((ps) => (
                        <button
                            type="button"
                            key={ps.label}
                            className="prompt-chip"
                            onClick={() => applyPromptSuggestion(ps.text)}
                        >
                            {ps.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Generate Action */}
            <button
                type="button"
                className="btn-generate-main"
                onClick={handleGenerate}
                disabled={generating}
            >
                {generating ? "⏳ Generating Replies..." : "✨ Generate Reply Options"}
            </button>

            {/* Generated Reply Box */}
            {generatedReply && (
                <div className="reply-preview-container">
                    {/* Option Tabs if 3 replies available */}
                    {replyOptions.length > 1 && (
                        <div className="reply-style-tabs" style={{ display: "flex", gap: "6px", marginBottom: "10px" }}>
                            {replyOptions.map((opt, idx) => (
                                <button
                                    type="button"
                                    key={opt.style + idx}
                                    className={`chip-btn ${activeOptionIndex === idx ? "active" : ""}`}
                                    style={{ flex: 1, padding: "6px 8px", fontSize: "12px", textTransform: "capitalize" }}
                                    onClick={() => selectReplyTab(idx)}
                                >
                                    {styleLabels[opt.style] || opt.style}
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="reply-preview-top">
                        <span className="reply-preview-label">
                            📝 {styleLabels[replyOptions[activeOptionIndex]?.style] || replyOptions[activeOptionIndex]?.style || "Generated"} Reply Preview
                        </span>
                        <button type="button" className="btn-mini-regen" onClick={handleGenerate} disabled={generating}>
                            🔄 Regenerate
                        </button>
                    </div>
                    <textarea
                        className="reply-preview-textarea"
                        rows={4}
                        value={generatedReply}
                        onChange={(e) => {
                            setGeneratedReply(e.target.value);
                            if (replyOptions[activeOptionIndex]) {
                                const updated = [...replyOptions];
                                updated[activeOptionIndex] = { ...updated[activeOptionIndex], text: e.target.value };
                                setReplyOptions(updated);
                            }
                        }}
                    />
                    <div className="reply-preview-actions">
                        <button type="button" className="btn-insert-main" onClick={handleInsertIntoChat}>
                            🚀 Insert into LinkedIn Chat
                        </button>
                        <button type="button" className="btn-copy-main" onClick={handleCopy}>
                            📋 Copy
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
