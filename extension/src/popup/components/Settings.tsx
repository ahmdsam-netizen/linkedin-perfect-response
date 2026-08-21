/**
 * popup/components/Settings.tsx
 * Placeholder settings panel for V1.
 * Future: response length, tone, number of suggestions, etc.
 */

export function Settings() {
    return (
        <div className="settings">
            <div className="settings-placeholder">
                <span className="settings-icon">⚙️</span>
                <h3>Settings</h3>
                <p>Advanced settings will be available in a future update.</p>
                <ul className="settings-coming-soon">
                    <li>Response length control</li>
                    <li>Custom tone presets</li>
                    <li>Number of reply suggestions</li>
                    <li>Auto-detect relationship type</li>
                    <li>Backend server configuration</li>
                </ul>
            </div>
        </div>
    );
}
