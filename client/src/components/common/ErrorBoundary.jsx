import { Component } from 'react';
import { S } from '../../utils/strings.js';

/** Catches a crash while drawing a screen and offers a reload instead of a blank page. */
export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="ff-page ff-center" style={{ justifyContent: 'center' }}>
        <h1 className="ff-title ff-title--sm">{S.crash.title}</h1>
        <p className="ff-muted">{S.crash.body}</p>
        <button type="button" className="ff-btn" onClick={() => window.location.assign('/')}>
          {S.crash.reload}
        </button>
      </main>
    );
  }
}
