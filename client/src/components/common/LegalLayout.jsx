import { Fragment } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { S } from '../../utils/strings.js';
import TopBar from './TopBar.jsx';

/** Back target for pages that can be opened straight from a link, with no history behind them. */
export function useBackTarget() {
  const location = useLocation();
  const { status } = useAuth();
  return location.key === 'default' ? (status === 'authed' ? '/profile' : '/') : undefined;
}

/** A public document page: heading and a card that scrolls on its own on desktop. */
export default function LegalLayout({ title, updated, children, testId }) {
  const back = useBackTarget();
  return (
    <main className="ff-page ff-page--legal">
      <TopBar to={back} />
      <h1 className="ff-title ff-title--md ff-legalpage__title">{title}</h1>
      {updated && <p className="ff-muted ff-legalpage__date">{S.legal.effective(updated)}</p>}
      <article
        className="ff-card ff-legaltext"
        data-testid={testId}
        tabIndex={0}
        aria-label={title}
      >
        {children}
      </article>
    </main>
  );
}

/** Renders a document made of { h, p, ul, after } blocks (see client/src/legal). */
export function LegalBlocks({ blocks }) {
  return blocks.map((block, i) => (
    <Fragment key={block.h ?? `intro-${i}`}>
      {block.h && <h2>{block.h}</h2>}
      {block.p?.map((text) => (
        <p key={text}>{text}</p>
      ))}
      {block.ul && (
        <ul>
          {block.ul.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      )}
      {block.after?.map((text) => (
        <p key={text}>{text}</p>
      ))}
    </Fragment>
  ));
}
