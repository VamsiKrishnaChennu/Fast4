import { Link } from 'react-router-dom';
import BoardLogo from '../components/common/BoardLogo.jsx';
import Button from '../components/common/Button.jsx';
import { S } from '../utils/strings.js';

export default function LandingPage() {
  return (
    <main className="ff-page">
      <h1 className="ff-wordmark">{S.appName}</h1>
      <div className="ff-grow ff-center" style={{ paddingTop: 28 }}>
        <div className="ff-hero">
          <BoardLogo size={250} />
        </div>
        <h2 className="ff-title" style={{ whiteSpace: 'pre-line', fontSize: 34 }}>
          {S.welcome.title}
        </h2>
        <p className="ff-muted" style={{ fontSize: 16, padding: '0 8px' }}>
          {S.welcome.sub}
        </p>
      </div>
      <div className="ff-stack">
        <Button to="/signup">{S.welcome.create}</Button>
        <Button to="/login" variant="secondary">
          {S.welcome.login}
        </Button>
      </div>
      <p className="ff-legal">
        {S.welcome.agree}{' '}
        <Link className="ff-link" to="/terms">
          Terms
        </Link>{' '}
        and{' '}
        <Link className="ff-link" to="/privacy">
          Privacy Policy
        </Link>
        .
      </p>
    </main>
  );
}
