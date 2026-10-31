import { Link } from 'react-router-dom';

/**
 * Chunky button. Renders a router Link when `to` is given, otherwise a button.
 * variant: primary | secondary | red
 */
export default function Button({ to, variant = 'primary', className = '', children, ...rest }) {
  const classes = ['ff-btn', variant !== 'primary' && `ff-btn--${variant}`, className]
    .filter(Boolean)
    .join(' ');
  if (to) {
    return (
      <Link to={to} className={classes} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  );
}
