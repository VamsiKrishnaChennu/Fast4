import { S } from '../../utils/strings.js';
import Icon from '../common/Icon.jsx';

/** Close button, round title and the running score for the game screens. */
export default function GameHeader({ title, onLeave, score }) {
  return (
    <header className="ff-gamehead">
      <button type="button" className="ff-iconbtn" aria-label={S.single.leave} onClick={onLeave}>
        <Icon name="close" />
      </button>
      <h1 className="ff-gamehead__title">{title}</h1>
      {score !== undefined && (
        <div className="ff-gamehead__score">
          <span>{S.single.score}</span>
          <strong data-testid="score">{score}</strong>
        </div>
      )}
    </header>
  );
}
