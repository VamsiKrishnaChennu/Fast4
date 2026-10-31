import { useEffect, useState } from 'react';
import { getMeta } from '../api/metaApi.js';

/** @returns {object|null} server settings once loaded (appVersion, supportEmail, ...) */
export function useMeta() {
  const [meta, setMeta] = useState(null);
  useEffect(() => {
    let live = true;
    getMeta().then((m) => live && setMeta(m));
    return () => {
      live = false;
    };
  }, []);
  return meta;
}
