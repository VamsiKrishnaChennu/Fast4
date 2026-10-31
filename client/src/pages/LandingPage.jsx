import { Link } from 'react-router-dom';
import BoardLogo from '../components/common/BoardLogo.jsx';
import Button from '../components/common/Button.jsx';
import { S } from '../utils/strings.js';

export default function LandingPage() {
  return (
    <main className="ff-page ff-grid2">
      <h1 className="ff-wordmark ff-g-head">{S.appName}</h1>
      <div className="ff-grow ff-center ff-contents-lg" style={{ paddingTop: 28 }}>
        <div className="ff-hero ff-g-art">
          <BoardLogo size={250} />
        </div>
        <h2 className="ff-title ff-title--xl ff-g-main" style={{ whiteSpace: 'pre-line' }}>
          {S.welcome.title}
        </h2>
        <p className="ff-muted ff-lead ff-g-main">{S.welcome.sub}</p>
      </div>
      <div className="ff-stack ff-g-main">
        <Button to="/signup">{S.welcome.create}</Button>
        <Button to="/login" variant="secondary">
          {S.welcome.login}
        </Button>
      </div>
      <p className="ff-legal ff-g-main">
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
