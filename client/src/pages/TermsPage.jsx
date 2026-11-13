import { terms } from '../legal/terms.js';
import LegalLayout, { LegalBlocks } from '../components/common/LegalLayout.jsx';
import { useMeta } from '../hooks/useMeta.js';
import { S } from '../utils/strings.js';

export default function TermsPage() {
  const meta = useMeta();
  const doc = terms({ email: meta?.supportEmail ?? S.legal.supportFallback });
  return (
    <LegalLayout title={doc.title} updated={doc.updated} testId="terms">
      <LegalBlocks blocks={doc.blocks} />
    </LegalLayout>
  );
}
