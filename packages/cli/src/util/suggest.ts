// The one rule for "did you mean": suggest a candidate only when it is the
// single best match and it is close. A wrong suggestion costs more than none,
// so a word that is near several candidates, or none, gets no suggestion.

/**
 * How many edits a typed word may be from a candidate and still count as
 * close. A word of one or two letters is near everything, so only a
 * difference of case counts there.
 */
const limitFor = (length: number): number => {
  if (length <= 2) {
    return 0;
  }
  if (length <= 4) {
    return 1;
  }
  return length <= 8 ? 2 : 3;
};

/**
 * Edits between two words, where swapping two neighbors (`jsno` for `json`)
 * is one edit, because that is the commonest slip of the fingers.
 */
export const editDistance = (a: string, b: string): number => {
  let beforePrevious: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, (beforePrevious[j - 2] ?? 0) + 1);
      }
      current[j] = best;
    }
    beforePrevious = previous;
    previous = current;
  }
  return previous[b.length] ?? 0;
};

/**
 * The one item that `word` is close to, or undefined when none is close or
 * two are equally close. An item can answer to several words, such as a
 * command's name and its aliases, and then counts once, at its closest.
 */
export const closestBy = <T>(
  word: string,
  items: readonly T[],
  wordsOf: (item: T) => readonly string[]
): T | undefined => {
  const typed = word.toLowerCase();
  const scored = items.map((item) => ({
    item,
    score: Math.min(
      ...wordsOf(item).map((name) => editDistance(typed, name.toLowerCase()))
    ),
  }));
  const best = Math.min(...scored.map((entry) => entry.score));
  const nearest = scored.filter((entry) => entry.score === best);
  const [only] = nearest;
  return nearest.length === 1 && only && best <= limitFor(typed.length)
    ? only.item
    : undefined;
};

/** The one candidate that `word` is close to: the same word in another case, or a few edits away. */
export const closest = (
  word: string,
  candidates: readonly string[]
): string | undefined =>
  closestBy(word, [...new Set(candidates)], (candidate) => [candidate]);
