import { useState } from 'react';
import { readApiError } from '../api/axiosClient.js';
import Avatar from '../components/common/Avatar.jsx';
import TopBar from '../components/common/TopBar.jsx';
import { useRealtime } from '../context/RealtimeContext.jsx';
import { S } from '../utils/strings.js';

/** The players this user blocked, each with an Unblock button. */
export default function BlockedPage() {
  const { blocked, unblockUser } = useRealtime();
  const [error, setError] = useState('');

  async function unblock(userId) {
    setError('');
    try {
      await unblockUser(userId);
    } catch (err) {
      setError(readApiError(err, S.errors.network, S.blocked.error).message);
    }
  }

  return (
    <main className="ff-page ff-page--narrow ff-blocked">
      <TopBar title={S.blocked.title} to="/profile" />
      <h2 className="ff-deskhead ff-title ff-title--sm">{S.blocked.title}</h2>
      <p className="ff-muted">{S.blocked.hint}</p>
      {error && (
        <div className="ff-alert" role="alert">
          {error}
        </div>
      )}
      {blocked.length === 0 ? (
        <p className="ff-muted ff-center" style={{ marginTop: 24 }}>
          {S.blocked.empty}
        </p>
      ) : (
        <ul className="ff-card ff-blocklist" aria-label={S.blocked.title}>
          {blocked.map((b) => (
            <li key={b.userId} className="ff-blocklist__row" data-testid="blocked-row">
              <Avatar nickname={b.nickname} color={b.avatarColor} size={44} />
              <span className="ff-blocklist__name">{b.nickname}</span>
              <button
                type="button"
                className="ff-pillbtn"
                aria-label={S.blocked.unblockLabel(b.nickname)}
                onClick={() => unblock(b.userId)}
              >
                {S.blocked.unblock}
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
