import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Last-resort UI so a render-time throw never leaves a silent white screen
 * (release builds have no devtools console). Shows the error + stack inline.
 */
interface Props { children: ReactNode }
interface State { error: Error | null; info: string }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Also log, in case devtools are open.
    console.error('Render error:', error, info);
    this.setState({ info: info.componentStack ?? '' });
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;
    return (
      <div style={{ padding: 16, fontFamily: 'monospace', fontSize: 12, color: '#ef4444', whiteSpace: 'pre-wrap', overflow: 'auto' }}>
        <div style={{ fontWeight: 'bold', marginBottom: 8 }}>应用渲染出错</div>
        <div>{error.message}</div>
        {error.stack && <div style={{ marginTop: 8, opacity: 0.8 }}>{error.stack}</div>}
        {info && <div style={{ marginTop: 8, opacity: 0.6 }}>{info}</div>}
      </div>
    );
  }
}
