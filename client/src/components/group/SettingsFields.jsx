import { LIMITS } from '@fastfour/shared';
import { S } from '../../utils/strings.js';
import Stepper from './Stepper.jsx';

/** The two room settings, shared by the create screen and the host's edit dialog. */
export default function SettingsFields({
  settings,
  onChange,
  minPlayers = LIMITS.PLAYERS_MIN,
  playersError,
}) {
  return (
    <div className="ff-card ff-steppers">
      <Stepper
        id="players"
        label={S.group.players}
        sub={S.group.playersSub}
        value={settings.maxPlayers}
        min={minPlayers}
        max={LIMITS.PLAYERS_MAX}
        lessLabel={S.group.fewer}
        moreLabel={S.group.more}
        error={playersError}
        onChange={(maxPlayers) => onChange({ ...settings, maxPlayers })}
      />
      <Stepper
        id="rounds"
        label={S.group.rounds}
        sub={S.group.roundsSub}
        value={settings.rounds}
        min={LIMITS.ROUNDS_MIN}
        max={LIMITS.ROUNDS_MAX}
        lessLabel={S.group.fewer}
        moreLabel={S.group.more}
        onChange={(rounds) => onChange({ ...settings, rounds })}
      />
    </div>
  );
}
