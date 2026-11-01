import { useEffect, useState } from 'react';
import { SINGLE_ROUND_OPTIONS } from '@fastfour/shared';
import { readApiError } from '../api/axiosClient.js';
import * as singleApi from '../api/singleApi.js';
import Avatar from '../components/common/Avatar.jsx';
import SegmentedControl from '../components/common/SegmentedControl.jsx';
import { S } from '../utils/strings.js';

const PERIODS = [
  { value: 'daily', label: S.ranks.today },
  { value: 'weekly', label: S.ranks.week },
  { value: 'all', label: S.ranks.all },
];

function Row({ entry, rounds, you }) {
  const avg = Math.round(entry.totalTimeMs / 1000 / rounds);
  return (
    <li className={`ff-rank${entry.isYou ? ' is-you' : ''}`} data-testid="rank-row">
      <span className={`ff-rank__pos ff-rank__pos--${entry.rank <= 3 ? entry.rank : 'n'}`}>
        {entry.rank}
      </span>
      <Avatar nickname={entry.nickname} color={entry.avatarColor ?? '#FFC247'} size={44} />
      <span className="ff-rank__who">
        <span className="ff-rank__name">{you ? S.ranks.you : entry.nickname}</span>
        <span className="ff-rank__sub">{S.ranks.avg(rounds, avg)}</span>
      </span>
      <strong className="ff-rank__score">{entry.totalScore}</strong>
    </li>
  );
}

/** Solo ranks: best game per player for the chosen period and number of rounds. */
export default function RanksPage() {
  const [tab, setTab] = useState('solo');
  const [period, setPeriod] = useState('weekly');
  const [rounds, setRounds] = useState(10);
  const [loaded, setLoaded] = useState({ key: '', data: null, error: '' });
  const key = `${period}-${rounds}`;

  useEffect(() => {
    let live = true;
    singleApi
      .singleLeaderboard({ period, rounds })
      .then((res) => live && setLoaded({ key, data: res, error: '' }))
      .catch(
        (err) =>
          live &&
          setLoaded({
            key,
            data: null,
            error: readApiError(err, S.errors.network, S.ranks.loadError).message,
          }),
      );
    return () => {
      live = false;
    };
  }, [period, rounds, key]);
  const current = loaded.key === key ? loaded : { data: null, error: '' };
  const { data, error } = current;

  const cycleRounds = () => {
    const i = SINGLE_ROUND_OPTIONS.indexOf(rounds);
    setRounds(SINGLE_ROUND_OPTIONS[(i + 1) % SINGLE_ROUND_OPTIONS.length]);
  };

  const you = data?.you;
  const tenth = data?.entries[9];
  const yourSub =
    you && you.rank > 10 && tenth ? S.ranks.pointsToTop(tenth.totalScore - you.totalScore) : null;

  return (
    <main className="ff-page ff-page--nav ff-ranks">
      <h1 className="ff-wordmark ff-ranks__title">{S.ranks.title}</h1>
      <SegmentedControl
        label={S.ranks.title}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'solo', label: S.ranks.solo },
          { value: 'group', label: S.ranks.group },
        ]}
      />
      {tab === 'group' ? (
        <p className="ff-muted ff-center" style={{ marginTop: 24 }}>
          {S.ranks.groupSoon}
        </p>
      ) : (
        <>
          <div className="ff-chips">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                className="ff-chip"
                aria-pressed={period === p.value}
                onClick={() => setPeriod(p.value)}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              className="ff-chip"
              aria-label={S.ranks.changeRounds(rounds)}
              onClick={cycleRounds}
            >
              {S.ranks.rounds(rounds)}
            </button>
          </div>
          {error && (
            <div className="ff-alert" role="alert">
              {error}
            </div>
          )}
          {!error && !data && (
            <p className="ff-muted ff-center" role="status">
              {S.loading}
            </p>
          )}
          {data && data.entries.length === 0 && (
            <p className="ff-muted ff-center" style={{ marginTop: 24 }}>
              {S.ranks.empty}
            </p>
          )}
          {data && data.entries.length > 0 && (
            <ol className="ff-card ff-ranklist" aria-label={S.ranks.title}>
              {data.entries.map((e) => (
                <Row key={e.userId} entry={e} rounds={rounds} />
              ))}
            </ol>
          )}
          {you && (
            <div className="ff-youbar" data-testid="you">
              <ol className="ff-ranklist ff-ranklist--you">
                <Row entry={you} rounds={rounds} you />
              </ol>
              {yourSub && <span className="ff-sr">{yourSub}</span>}
            </div>
          )}
        </>
      )}
    </main>
  );
}
