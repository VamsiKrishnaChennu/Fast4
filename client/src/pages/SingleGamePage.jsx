import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CATEGORIES } from '@fastfour/shared';
import { readApiError } from '../api/axiosClient.js';
import * as singleApi from '../api/singleApi.js';
import BoardLogo from '../components/common/BoardLogo.jsx';
import Button from '../components/common/Button.jsx';
import Icon from '../components/common/Icon.jsx';
import Modal from '../components/common/Modal.jsx';
import ResultView from '../components/single/ResultView.jsx';
import SummaryView from '../components/single/SummaryView.jsx';
import TossView from '../components/single/TossView.jsx';
import WritingView from '../components/single/WritingView.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useCountdown } from '../hooks/useCountdown.js';
import { syncServerTime } from '../utils/serverClock.js';
import { S } from '../utils/strings.js';

const blank = () => Object.fromEntries(CATEGORIES.map((c) => [c, '']));
const draftKey = (gameId, index) => `ff-draft-${gameId}-${index}`;

function readDraft(gameId, index) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(draftKey(gameId, index)) ?? 'null');
    return saved && typeof saved === 'object' ? { ...blank(), ...saved } : blank();
  } catch {
    return blank();
  }
}
function saveDraft(gameId, index, answers) {
  try {
    sessionStorage.setItem(draftKey(gameId, index), JSON.stringify(answers));
  } catch {
    // Drafts are a convenience; losing them is fine.
  }
}

/** Waits for the letter toss to end, then shows the writing screen. */
function Round({ round, ...props }) {
  const untilWriting = useCountdown(round.startedAt);
  if (untilWriting > 0) {
    return <TossView round={round} rounds={props.rounds} onLeave={props.onLeave} />;
  }
  return <WritingView round={round} {...props} />;
}

/**
 * One single-player game, driven by the server. Every screen can be rebuilt from GET /single/games/:id,
 * so a reload lands back on the right round with the right time left.
 */
export default function SingleGamePage() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [view, setView] = useState('loading');
  const [game, setGame] = useState(null);
  const [round, setRound] = useState(null);
  const [result, setResult] = useState(null);
  const [answers, setAnswers] = useState(blank);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const answersRef = useRef(answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);
  const submitting = useRef(false);

  const startRound = useCallback(async () => {
    const next = await singleApi.nextRound(gameId);
    syncServerTime(next.serverNow);
    setRound(next);
    setAnswers(readDraft(gameId, next.index));
    setView('round');
  }, [gameId]);

  const load = useCallback(async () => {
    try {
      const g = await singleApi.getGame(gameId);
      setError('');
      syncServerTime(g.serverNow);
      setGame(g);
      if (g.status === 'finished') {
        setView('summary');
        refreshUser();
      } else if (g.status !== 'in_progress') {
        navigate('/single', { replace: true });
      } else if (g.round) {
        setRound(g.round);
        setAnswers(readDraft(gameId, g.round.index));
        setView('round');
      } else if (g.results.length > 0) {
        const lastResult = g.results[g.results.length - 1];
        setResult({
          ...lastResult,
          totalScore: g.totalScore,
          isLast: g.results.length === g.rounds,
        });
        setView('result');
      } else {
        await startRound();
      }
    } catch (err) {
      setError(readApiError(err, S.errors.network, S.single.loadError).message);
      setView('error');
    }
  }, [gameId, navigate, refreshUser, startRound]);

  useEffect(() => {
    // Loads the game on arrival; state is only set after the request returns.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const onChange = useCallback(
    (category, value) => {
      setAnswers((prev) => {
        const next = { ...prev, [category]: value };
        if (round) saveDraft(gameId, round.index, next);
        return next;
      });
    },
    [gameId, round],
  );

  const onSubmit = useCallback(async () => {
    if (submitting.current || !round) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      const res = await singleApi.submitRound(gameId, round.index, answersRef.current);
      syncServerTime(Date.now());
      setResult({ ...res, index: round.index });
      setGame((g) => (g ? { ...g, totalScore: res.totalScore } : g));
      setView('result');
    } catch (err) {
      const info = readApiError(err, S.single.submitError, S.single.submitError);
      if (info.code === 'ROUND_EXPIRED') {
        await load();
      } else {
        setError(info.message);
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }, [gameId, round, load]);

  const onNext = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (result?.isLast) {
        await load();
      } else {
        await startRound();
      }
    } catch (err) {
      setError(readApiError(err, S.errors.network, S.errors.generic).message);
    } finally {
      setBusy(false);
    }
  }, [busy, result, load, startRound]);

  const leave = async () => {
    setBusy(true);
    try {
      await singleApi.quitGame(gameId);
    } catch {
      // Leaving should always work from the player's side.
    }
    navigate('/home', { replace: true });
  };

  const playAgain = async () => {
    setBusy(true);
    try {
      const next = await singleApi.createGame(game.rounds);
      navigate(`/single/play/${next.gameId}`);
    } catch (err) {
      setError(readApiError(err, S.errors.network, S.errors.generic).message);
      setBusy(false);
    }
  };

  const askLeave = () => setLeaving(true);

  let body;
  if (view === 'loading') {
    body = (
      <main className="ff-page ff-page--narrow ff-center" style={{ justifyContent: 'center' }}>
        <div className="ff-hero">
          <BoardLogo size={96} />
        </div>
        <p className="ff-muted" role="status">
          {S.loading}
        </p>
      </main>
    );
  } else if (view === 'error') {
    body = (
      <main className="ff-page ff-page--narrow ff-center" style={{ justifyContent: 'center' }}>
        <div className="ff-alert" role="alert">
          {error}
        </div>
        <Button onClick={load}>{S.single.retry}</Button>
        <div style={{ height: 12 }} />
        <Button variant="secondary" to="/home">
          {S.single.backHome}
        </Button>
      </main>
    );
  } else if (view === 'round') {
    body = (
      <Round
        key={round.index}
        round={round}
        rounds={game?.rounds ?? 0}
        roundSeconds={game?.roundSeconds ?? 60}
        score={game?.totalScore ?? 0}
        answers={answers}
        onChange={onChange}
        onSubmit={onSubmit}
        onLeave={askLeave}
        locked={busy}
        error={error}
      />
    );
  } else if (view === 'result') {
    body = (
      <ResultView
        result={result}
        rounds={game?.rounds ?? 0}
        roundSeconds={game?.roundSeconds ?? 60}
        onNext={onNext}
        onLeave={askLeave}
        busy={busy}
      />
    );
  } else {
    body = (
      <SummaryView
        game={game}
        onAgain={playAgain}
        onHome={() => navigate('/home')}
        onClose={() => navigate('/home')}
        busy={busy}
      />
    );
  }

  return (
    <>
      {body}
      {leaving && view !== 'summary' && (
        <Modal
          title={S.single.leaveTitle}
          icon={<Icon name="logout" size={32} />}
          onClose={() => setLeaving(false)}
        >
          <p className="ff-muted ff-modal__body">{S.single.leaveBody}</p>
          <div className="ff-modal__actions">
            <Button variant="secondary" onClick={() => setLeaving(false)} data-autofocus>
              {S.single.stay}
            </Button>
            <Button variant="red" onClick={leave} disabled={busy}>
              {busy ? S.single.leaving : S.single.leave}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
