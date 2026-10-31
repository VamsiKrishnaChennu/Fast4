import Avatar from '../components/common/Avatar.jsx';
import Icon from '../components/common/Icon.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { useMeta } from '../hooks/useMeta.js';
import { S } from '../utils/strings.js';

/** Phase 2 profile: identity, the dark mode switch and log out. The rest arrives in Phase 9. */
export default function ProfilePage() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const meta = useMeta();
  const since = new Date(user.createdAt).toLocaleDateString('en', {
    month: 'long',
    year: 'numeric',
  });
  return (
    <main className="ff-page ff-page--nav">
      <h1 className="ff-wordmark" style={{ fontSize: 28 }}>
        {S.profile.title}
      </h1>
      <div className="ff-center" style={{ margin: '16px 0 24px' }}>
        <Avatar nickname={user.nickname} color={user.avatarColor} size={96} />
        <h2 className="ff-title" style={{ fontSize: 24, margin: '12px 0 2px' }}>
          {user.nickname}
        </h2>
        <p className="ff-muted" style={{ fontSize: 14, fontWeight: 600 }}>
          {S.profile.since(since)}
        </p>
      </div>
      <h3 className="ff-label" style={{ fontSize: 18, fontFamily: 'var(--ff-font-heading)' }}>
        {S.profile.settings}
      </h3>
      <div className="ff-card ff-rows">
        <div className="ff-row">
          <span className="ff-row__icon">
            <Icon name="moon" size={22} />
          </span>
          <span className="ff-row__label" id="dark-label">
            {S.profile.darkMode}
          </span>
          <span className="ff-switch-hit">
            <button
              type="button"
              role="switch"
              className="ff-switch"
              aria-checked={theme === 'dark'}
              aria-labelledby="dark-label"
              onClick={toggle}
            />
          </span>
        </div>
        <button type="button" className="ff-row" onClick={logout}>
          <span className="ff-row__icon">
            <Icon name="logout" size={22} />
          </span>
          <span className="ff-row__label">{S.profile.logout}</span>
        </button>
      </div>
      <p className="ff-center ff-muted" style={{ fontSize: 13, marginTop: 20 }}>
        {S.profile.version(meta?.appVersion ?? '')}
      </p>
    </main>
  );
}
