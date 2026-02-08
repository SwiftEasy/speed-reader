// Natural reading voice: words the brain barely registers (glide fast)
export const FUNCTION_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did',
  'of', 'to', 'in', 'at', 'by', 'for', 'with', 'on', 'from', 'into',
  'it', 'its', 'he', 'she', 'we', 'they', 'me', 'him', 'us', 'them',
  'my', 'his', 'her', 'our', 'your', 'their',
  'this', 'that', 'these', 'those',
  'as', 'if', 'than', 'then', 'not', 'no',
  'up', 'out', 'about', 'just', 'also', 'very', 'too', 'so',
  'can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might', 'must',
  'am', 'get', 'got', 'much', 'many', 'some', 'any',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
  'own', 'same', 'such'
]);

// Words where the brain naturally pauses — clause/phrase boundaries
export const PHRASE_BOUNDARY_WORDS = new Set([
  'which', 'who', 'whom', 'whose', 'where', 'when', 'while',
  'because', 'although', 'though', 'since', 'unless', 'until',
  'however', 'therefore', 'moreover', 'furthermore', 'nevertheless',
  'meanwhile', 'otherwise', 'consequently', 'accordingly',
  'but', 'yet', 'and', 'or', 'nor',
  'after', 'before', 'during', 'between', 'through', 'against',
  'whether', 'whereas', 'whereby'
]);

export const SAMPLE_TEXT = `The art of reading is not merely about speed. It is about rhythm, comprehension, and the natural flow of language through your mind.

When you read silently, your brain processes words at varying speeds. Short function words like "the" and "is" fly past almost invisibly, while longer, more complex words demand additional processing time. Your internal voice naturally pauses at the boundaries between clauses, however brief those pauses may be.

This speed reader models that natural rhythm. Instead of displaying every word at the same mechanical pace, it accelerates through familiar words and decelerates for complexity. It pauses at punctuation, breathes between paragraphs, and prepares you for what comes next.

Try adjusting the speed with the up and down arrow keys. Press B for the backglance view, C for context mode, or P for the full page view. Each mode offers a different way to experience accelerated reading while maintaining comprehension.

The goal is not just to read faster. It is to read naturally, at whatever pace feels comfortable, while training your brain to process text more efficiently over time.`;

/**
 * Calculate display delay for a word based on natural reading voice model.
 * Pure function — no React dependencies.
 */
export function calculateWordDelay(word, wpm, {
  isContextMode = false,
  speedMult = 1,
  chunk = 1,
  wordPosition = 0,
  isFirstOfSentence = false,
  isAfterComma = false,
  wordsIntoSentence = 0,
  nextWord = ''
} = {}) {
  const baseDelay = 60000 / wpm;

  // Context mode: simpler timing, still with natural punctuation pauses
  if (isContextMode) {
    let delay = baseDelay / speedMult;
    if (chunk > 1) delay *= (1 + (chunk - 1) * 0.3);
    if (/[.!?]$/.test(word)) delay *= 1.8;
    if (/[,;:]$/.test(word)) delay *= 1.3;
    return delay;
  }

  // === NATURAL INTERNAL READING VOICE ===
  // Models how the brain actually processes text:
  // - Function words are near-invisible (glide fast)
  // - Content words get dwell time proportional to complexity
  // - Phrase boundaries create natural pauses
  // - Lookahead prepares for upcoming complexity
  // - Variation follows breathing rhythm, not random noise

  const cleanWord = word.toLowerCase().replace(/[^a-z'-]/g, '');
  const isFunctionWord = FUNCTION_WORDS.has(cleanWord);
  const isPhraseBoundary = PHRASE_BOUNDARY_WORDS.has(cleanWord);

  let multiplier = 1.0;

  // --- 1. Word class: function words fly, content words dwell ---
  if (isFunctionWord && cleanWord.length <= 3) {
    multiplier = 0.6;  // "the", "a", "is", "of" — brain auto-fills
  } else if (isFunctionWord) {
    multiplier = 0.75; // "would", "could", "their" — slightly more weight
  } else if (cleanWord.length >= 8) {
    multiplier = 1.15 + (cleanWord.length - 8) * 0.04; // complexity scales with length
  }

  // --- 2. Phrase boundaries: natural breath points ---
  // The brain pauses at clause starters — "however", "because", "which"
  if (isPhraseBoundary && !isFirstOfSentence) {
    multiplier *= 1.25;
  }

  // --- 3. Lookahead: prepare for what's coming ---
  if (nextWord) {
    const nextClean = nextWord.toLowerCase().replace(/[^a-z'-]/g, '');
    // Slow before a phrase boundary word (anticipatory pause)
    if (PHRASE_BOUNDARY_WORDS.has(nextClean)) {
      multiplier *= 1.1;
    }
    // Slow before a long/complex upcoming word
    if (nextClean.length >= 10) {
      multiplier *= 1.08;
    }
  }

  // --- 4. Sentence position: orient → cruise → fatigue ---
  if (isFirstOfSentence) {
    multiplier *= 1.2; // orient: where are we?
  } else if (isAfterComma) {
    multiplier *= 1.12; // new clause needs reorientation
  }
  // Mid-sentence cruise: brain is locked in, go faster
  if (wordsIntoSentence >= 2 && wordsIntoSentence <= 5 && !isFunctionWord) {
    multiplier *= 0.95;
  }
  // Long sentence fatigue: gradual deceleration
  if (wordsIntoSentence > 12) {
    multiplier *= 1 + (wordsIntoSentence - 12) * 0.01;
  }

  // --- 5. Punctuation: mental breath points ---
  if (/[.!?]$/.test(word)) {
    multiplier += 0.85; // sentence end — mental breath
  } else if (/[,;:]$/.test(word)) {
    multiplier += 0.3;  // clause pause
  } else if (/[—–\-]$/.test(word)) {
    multiplier += 0.4;  // dash — thought pivot
  }

  // --- 6. Emphasis markers ---
  if (!isFirstOfSentence && /^[A-Z]/.test(word)) {
    multiplier *= 1.15; // proper noun or emphasis
  }
  if (/\d/.test(word)) multiplier += 0.35; // numbers need decoding
  if (/^\d+$/.test(word)) multiplier += 0.15;
  if (/^["'"'(]/.test(word)) multiplier *= 1.1; // quote = voice shift

  // --- 7. Natural variation: breathing wave + micro-texture ---
  // Smooth sine wave mimics reading breath rhythm
  // Micro-variation adds organic texture without robotic randomness
  const breathWave = Math.sin(wordPosition * 0.4) * 0.05; // ±5% slow wave
  const microVariation = (Math.random() - 0.5) * 0.06;    // ±3% texture
  multiplier *= (1 + breathWave + microVariation);

  // --- Apply ---
  let delay = baseDelay * multiplier;

  if (chunk > 1) {
    delay *= (1 + (chunk - 1) * 0.3);
  }

  return delay;
}

export function getOptimalRecognitionPoint(word) {
  const cleanWord = word.replace(/[^a-zA-Z0-9'-]/g, '');
  const len = cleanWord.length;
  if (len <= 1) return 0;
  if (len <= 5) return Math.floor(len / 2);
  if (len <= 9) return Math.floor(len / 2) - 1;
  if (len <= 13) return Math.floor(len / 2) - 1;
  return Math.floor(len / 2) - 2;
}
