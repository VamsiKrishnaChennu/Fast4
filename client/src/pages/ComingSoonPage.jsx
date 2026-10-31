import BoardLogo from '../components/common/BoardLogo.jsx';
import Button from '../components/common/Button.jsx';
import { S } from '../utils/strings.js';

export default function ComingSoonPage() {
  return (
    <main className="ff-page ff-center" style={{ justifyContent: 'center' }}>
      <div className="ff-hero">
        <BoardLogo size={120} />
      </div>
      <h1 className="ff-title">{S.soon.title}</h1>
      <p className="ff-muted" style={{ marginBottom: 24 }}>
        {S.soon.body}
      </p>
      <Button to="/home">{S.soon.home}</Button>
    </main>
  );
}
