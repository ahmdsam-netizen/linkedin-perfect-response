import { useState, useEffect, useCallback } from "react";
import { getUserProfile, getDefaultUserProfile } from "../../shared/storage.ts";
import type { CommunicationStyle, ConversationContext, MemoryContextInfo, ReplyOption, UserProfile } from "../../shared/types.ts";
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
    const [memoryContext, setMemoryContext] = useState<MemoryContextInfo | null>(null);

    const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

    const checkActiveConversation = useCallback(async () => {
        try {
            // 1. Check storage for the last active conversation context clicked via injected button
            const res = await chrome.storage.local.get("activeConversationContext");
            if (res.activeConversationContext) {
                const ctx = res.activeConversationContext as ConversationContext;
                if (ctx.recipient?.name && ctx.recipient.name !== "Unknown" && ctx.recipient.name !== "Recipient") {
                    setContext(ctx);
                    setRecipientName(ctx.recipient.name);
                    setActiveTabConnected(true);
                    if (ctx.recipient.headline) setRecipientHeadline(ctx.recipient.headline);
                    if (ctx.recipient.profileUrl) setRecipientUrl(ctx.recipient.profileUrl);
                }
            }

            // 2. Query active tab and check if on LinkedIn message thread
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            const tab = tabs[0];
            if (tab?.id && tab.url?.includes("linkedin.com")) {
                const message: PopupToContentMessage = { type: "EXTRACT_ACTIVE_CONVERSATION" };
                const response = (await chrome.tabs.sendMessage(tab.id, message).catch(() => null)) as ContentToPopupMessage | null;
                
                if (response?.type === "CONVERSATION_EXTRACTED" && response.payload) {
                    const ctx = response.payload;
                    if (ctx.recipient?.name && ctx.recipient.name !== "Unknown" && ctx.recipient.name !== "Recipient") {
                        setContext(ctx);
                        setRecipientName(ctx.recipient.name);
                        setActiveTabConnected(true);
                        if (ctx.recipient.headline) setRecipientHeadline(ctx.recipient.headline);
                        if (ctx.recipient.profileUrl) setRecipientUrl(ctx.recipient.profileUrl);
                        return;
                    }
                }
            }
        } catch {
            // Not connected to active conversation
        }
    }, []);

    useEffect(() => {
        let isMounted = true;

        // Load user profile for default sender name
        getUserProfile().then((stored) => {
            if (isMounted && stored) {
                setUserProfile(stored);
                if (stored.name) setMyName(stored.name);
            }
        });

        checkActiveConversation();

        return () => {
            isMounted = false;
        };
    }, [checkActiveConversation]);

    async function handleGenerate() {
        if (!activeTabConnected || !recipientName.trim() || recipientName.trim() === "Recipient") {
            setStatusMessage({
                type: "error",
                text: "⚠️ Please open a LinkedIn message conversation with someone first to generate replies.",
            });
            return;
        }

        setGenerating(true);
        setStatusMessage(null);
        setMemoryContext(null);

        try {
            const latestProfile = (await getUserProfile()) || userProfile;

            // Build conversation context
            const activeContext: ConversationContext = context || {
                recipient: {
                    name: recipientName.trim() || "Recipient",
                },
                messages: [],
            };

            // Derive conversation ID from URL or contact name
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            const currentTabUrl = tabs[0]?.url || "";
            const threadMatch = currentTabUrl.match(/\/messaging\/thread\/([^/?#]+)/i);
            const rawConvoId = threadMatch ? threadMatch[1] : `convo-${recipientName.toLowerCase().replace(/\s+/g, "-") || "default"}`;

            const syncPayload = {
                user: {
                    linkedinId: (myName || latestProfile.name || "user").toLowerCase().replace(/\s+/g, "-"),
                    name: myName.trim() || latestProfile.name || "LinkedIn User",
                },
                contact: {
                    linkedinProfileId: recipientUrl ? (recipientUrl.match(/\/in\/([^/?#]+)/i)?.[1] ?? recipientName.toLowerCase().replace(/\s+/g, "-")) : recipientName.toLowerCase().replace(/\s+/g, "-"),
                    name: recipientName.trim() || "Recipient",
                    headline: recipientHeadline || undefined,
                },
                conversation: {
                    linkedinConversationId: rawConvoId,
                },
                messages: (activeContext.messages || []).map((m) => ({
                    senderType: (m.sender === "me" ? "USER" : "CONTACT") as "USER" | "CONTACT",
                    content: m.text,
                })),
            };

            const message: ContentToBackgroundMessage = {
                type: "SYNC_AND_GENERATE_REPLY",
                payload: {
                    syncPayload,
                    instruction: promptText.trim() || undefined,
                    tone: style,
                    style,
                },
            };

            const response = await chrome.runtime.sendMessage<
                ContentToBackgroundMessage,
                BackgroundToContentMessage
            >(message);

            if (response && response.type === "REPLY_GENERATED") {
                const opts = response.payload.replies || [
                    { style: style || "professional", text: response.payload.reply }
                ];
                setReplyOptions(opts);
                setActiveOptionIndex(0);
                setGeneratedReply(opts[0]?.text || response.payload.reply || "");
                if (response.payload.memoryContext) {
                    setMemoryContext(response.payload.memoryContext);
                }
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
                            : "⚠️ No conversation open: Open any LinkedIn message chat"}
                    </span>
                </div>
                {!activeTabConnected && (
                    <button
                        type="button"
                        onClick={checkActiveConversation}
                        style={{
                            background: "none",
                            border: "none",
                            color: "#0a66c2",
                            fontSize: "11px",
                            fontWeight: 700,
                            cursor: "pointer",
                            padding: "2px 6px",
                        }}
                    >
                        🔄 Refresh
                    </button>
                )}
            </div>

            {/* Inactive Conversation Warning Card when not connected */}
            {!activeTabConnected && (
                <div style={{
                    padding: "10px 12px",
                    borderRadius: "8px",
                    background: "rgba(254, 243, 199, 0.9)",
                    border: "1px solid rgba(245, 158, 11, 0.4)",
                    color: "#92400e",
                    fontSize: "11.5px",
                    lineHeight: "1.4",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "8px",
                }}>
                    <span style={{ fontSize: "14px" }}>🔒</span>
                    <div>
                        <strong>Reply Generation Locked</strong>
                        <div style={{ marginTop: "2px", opacity: 0.9 }}>
                            Please navigate to an open conversation in <strong>LinkedIn Messaging</strong> with a connection to generate contextual AI replies.
                        </div>
                    </div>
                </div>
            )}

            {/* Memory Context Badge */}
            {memoryContext && (
                <div style={{
                    fontSize: "11px",
                    color: "rgba(255,255,255,0.85)",
                    padding: "6px 12px",
                    borderRadius: "8px",
                    background: "rgba(10, 102, 194, 0.25)",
                    border: "1px solid rgba(10, 102, 194, 0.4)",
                    marginBottom: "10px",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                }}>
                    <span>💡</span>
                    <span>
                        Memory Active: {memoryContext.factsRetrieved} fact{memoryContext.factsRetrieved !== 1 ? "s" : ""} recalled
                        {memoryContext.summaryUsed ? " · Conversation history active" : ""}
                    </span>
                </div>
            )}

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
                        placeholder="Auto-detected from active chat"
                        value={recipientName}
                        onChange={(e) => setRecipientName(e.target.value)}
                        disabled={!activeTabConnected}
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
                    disabled={!activeTabConnected}
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
                    disabled={!activeTabConnected}
                />
                <div className="prompt-suggestion-chips">
                    {PROMPT_SUGGESTIONS.map((ps) => (
                        <button
                            type="button"
                            key={ps.label}
                            className="prompt-chip"
                            onClick={() => applyPromptSuggestion(ps.text)}
                            disabled={!activeTabConnected}
                        >
                            {ps.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Generate Action - Strictly requires active conversation */}
            <button
                type="button"
                className="btn-generate-main"
                onClick={handleGenerate}
                disabled={generating || !activeTabConnected}
                style={!activeTabConnected ? {
                    opacity: 0.55,
                    cursor: "not-allowed",
                    background: "rgba(100, 116, 139, 0.6)",
                    boxShadow: "none",
                } : undefined}
            >
                {generating
                    ? "⏳ Generating Replies..."
                    : activeTabConnected
                        ? "✨ Generate Reply Options"
                        : "🔒 Open a Conversation to Generate Reply"}
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
                        <button type="button" className="btn-mini-regen" onClick={handleGenerate} disabled={generating || !activeTabConnected}>
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
