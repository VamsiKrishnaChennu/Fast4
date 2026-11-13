import { useEffect, useState } from 'react';
import { SINGLE_ROUND_OPTIONS } from '@fastfour/shared';
import { readApiError } from '../api/axiosClient.js';
import * as singleApi from '../api/singleApi.js';
import * as socialApi from '../api/socialApi.js';
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

/** Group ranks: every player's running wins or points, with the caller's own row marked. */
function GroupRanks() {
  const [metric, setMetric] = useState('wins');
  const [loaded, setLoaded] = useState({ metric: '', data: null, error: '' });

  useEffect(() => {
    let live = true;
    socialApi
      .groupLeaderboard({ metric })
      .then((data) => live && setLoaded({ metric, data, error: '' }))
      .catch(
        (err) =>
          live &&
          setLoaded({
            metric,
            data: null,
            error: readApiError(err, S.errors.network, S.ranks.loadError).message,
          }),
      );
    return () => {
      live = false;
    };
  }, [metric]);
  const { data, error } = loaded.metric === metric ? loaded : { data: null, error: '' };

  const row = (e, you) => (
    <li
      key={`${you ? 'you-' : ''}${e.userId}`}
      className={`ff-rank${e.isYou ? ' is-you' : ''}`}
      data-testid="rank-row"
    >
      <span className={`ff-rank__pos ff-rank__pos--${e.rank <= 3 ? e.rank : 'n'}`}>{e.rank}</span>
      <Avatar nickname={e.nickname} color={e.avatarColor ?? '#FFC247'} size={44} />
      <span className="ff-rank__who">
        <span className="ff-rank__name">{you ? S.ranks.you : e.nickname}</span>
        <span className="ff-rank__sub">
          {metric === 'wins' ? S.ranks.pointsCount(e.points) : S.ranks.winsCount(e.wins)}
          {' · '}
          {S.ranks.games(e.games)}
        </span>
      </span>
      <strong className="ff-rank__score">{metric === 'wins' ? e.wins : e.points}</strong>
    </li>
  );

  const inList = data?.entries.some((e) => e.isYou);
  return (
    <>
      <div className="ff-chips">
        {[
          { value: 'wins', label: S.ranks.wins },
          { value: 'points', label: S.ranks.points },
        ].map((m) => (
          <button
            key={m.value}
            type="button"
            className="ff-chip"
            aria-pressed={metric === m.value}
            onClick={() => setMetric(m.value)}
          >
            {m.label}
          </button>
        ))}
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
          {S.ranks.groupEmpty}
        </p>
      )}
      {data && data.entries.length > 0 && (
        <ol className="ff-card ff-ranklist" aria-label={S.ranks.group}>
          {data.entries.map((e) => row(e, false))}
        </ol>
      )}
      {data?.you && !inList && (
        <div className="ff-youbar" data-testid="you">
          <ol className="ff-ranklist ff-ranklist--you">{row(data.you, true)}</ol>
        </div>
      )}
    </>
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
        <GroupRanks />
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
