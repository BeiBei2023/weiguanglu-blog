let segmenter: Intl.Segmenter | null = null;

function getSegmenter(): Intl.Segmenter {
  if (!segmenter) segmenter = new Intl.Segmenter("zh", { granularity: "word" });
  return segmenter;
}

/** 中英文分词：中文用 Intl.Segmenter，英文按词；统一小写 */
export function tokenizeText(text: string): string[] {
  const lower = text.toLowerCase();
  const tokens: string[] = [];
  for (const seg of getSegmenter().segment(lower)) {
    const term = seg.segment.trim();
    if (seg.isWordLike && term) tokens.push(term);
  }
  return tokens;
}
