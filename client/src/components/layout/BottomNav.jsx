import { NavLink } from 'react-router-dom';
import { S } from '../../utils/strings.js';
import Icon from '../common/Icon.jsx';

const ITEMS = [
  { to: '/home', icon: 'home', label: S.nav.home },
  { to: '/ranks', icon: 'ranks', label: S.nav.ranks },
  { to: '/profile', icon: 'profile', label: S.nav.profile },
];

/** Home, Ranks and Profile tabs fixed to the bottom. */
export default function BottomNav() {
  return (
    <nav className="ff-nav" aria-label="Main">
      <div className="ff-nav__inner">
        {ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} className="ff-nav__item">
            <Icon name={item.icon} size={26} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
