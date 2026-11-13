/** Turns a legal document ({ title, updated, blocks }) into Markdown for docs/legal. */
export function legalToMarkdown(doc) {
  const lines = [`# ${doc.title}`, '', `Last updated ${doc.updated}`, ''];
  for (const block of doc.blocks) {
    if (block.h) lines.push(`## ${block.h}`, '');
    for (const text of block.p ?? []) lines.push(text, '');
    if (block.ul) lines.push(...block.ul.map((text) => `- ${text}`), '');
    for (const text of block.after ?? []) lines.push(text, '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}
