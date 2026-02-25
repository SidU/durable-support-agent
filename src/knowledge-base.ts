import { readFileSync } from 'fs';
import { join } from 'path';

interface KBSection {
  title: string;
  content: string;
}

let sections: KBSection[] = [];

export function loadKnowledgeBase() {
  const filePath = join(__dirname, '..', 'data', 'knowledge-base.md');
  const raw = readFileSync(filePath, 'utf-8');

  sections = raw
    .split(/^## /m)
    .slice(1) // skip content before first ##
    .map((block) => {
      const [title, ...rest] = block.split('\n');
      return { title: title.trim(), content: rest.join('\n').trim() };
    });
}

export function searchKnowledgeBase(query: string): string {
  const keywords = query.toLowerCase().split(/\s+/);

  const scored = sections.map((section) => {
    const text = `${section.title} ${section.content}`.toLowerCase();
    const hits = keywords.filter((kw) => text.includes(kw)).length;
    return { section, hits };
  });

  const matches = scored
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 3);

  if (matches.length === 0) {
    return 'No relevant articles found in the knowledge base.';
  }

  return matches.map((m) => `### ${m.section.title}\n${m.section.content}`).join('\n\n---\n\n');
}
