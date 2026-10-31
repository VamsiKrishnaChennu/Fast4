import { avatarTextColor } from '../../utils/avatar.js';

/** Round avatar showing the first letter of the nickname. */
export default function Avatar({ nickname = '?', color, size = 40 }) {
  return (
    <span
      className="ff-avatar"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        background: color,
        color: avatarTextColor(color),
        fontSize: Math.round(size * 0.42),
      }}
    >
      {nickname.slice(0, 1).toUpperCase()}
    </span>
  );
}
