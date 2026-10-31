import { Link, useNavigate } from 'react-router-dom';
import { S } from '../../utils/strings.js';
import Icon from './Icon.jsx';

/** Back button and centred title. `to` sets a fixed back target; otherwise it goes back in history. */
export default function TopBar({ title, to }) {
  const navigate = useNavigate();
  return (
    <header className="ff-topbar">
      {to ? (
        <Link to={to} className="ff-iconbtn" aria-label={S.back}>
          <Icon name="back" />
        </Link>
      ) : (
        <button
          type="button"
          className="ff-iconbtn"
          aria-label={S.back}
          onClick={() => navigate(-1)}
        >
          <Icon name="back" />
        </button>
      )}
      {title && <h1 className="ff-topbar__title">{title}</h1>}
    </header>
  );
}
