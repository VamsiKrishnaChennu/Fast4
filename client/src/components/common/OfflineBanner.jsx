import { useOnline } from '../../hooks/useOnline.js';
import { S } from '../../utils/strings.js';

/** A thin notice at the top of every screen while the device has no network. */
export default function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="ff-offline" role="status">
      {S.offline}
    </div>
  );
}
