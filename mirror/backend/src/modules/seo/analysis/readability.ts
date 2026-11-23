/**
 * Language-aware readability estimates for the SEO analysis engine.
 *
 * Both are heuristics and are labelled as such in the UI: they approximate
 * how demanding a text is, they do not measure comprehension.
 *
 * - Persian: no validated Flesch variant exists, so we report sentence
 *   length statistics (average words per sentence, share of long sentences),
 *   the metric Persian style guides actually use.
 * - English: Flesch Reading Ease with a syllable heuristic (vowel groups,
 *   silent-e correction). Good enough for a traffic-light, not for research.
 */

export interface ReadabilityResult {
  language: 'fa' | 'en';
  sentences: number;
  words: number;
  avgWordsPerSentence: number;
  /** Share (0–1) of sentences longer than `longSentenceWords`. */
  longSentenceShare: number;
  longSentenceWords: number;
  /** English only. */
  fleschReadingEase: number | null;
  grade: 'easy' | 'fair' | 'hard';
}

const SENTENCE_SPLIT = /[.!?؟؛…]+(?:\s+|$)|\n{2,}/u;

export function splitSentences(text: string): string[] {
  return text
    .split(SENTENCE_SPLIT)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).filter(Boolean).length >= 2);
}

function countWordsIn(sentence: string): number {
  return sentence.split(/\s+/).filter(Boolean).length;
}

export function englishSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const stripped = w
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
    .replace(/^y/, '');
  const groups = stripped.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

export function readability(
  text: string,
  language: 'fa' | 'en',
): ReadabilityResult {
  const sentences = splitSentences(text);
  const wordCounts = sentences.map(countWordsIn);
  const words = wordCounts.reduce((a, b) => a + b, 0);
  const longSentenceWords = language === 'fa' ? 30 : 25;
  const avg = sentences.length ? words / sentences.length : 0;
  const longShare = sentences.length
    ? wordCounts.filter((n) => n > longSentenceWords).length / sentences.length
    : 0;

  let flesch: number | null = null;
  let grade: ReadabilityResult['grade'];
  if (language === 'en') {
    const syllables = text
      .split(/\s+/)
      .filter(Boolean)
      .reduce((sum, w) => sum + englishSyllables(w), 0);
    flesch =
      words && sentences.length
        ? Math.round(
            (206.835 -
              1.015 * (words / sentences.length) -
              84.6 * (syllables / words)) *
              10,
          ) / 10
        : null;
    grade =
      flesch === null
        ? 'fair'
        : flesch >= 50
          ? 'easy'
          : flesch >= 30
            ? 'fair'
            : 'hard';
  } else {
    grade =
      avg <= 22 && longShare <= 0.25
        ? 'easy'
        : avg <= 30 && longShare <= 0.4
          ? 'fair'
          : 'hard';
  }
  return {
    language,
    sentences: sentences.length,
    words,
    avgWordsPerSentence: Math.round(avg * 10) / 10,
    longSentenceShare: Math.round(longShare * 100) / 100,
    longSentenceWords,
    fleschReadingEase: flesch,
    grade,
  };
}
