import { Link } from 'react-router-dom';
import Avatar from '../components/common/Avatar.jsx';
import BoardLogo from '../components/common/BoardLogo.jsx';
import Icon from '../components/common/Icon.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { S } from '../utils/strings.js';

function PlayCard({ to, icon, title, sub, color, depth }) {
  return (
    <Link to={to} className="ff-play ff-g-main" style={{ '--btn-bg': color, '--btn-depth': depth }}>
      <span className="ff-play__icon">
        <Icon name={icon} size={26} />
      </span>
      <span>
        <span className="ff-play__title">{title}</span>
        <span className="ff-play__sub">{sub}</span>
      </span>
    </Link>
  );
}

export default function HomePage() {
  const { user } = useAuth();
  const stats = user.stats ?? {};
  return (
    <main className="ff-page ff-page--nav ff-grid2">
      <header
        className="ff-g-head"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <h1 className="ff-wordmark">{S.appName}</h1>
        <Link to="/profile" aria-label={S.nav.profile}>
          <Avatar nickname={user.nickname} color={user.avatarColor} size={44} />
        </Link>
      </header>
      <div className="ff-center ff-contents-lg" style={{ paddingTop: 12 }}>
        <div className="ff-hero ff-g-art">
          <BoardLogo size={220} />
        </div>
        <h2 className="ff-title ff-title--lg ff-g-main">{S.home.greeting(user.nickname)}</h2>
        <p className="ff-muted ff-g-main ff-home__sub">{S.home.sub}</p>
      </div>
      <PlayCard
        to="/single"
        icon="timer"
        title={S.home.solo}
        sub={S.home.soloSub}
        color="var(--ff-primary)"
        depth="var(--ff-primary-depth)"
      />
      <PlayCard
        to="/group"
        icon="users"
        title={S.home.group}
        sub={S.home.groupSub}
        color="var(--ff-red)"
        depth="var(--ff-red-depth)"
      />
      <div className="ff-stats ff-g-main">
        <div className="ff-stat">
          <div className="ff-stat__value">{stats.bestSingleScore ?? 0}</div>
          <div className="ff-stat__label">{S.home.bestScore}</div>
        </div>
        <div className="ff-stat">
          <div className="ff-stat__value">{stats.groupWins ?? 0}</div>
          <div className="ff-stat__label">{S.home.groupWins}</div>
        </div>
        <div className="ff-stat">
          <div className="ff-stat__value">
            {(stats.singleGamesPlayed ?? 0) + (stats.groupGamesPlayed ?? 0)}
          </div>
          <div className="ff-stat__label">{S.home.gamesPlayed}</div>
        </div>
      </div>
    </main>
  );
}
