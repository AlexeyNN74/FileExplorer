import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { persistErrorReport, captureErrorReport } from './utils/errorDiagnostics';
import SettingsProvider from './providers/SettingsProvider';
import ThemeProvider from './providers/ThemeProvider';
import AppStateProvider from './providers/AppStateProvider';
import HistoryProvider from './providers/HistoryProvider';
import SftpProvider from './providers/SftpProvider';
import FileSystemProvider from './providers/FileSystemProvider';
import ContextMenuProvider from './providers/ContextMenuProvider';
import MainLayout from './layouts/MainLayout';

// Simple fallback for error cases
function ErrorFallback({ diagnosticStatus, errorReport }) {
    const [showDetails, setShowDetails] = React.useState(false);
    const [showLocation, setShowLocation] = React.useState(false);
    return (
        <div style={{
            padding: '20px',
            color: '#333',
            backgroundColor: '#f8f8f8',
            fontFamily: 'system-ui, sans-serif',
            maxWidth: '800px',
            margin: '40px auto',
            border: '1px solid #ddd',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
            <h1 style={{ color: '#d32f2f' }}>Fast File Explorer</h1>
            <p>The application could not be loaded properly. Try refreshing the page.</p>
            {diagnosticStatus?.saved && (
                <div>
                    <p>A diagnostic report was saved on this device.</p>
                    <button onClick={() => setShowLocation(true)}>Show report location</button>
                    {showLocation && <p style={{ overflowWrap: 'anywhere' }}>{diagnosticStatus.path}</p>}
                </div>
            )}
            {diagnosticStatus && !diagnosticStatus.saved && <p>The diagnostic report could not be saved.</p>}
            <p>Please reload the application. If it fails again, share the diagnostic details with the developer.</p>
            <button onClick={() => setShowDetails(value => !value)}>Show diagnostic details</button>
            {showDetails && <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify({
                ...errorReport,
                startup: window.__EXPLR_STARTUP__ ? window.__EXPLR_STARTUP__.snapshot() : null,
            }, null, 2)}</pre>}
            <button
                onClick={() => window.location.reload()}
                style={{
                    padding: '8px 16px',
                    backgroundColor: '#0078d4',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    marginTop: '15px'
                }}
            >
                Reload Page
            </button>
        </div>
    );
}

// App component with error boundary
class App extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, diagnosticStatus: null, errorReport: null };
    }

    // Error Boundary
    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        console.error("Application error:", error, errorInfo);
        this.setState({ errorReport: captureErrorReport(error, errorInfo) });
        persistErrorReport(invoke, error, errorInfo).then(diagnosticStatus => {
            if (diagnosticStatus) this.setState({ diagnosticStatus });
        });
    }

    render() {
        // Show fallback in case of error
        if (this.state.hasError) {
            return <ErrorFallback diagnosticStatus={this.state.diagnosticStatus} errorReport={this.state.errorReport} />;
        }

        // Render normal application with all providers
        // IMPORTANT: Provider order matters for proper initialization:
        // 1. SettingsProvider should be first as other providers may depend on settings
        // 2. ThemeProvider depends on settings and should come second
        // 3. AppStateProvider provides general app state
        // 4. HistoryProvider should come before FileSystemProvider since navigation depends on history
        // 5. SftpProvider should come before FileSystemProvider to provide SFTP operations
        // 6. FileSystemProvider provides file system operations
        // 7. ContextMenuProvider should come after FileSystemProvider to access selected items
        return (
            <div className="app-container">
                <SettingsProvider>
                    <ThemeProvider>
                        <AppStateProvider>
                            <HistoryProvider>
                                <SftpProvider>
                                    <FileSystemProvider>
                                        <ContextMenuProvider>
                                            <MainLayout />
                                        </ContextMenuProvider>
                                    </FileSystemProvider>
                                </SftpProvider>
                            </HistoryProvider>
                        </AppStateProvider>
                    </ThemeProvider>
                </SettingsProvider>
            </div>
        );
    }
}

export default App;