import { Router } from 'express';

/** The SHA-256 certificate fingerprints named in ANDROID_SHA256_FINGERPRINTS, upper case. */
export function parseFingerprints(value) {
  return (value ?? '')
    .split(',')
    .map((f) => f.trim().toUpperCase())
    .filter(Boolean);
}

/**
 * /.well-known/assetlinks.json: tells Android that the Play Store app may open this site
 * full screen (Trusted Web Activity). Answers 404 until both settings are present.
 * @param {{ ANDROID_PACKAGE_NAME?: string, ANDROID_SHA256_FINGERPRINTS?: string }} env
 */
export function assetLinksRoutes(env) {
  const router = Router();
  router.get('/.well-known/assetlinks.json', (req, res, next) => {
    const fingerprints = parseFingerprints(env.ANDROID_SHA256_FINGERPRINTS);
    if (!env.ANDROID_PACKAGE_NAME || fingerprints.length === 0) {
      next();
      return;
    }
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: env.ANDROID_PACKAGE_NAME,
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ]);
  });
  return router;
}
