import { privacy } from '../legal/privacy.js';
import LegalLayout, { LegalBlocks } from '../components/common/LegalLayout.jsx';
import { useMeta } from '../hooks/useMeta.js';
import { S } from '../utils/strings.js';

export default function PrivacyPage() {
  const meta = useMeta();
  const doc = privacy({ email: meta?.supportEmail ?? S.legal.supportFallback });
  return (
    <LegalLayout title={doc.title} updated={doc.updated} testId="privacy">
      <LegalBlocks blocks={doc.blocks} />
    </LegalLayout>
  );
}
