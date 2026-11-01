import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SINGLE_ROUND_OPTIONS } from '@fastfour/shared';
import { readApiError } from '../api/axiosClient.js';
import * as singleApi from '../api/singleApi.js';
import BoardLogo from '../components/common/BoardLogo.jsx';
import Button from '../components/common/Button.jsx';
import Icon from '../components/common/Icon.jsx';
import TopBar from '../components/common/TopBar.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { S } from '../utils/strings.js';

const INFO = [
  {
    icon: 'check',
    color: 'var(--ff-place)',
    title: S.single.perAnswer,
    sub: S.single.perAnswerSub,
  },
  { icon: 'bolt', color: 'var(--ff-animal)', title: S.single.bonus, sub: S.single.bonusSub },
  { icon: 'timer', color: 'var(--ff-name)', title: S.single.sixty, sub: S.single.sixtySub },
];

export default function SingleSetupPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rounds, setRounds] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const best = Number(user.stats?.bestByRounds?.[String(rounds)] ?? 0);

  async function start() {
    setBusy(true);
    setError('');
    try {
      const game = await singleApi.createGame(rounds);
      navigate(`/single/play/${game.gameId}`);
    } catch (err) {
      setError(readApiError(err, S.errors.network, S.errors.generic).message);
      setBusy(false);
    }
  }

  return (
    <main className="ff-page ff-page--wide ff-grid2">
      <TopBar title={S.single.setupTitle} to="/home" />
      <div className="ff-g-art ff-desktop-only">
        <BoardLogo size={220} />
      </div>
      <h2 className="ff-heading ff-single__q ff-g-main">{S.single.howMany}</h2>
      <div className="ff-rounds ff-g-main" role="radiogroup" aria-label={S.single.howMany}>
        {SINGLE_ROUND_OPTIONS.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-label={`${n} ${S.single.roundsLabel}`}
            aria-checked={rounds === n}
            className="ff-rounds__btn"
            onClick={() => setRounds(n)}
          >
            <span className="ff-rounds__n">{n}</span>
            <span className="ff-rounds__l">{S.single.roundsLabel}</span>
          </button>
        ))}
      </div>
      <div className="ff-card ff-rows ff-g-main ff-info">
        {INFO.map((row) => (
          <div className="ff-info__row" key={row.title}>
            <span className="ff-info__icon" style={{ background: row.color }}>
              <Icon name={row.icon} size={22} />
            </span>
            <span>
              <span className="ff-info__title">{row.title}</span>
              <span className="ff-info__sub">{row.sub}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="ff-best ff-g-main" data-testid="best">
        <div>
          <div className="ff-best__label">{S.single.best(rounds)}</div>
          <div className="ff-best__value">{best > 0 ? best : S.single.noBest}</div>
        </div>
        <span className="ff-best__icon">
          <Icon name="trophy" size={30} />
        </span>
      </div>
      <div className="ff-spacer ff-grow" />
      {error && (
        <div className="ff-alert ff-g-main" role="alert">
          {error}
        </div>
      )}
      <div className="ff-g-main">
        <Button onClick={start} disabled={busy}>
          {busy ? S.single.starting : S.single.start}
        </Button>
      </div>
    </main>
  );
}
