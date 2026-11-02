import { useRealtime } from '../../context/RealtimeContext.jsx';
import { S } from '../../utils/strings.js';

/** Shown while the live connection is down. Players keep their seat for a minute. */
export default function ConnectionBanner() {
  const { connection } = useRealtime();
  if (connection !== 'disconnected') return null;
  return (
    <div className="ff-banner" role="status">
      <strong>{S.group.reconnecting}</strong>
      <span>{S.group.reconnectingSub}</span>
    </div>
  );
}
