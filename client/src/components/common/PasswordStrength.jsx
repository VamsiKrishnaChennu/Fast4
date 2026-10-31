import { passwordStrength } from '../../utils/passwordStrength.js';

/** Four bars and a label under the password field. */
export default function PasswordStrength({ password }) {
  const { level, label } = passwordStrength(password);
  if (!level) return null;
  return (
    <div>
      <div className="ff-strength" data-level={level} aria-hidden="true">
        <span className="ff-strength__bar" />
        <span className="ff-strength__bar" />
        <span className="ff-strength__bar" />
        <span className="ff-strength__bar" />
      </div>
      <p className="ff-help" aria-live="polite">
        {label}
      </p>
    </div>
  );
}
