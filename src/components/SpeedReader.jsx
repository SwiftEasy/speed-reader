import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Play, Pause, SkipBack, SkipForward, Upload, Settings, BookOpen, Zap, List, X } from 'lucide-react';

// CSS for spotlight sweep animation
const spotlightStyles = `
@keyframes sweepLine {
  0% { left: -10%; }
  100% { left: 85%; }
}
.spotlight-sweep {
  animation: sweepLine var(--sweep-duration, 2s) linear forwards;
}
`;

const SAMPLE_TEXT = `The art of reading is not merely about speed. It is about rhythm, comprehension, and the natural flow of language through your mind.

When you read silently, your brain processes words at varying speeds. Short function words like "the" and "is" fly past almost invisibly, while longer, more complex words demand additional processing time. Your internal voice naturally pauses at the boundaries between clauses, however brief those pauses may be.

This speed reader models that natural rhythm. Instead of displaying every word at the same mechanical pace, it accelerates through familiar words and decelerates for complexity. It pauses at punctuation, breathes between paragraphs, and prepares you for what comes next.

Try adjusting the speed with the up and down arrow keys. Press B for the backglance view, C for context mode, or P for the full page view. Each mode offers a different way to experience accelerated reading while maintaining comprehension.

The goal is not just to read faster. It is to read naturally, at whatever pace feels comfortable, while training your brain to process text more efficiently over time.`;

// Natural reading voice: words the brain barely registers (glide fast)
const FUNCTION_WORDS = new Set([
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
const PHRASE_BOUNDARY_WORDS = new Set([
  'which', 'who', 'whom', 'whose', 'where', 'when', 'while',
  'because', 'although', 'though', 'since', 'unless', 'until',
  'however', 'therefore', 'moreover', 'furthermore', 'nevertheless',
  'meanwhile', 'otherwise', 'consequently', 'accordingly',
  'but', 'yet', 'and', 'or', 'nor',
  'after', 'before', 'during', 'between', 'through', 'against',
  'whether', 'whereas', 'whereby'
]);

function detectChapters(text, pdfOutline = null) {
  if (pdfOutline && pdfOutline.length > 0) {
    return pdfOutline;
  }
  
  const chapters = [];
  const lines = text.split(/\n+/);
  let wordIndex = 0;
  
  const chapterPatterns = [
    { pattern: /^Chapter\s+(\d+|[IVXLC]+)\s*[:.\-–—]\s*.+/i, level: 1 },
    { pattern: /^Part\s+(\d+|[IVXLC]+)\s*[:.\-–—]\s*.+/i, level: 0 },
    { pattern: /^Book\s+(\d+|[IVXLC]+)\s*[:.\-–—]?\s*/i, level: 0 },
    { pattern: /^Appendix\s+[A-Z]\s*[:.\-–—]/i, level: 1 },
    { pattern: /^(Introduction|Conclusion|Preface|Foreword|Prologue|Epilogue)$/i, level: 1 },
  ];
  
  const seen = new Set();
  
  for (const line of lines) {
    const trimmed = line.trim();
    const wordsInLine = trimmed.split(/\s+/).filter(w => w.length > 0);
    
    if (trimmed.length >= 5 && trimmed.length <= 80 && wordsInLine.length <= 12) {
      for (const { pattern, level } of chapterPatterns) {
        if (pattern.test(trimmed)) {
          const key = trimmed.toLowerCase().slice(0, 25);
          if (!seen.has(key)) {
            seen.add(key);
            chapters.push({
              title: trimmed.slice(0, 50) + (trimmed.length > 50 ? '...' : ''),
              wordIndex: wordIndex,
              level: level
            });
          }
          break;
        }
      }
    }
    
    wordIndex += wordsInLine.length;
  }
  
  chapters.sort((a, b) => a.wordIndex - b.wordIndex);
  
  return chapters;
}

function getOptimalRecognitionPoint(word) {
  const cleanWord = word.replace(/[^a-zA-Z0-9'-]/g, '');
  const len = cleanWord.length;
  if (len <= 1) return 0;
  if (len <= 5) return Math.floor(len / 2);
  if (len <= 9) return Math.floor(len / 2) - 1;
  if (len <= 13) return Math.floor(len / 2) - 1;
  return Math.floor(len / 2) - 2;
}

function WordDisplay({ word }) {
  if (!word) {
    return (
      <div className="flex items-center justify-center h-32">
        <span className="text-zinc-600 text-2xl">Upload a book to start</span>
      </div>
    );
  }

  const cleanWord = word.replace(/[^a-zA-Z0-9'-]/g, '');
  const orpIndex = getOptimalRecognitionPoint(word);
  
  const wordStart = word.indexOf(cleanWord);
  const actualOrpIndex = wordStart + orpIndex;
  const before = word.slice(0, actualOrpIndex);
  const focal = word[actualOrpIndex] || '';
  const after = word.slice(actualOrpIndex + 1);

  const beforeLen = before.length;
  const afterLen = after.length;
  const offset = (afterLen - beforeLen) * 0.5;
  
  return (
    <div className="flex items-center justify-center h-32 relative">
      <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-red-500/30 -translate-x-1/2" />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 border-2 border-red-500/50 rotate-45" />
      
      <div 
        className="text-5xl md:text-6xl lg:text-7xl whitespace-nowrap"
        style={{ fontFamily: "'JetBrains Mono', monospace", transform: `translateX(${offset}ch)`, letterSpacing: '0.05em' }}
      >
        <span className="text-white">{before}</span>
        <span className="text-red-500 font-bold">{focal}</span>
        <span className="text-white">{after}</span>
      </div>
    </div>
  );
}

function ProgressBar({ current, total, onSeek }) {
  const percentage = total > 0 ? (current / total) * 100 : 0;
  
  return (
    <div 
      className="w-full h-2 bg-zinc-800 rounded-full cursor-pointer overflow-hidden"
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const newPosition = Math.floor((x / rect.width) * total);
        onSeek(newPosition);
      }}
    >
      <div 
        className="h-full bg-gradient-to-r from-red-600 to-red-400 transition-all duration-100"
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}

export default function SpeedReader() {
  const [words, setWords] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [wpm, setWpm] = useState(300);
  const [showSettings, setShowSettings] = useState(false);
  const [fileName, setFileName] = useState('');
  const [stats, setStats] = useState({ wordsRead: 0, timeSpent: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [chapters, setChapters] = useState([]);
  const [showChapters, setShowChapters] = useState(false);
  const [rawText, setRawText] = useState('');
  const [showContext, setShowContext] = useState(false);
  const [showBackglance, setShowBackglance] = useState(false);
  const [showFullPage, setShowFullPage] = useState(false);
  const [paragraphStarts, setParagraphStarts] = useState(new Set());
  
  // Speed reading features
  const [chunkSize, setChunkSize] = useState(1); // 1-5 words
  const [bionicReading, setBionicReading] = useState(false);
  const [peripheralPreview, setPeripheralPreview] = useState(false);
  const [contextSpeedMultiplier, setContextSpeedMultiplier] = useState(1); // 1x, 1.5x, 2x, 3x
  const [showContextSettings, setShowContextSettings] = useState(false);
  const [spotlightMode, setSpotlightMode] = useState(false); // Moving spotlight across line
  const [showSingleWord, setShowSingleWord] = useState(true); // Toggle single word display with M
  // DISABLED: Rhythm feature - uncomment to re-enable
  // const [rhythmType, setRhythmType] = useState('off'); // 'off', 'metronome', 'breathing', '4/4'
  
  const fileInputRef = useRef(null);
  const intervalRef = useRef(null);
  const startTimeRef = useRef(null);

  const currentWord = words[currentIndex] || '';

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT') return;
      
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          skipBack();
          break;
        case 'ArrowRight':
          e.preventDefault();
          skipForward();
          break;
        case 'ArrowUp':
          e.preventDefault();
          setWpm(prev => Math.min(1000, prev + 25));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setWpm(prev => Math.max(100, prev - 25));
          break;
        case 'KeyB':
          e.preventDefault();
          setShowBackglance(prev => !prev);
          break;
        case 'KeyC':
          e.preventDefault();
          setShowContext(prev => !prev);
          break;
        case 'KeyP':
          e.preventDefault();
          setShowFullPage(prev => !prev);
          break;
        case 'KeyM':
          e.preventDefault();
          setShowSingleWord(prev => !prev);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [words.length, isPlaying, currentIndex]);

  const calculateDelay = useCallback((word, isContextMode = false, speedMult = 1, chunk = 1, wordPosition = 0, isFirstOfSentence = false, isAfterComma = false, wordsIntoSentence = 0, nextWord = '') => {
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
  }, [wpm]);

  useEffect(() => {
    if (isPlaying && words.length > 0) {
      if (!startTimeRef.current) {
        startTimeRef.current = Date.now();
      }

      const tick = () => {
        setCurrentIndex((prev) => {
          const increment = showContext ? chunkSize : 1;
          if (prev >= words.length - increment) {
            setIsPlaying(false);
            return words.length - 1;
          }
          return prev + increment;
        });
      };

      // Check if this is the first word of a sentence (previous word ended with .!?)
      const prevWord = currentIndex > 0 ? words[currentIndex - 1] : '';
      const isFirstOfSentence = currentIndex === 0 || /[.!?]$/.test(prevWord);
      const isAfterComma = /[,;:]$/.test(prevWord);
      
      // Count words since last sentence end for gradual acceleration
      let wordsIntoSentence = 0;
      for (let i = currentIndex - 1; i >= 0; i--) {
        if (/[.!?]$/.test(words[i])) break;
        wordsIntoSentence++;
      }
      
      // When spotlight mode is on in context, use constant timing to sync with sweep animation
      let delay;
      if (showContext && spotlightMode) {
        // Constant timing = base delay only, to match the linear CSS sweep
        const baseDelay = 60000 / wpm;
        delay = baseDelay / contextSpeedMultiplier;
        if (chunkSize > 1) delay = delay * (1 + (chunkSize - 1) * 0.3);
      } else {
        const nextWord = currentIndex < words.length - 1 ? words[currentIndex + 1] : '';
        delay = calculateDelay(currentWord, showContext, contextSpeedMultiplier, chunkSize, currentIndex, isFirstOfSentence, isAfterComma, wordsIntoSentence, nextWord);
      }
      
      // Add pause at paragraph boundaries for idea consumption
      if (paragraphStarts.has(currentIndex) && currentIndex > 0) {
        delay *= 1.2; // 20% extra pause at paragraph start
      }
      
      intervalRef.current = setTimeout(tick, delay);

      return () => clearTimeout(intervalRef.current);
    }
  }, [isPlaying, currentIndex, words, currentWord, calculateDelay, showContext, contextSpeedMultiplier, chunkSize, spotlightMode, wpm, paragraphStarts]);

  useEffect(() => {
    if (fileName && words.length > 0 && currentIndex > 0) {
      const bookKey = `speedreader_${fileName}`;
      const progressData = { index: currentIndex, wpm, timestamp: Date.now() };
      localStorage.setItem(bookKey, JSON.stringify(progressData));
    }
  }, [currentIndex, wpm, fileName, words.length]);

  useEffect(() => {
    if (isPlaying) {
      const timer = setInterval(() => {
        if (startTimeRef.current) {
          setStats(prev => ({
            ...prev,
            wordsRead: currentIndex,
            timeSpent: Math.floor((Date.now() - startTimeRef.current) / 1000)
          }));
        }
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [isPlaying, currentIndex]);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    let text = '';
    let pdfOutline = [];

    try {
      const extension = file.name.split('.').pop()?.toLowerCase();
      
      if (extension === 'txt' || extension === 'md') {
        text = await file.text();
      } else if (extension === 'epub') {
        setIsLoading(true);
        text = await readEpub(file);
      } else if (extension === 'pdf') {
        setIsLoading(true);
        const result = await readPdf(file);
        text = result.text;
        pdfOutline = result.outline || [];
      } else {
        text = await file.text();
      }
    } catch (err) {
      console.error('File reading error:', err);
      text = 'Error reading file. Please try a .txt file.';
    }

    const cleanedText = text
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([.!?])([A-Z])/g, '$1 $2')
      .replace(/(\d)([A-Z])/g, '$1 $2')
      .replace(/([a-z])(\d)/g, '$1 $2')
      .replace(/([.!?,;:])([a-zA-Z])/g, '$1 $2')
      .replace(/([a-z]{2,})([A-Z][a-z])/g, '$1 $2')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([''])([a-zA-Z])/g, '$1 $2')
      .replace(/([a-zA-Z])([''])/g, '$1 $2');
    
    const splitLongWords = (word) => {
      if (word.length <= 15) return [word];
      let result = word
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([.!?,;:])([a-zA-Z])/g, '$1 $2')
        .replace(/([a-z]{3,})([A-Z])/g, '$1 $2')
        .replace(/(\.)(\d)/g, '$1 $2')
        .replace(/(\d)([a-zA-Z])/g, '$1 $2')
        .replace(/(the)([a-z])/gi, '$1 $2')
        .replace(/([a-z])(the)/gi, '$1 $2')
        .replace(/(and)([a-z])/gi, '$1 $2')
        .replace(/([a-z])(and)/gi, '$1 $2')
        .replace(/(of)([a-z])/gi, '$1 $2')
        .replace(/([a-z])(of)/gi, '$1 $2')
        .replace(/(to)([a-z])/gi, '$1 $2')
        .replace(/([a-z])(to)/gi, '$1 $2')
        .replace(/(in)([a-z])/gi, '$1 $2')
        .replace(/([a-z])(in)/gi, '$1 $2')
        .replace(/(was)([a-z])/gi, '$1 $2')
        .replace(/([a-z])(was)/gi, '$1 $2')
        .replace(/(that)([a-z])/gi, '$1 $2')
        .replace(/([a-z])(that)/gi, '$1 $2')
        .replace(/(with)([a-z])/gi, '$1 $2')
        .replace(/([a-z])(with)/gi, '$1 $2')
        .replace(/(for)([a-z])/gi, '$1 $2')
        .replace(/([a-z])(for)/gi, '$1 $2')
        .replace(/(by)([a-z])/gi, '$1 $2')
        .replace(/([a-z])(by)/gi, '$1 $2')
        .replace(/(be)([a-z])/gi, '$1 $2')
        .replace(/([a-z])(be)/gi, '$1 $2')
        .replace(/(had)([a-z])/gi, '$1 $2')
        .replace(/([a-z])(had)/gi, '$1 $2')
        .replace(/(his)([a-z])/gi, '$1 $2')
        .replace(/([a-z])(his)/gi, '$1 $2')
        .replace(/(not)([a-z])/gi, '$1 $2')
        .replace(/([a-z])(not)/gi, '$1 $2');
      const parts = result.split(/\s+/).filter(w => w.length > 0);
      return parts.length > 1 ? parts : [word];
    };
    
    const isFootnoteOrPageNumber = (w) => {
      if (/^\.?\d{1,3}$/.test(w)) return true;
      if (/^\[\d+\]$/.test(w)) return true;
      if (/^\(\d+\)$/.test(w)) return true;
      if (/^\d+\.$/.test(w) && parseInt(w) < 500) return true;
      return false;
    };
    
    const paragraphs = cleanedText.split(/\n\n+/);
    const paraStarts = new Set();
    let wordIdx = 0;
    
    const wordList = [];
    for (const para of paragraphs) {
      const paraWords = para
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .filter(w => w.length > 0)
        .flatMap(splitLongWords)
        .filter(w => !isFootnoteOrPageNumber(w));
      
      if (paraWords.length > 0) {
        paraStarts.add(wordIdx);
        wordList.push(...paraWords);
        wordIdx += paraWords.length;
      }
    }
    
    setParagraphStarts(paraStarts);

    if (wordList.length === 0) {
      setWords(['No', 'text', 'found', 'in', 'file.', 'Try', 'a', 'different', 'file.']);
    } else {
      setWords(wordList);
    }
    
    setRawText(text);
    
    const detectedChapters = detectChapters(text, pdfOutline);
    
    const findChapterInWordList = (title, estimatedIdx) => {
      const romanMatch = title.match(/^([IVXLC]+)\s*[:\-–—.]?\s*(.+)$/i);
      if (romanMatch) {
        const [, roman, restTitle] = romanMatch;
        const firstTitleWord = restTitle.split(/\s+/).filter(w => w.length > 1)[0]?.toLowerCase().replace(/[^a-z]/g, '');
        if (firstTitleWord) {
          const searchStart = Math.max(0, estimatedIdx - 500);
          const searchEnd = Math.min(wordList.length, estimatedIdx + 1500);
          for (let i = searchStart; i < searchEnd; i++) {
            const word = wordList[i]?.replace(/[^a-zA-Z]/g, '');
            if (word?.toUpperCase() === roman.toUpperCase()) {
              for (let k = 1; k <= 10; k++) {
                const nextWord = wordList[i + k]?.toLowerCase().replace(/[^a-z]/g, '');
                if (nextWord === firstTitleWord) {
                  return i;
                }
              }
            }
          }
        }
      }
      
      const titleWords = title.split(/\s+/).filter(w => w.length > 1);
      const searchStart = Math.max(0, estimatedIdx - 500);
      const searchEnd = Math.min(wordList.length, estimatedIdx + 1500);
      for (let i = searchStart; i < searchEnd; i++) {
        let matchCount = 0;
        for (let j = 0; j < Math.min(titleWords.length, 4); j++) {
          const tw = titleWords[j]?.toLowerCase().replace(/[^a-z0-9]/g, '');
          const ww = wordList[i + j]?.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (tw === ww) matchCount++;
        }
        if (matchCount >= Math.min(titleWords.length, 4) * 0.6) {
          return i;
        }
      }
      return estimatedIdx;
    };
    
    const ratio = wordList.length / Math.max(1, text.split(/\s+/).length);
    const adjustedChapters = detectedChapters.map(ch => {
      const estimated = Math.floor(ch.wordIndex * ratio);
      const found = findChapterInWordList(ch.title, estimated);
      console.log(`${found !== estimated ? '✓' : '○'} "${ch.title.slice(0,25)}" est:${estimated} → ${found}`);
      return { ...ch, wordIndex: found };
    }).sort((a, b) => a.wordIndex - b.wordIndex);
    
    console.log(`Found ${adjustedChapters.length} chapters`);
    setChapters(adjustedChapters);
    
    const bookKey = `speedreader_${file.name}`;
    const savedProgress = localStorage.getItem(bookKey);
    if (savedProgress) {
      const { index, wpm: savedWpm } = JSON.parse(savedProgress);
      if (index > 0 && index < wordList.length) {
        setCurrentIndex(index);
        console.log(`Resumed from word ${index}`);
      }
      if (savedWpm) setWpm(savedWpm);
    } else {
      setCurrentIndex(0);
    }
    
    setIsPlaying(false);
    setIsLoading(false);
    startTimeRef.current = null;
    setStats({ wordsRead: 0, timeSpent: 0 });
  };
  
  const jumpToChapter = (chapter) => {
    const titleWords = chapter.title.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const searchStart = Math.max(0, chapter.wordIndex - 500);
    const searchEnd = Math.min(words.length, chapter.wordIndex + 500);
    
    for (let i = searchStart; i < searchEnd; i++) {
      const windowWords = words.slice(i, i + titleWords.length).map(w => w.toLowerCase());
      const matches = titleWords.filter((tw, idx) => windowWords[idx]?.includes(tw)).length;
      if (matches >= Math.ceil(titleWords.length * 0.6)) {
        setCurrentIndex(i);
        setShowChapters(false);
        setIsPlaying(false);
        console.log(`Jumped to "${chapter.title}" at word ${i}`);
        return;
      }
    }
    
    setCurrentIndex(Math.min(chapter.wordIndex, words.length - 1));
    setShowChapters(false);
    setIsPlaying(false);
    console.log(`Fallback jump to word ${chapter.wordIndex}`);
  };

  const readEpub = async (file) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(arrayBuffer);
      
      let text = '';
      const htmlFiles = Object.keys(zip.files).filter(name => 
        name.endsWith('.html') || name.endsWith('.xhtml')
      );
      
      for (const fileName of htmlFiles) {
        const content = await zip.files[fileName].async('string');
        const parser = new DOMParser();
        const doc = parser.parseFromString(content, 'text/html');
        text += doc.body?.textContent || '';
        text += ' ';
      }
      
      return text;
    } catch (err) {
      console.error('EPUB parsing error:', err);
      return 'Error reading EPUB file. Try a .txt file instead.';
    }
  };

  const readPdf = async (file) => {
    try {
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.js');
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
      
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      let text = '';
      const totalPages = pdf.numPages;
      const pageWordCounts = [0];
      console.log(`Processing ${totalPages} pages...`);
      
      for (let i = 1; i <= totalPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        
        let lastY = null;
        let lastX = null;
        let lastWidth = 0;
        let pageText = '';
        
        for (const item of content.items) {
          const x = item.transform[4];
          const y = item.transform[5];
          const fontSize = Math.abs(item.transform[0]) || 12;
          const width = item.width || (item.str.length * fontSize * 0.5);
          
          if (lastY !== null) {
            const yGap = Math.abs(y - lastY);
            if (yGap > fontSize * 1.5) {
              pageText += '\n\n';
              lastX = null;
            } else if (yGap > 5) {
              pageText += ' ';
              lastX = null;
            }
          }
          if (lastX !== null) {
            const gap = x - (lastX + lastWidth);
            const spaceThreshold = fontSize * 0.15;
            if (gap > spaceThreshold || gap < -1) {
              pageText += ' ';
            }
          }
          
          pageText += item.str;
          lastX = x;
          lastY = y;
          lastWidth = width;
        }
        text += pageText + '\n\n';
        pageWordCounts.push(text.split(/\s+/).filter(w => w).length);
      }
      
      let pdfOutline = [];
      const allWords = text.split(/\s+/).filter(w => w);
      
      const findTitleInText = (title, startWordIdx) => {
        const searchEnd = Math.min(allWords.length, startWordIdx + 3000);
        
        const romanMatch = title.match(/^([IVXLC]+)\s*[:\-–—.]?\s*(.+)$/i);
        if (romanMatch) {
          const [, roman, restTitle] = romanMatch;
          const restWords = restTitle.split(/\s+/).filter(w => w.length > 1);
          const firstTitleWord = restWords[0]?.toLowerCase().replace(/[^a-z]/g, '');
          
          if (firstTitleWord) {
            for (let i = startWordIdx; i < searchEnd; i++) {
              const word = allWords[i]?.replace(/[^a-zA-Z]/g, '');
              if (word?.toUpperCase() === roman.toUpperCase()) {
                for (let k = 1; k <= 10; k++) {
                  const nextWord = allWords[i + k]?.toLowerCase().replace(/[^a-z]/g, '');
                  if (nextWord === firstTitleWord) {
                    return i;
                  }
                }
              }
            }
          }
        }
        
        const titleWords = title.split(/\s+/).filter(w => w.length > 1);
        if (titleWords.length === 0) return startWordIdx;
        
        for (let i = startWordIdx; i < searchEnd - titleWords.length; i++) {
          let matchCount = 0;
          for (let j = 0; j < Math.min(titleWords.length, 5); j++) {
            const tw = titleWords[j].toLowerCase().replace(/[^a-z0-9]/g, '');
            const aw = allWords[i + j]?.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (tw === aw || (tw.length > 3 && aw?.includes(tw))) {
              matchCount++;
            }
          }
          if (matchCount >= Math.min(titleWords.length, 5) * 0.6) {
            return i;
          }
        }
        return startWordIdx;
      };
      
      try {
        const outline = await pdf.getOutline();
        if (outline && outline.length > 0) {
          const flattenOutline = async (items, level = 0) => {
            for (const item of items) {
              let pageNum = 1;
              if (item.dest) {
                try {
                  const dest = typeof item.dest === 'string' 
                    ? await pdf.getDestination(item.dest) 
                    : item.dest;
                  if (dest) {
                    const pageIndex = await pdf.getPageIndex(dest[0]);
                    pageNum = pageIndex + 1;
                  }
                } catch (e) {}
              }
              const pageStartIdx = pageNum <= 1 ? 0 : (pageWordCounts[pageNum - 2] || 0);
              const exactIdx = findTitleInText(item.title, pageStartIdx);
              const found = exactIdx !== pageStartIdx;
              console.log(`${found ? '✓' : '✗'} "${item.title.slice(0,25)}" page ${pageNum} → word ${exactIdx}${found ? '' : ' (fallback)'}`);
              
              pdfOutline.push({
                title: item.title,
                wordIndex: exactIdx,
                level: Math.min(level, 2)
              });
              if (item.items && item.items.length > 0) {
                await flattenOutline(item.items, level + 1);
              }
            }
          };
          await flattenOutline(outline);
          console.log(`PDF outline: ${pdfOutline.length} entries (with exact positions)`);
        }
      } catch (e) {
        console.log('No PDF outline available');
      }
      
      console.log(`PDF loaded: ${totalPages} pages, ${text.split(/\s+/).length} words`);
      return { text: text || 'No text found in PDF.', outline: pdfOutline };
    } catch (err) {
      console.error('PDF parsing error:', err);
      return { text: 'PDF reading failed. Error: ' + err.message, outline: [] };
    }
  };

  const togglePlay = () => {
    if (words.length === 0) return;
    setIsPlaying(!isPlaying);
  };

  const skipBack = () => {
    setCurrentIndex(Math.max(0, currentIndex - 10));
  };

  const skipForward = () => {
    setCurrentIndex(Math.min(words.length - 1, currentIndex + 10));
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const estimatedTimeLeft = words.length > 0 
    ? Math.ceil((words.length - currentIndex) / wpm)
    : 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 to-zinc-900 flex flex-col">
      <style>{spotlightStyles}</style>
      <header className="p-6 flex items-center justify-between border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">SpeedReader</h1>
          <span className="text-[10px] font-medium text-red-400 bg-red-500/15 px-1.5 py-0.5 rounded uppercase tracking-wider">Beta</span>
        </div>
        
        <div className="flex items-center gap-4">
          {fileName && (
            <div className="flex items-center gap-2 text-zinc-400">
              <BookOpen className="w-4 h-4" />
              <span className="text-sm truncate max-w-[200px]">{fileName}</span>
            </div>
          )}
          {chapters.length > 0 && (
            <button
              onClick={() => setShowChapters(!showChapters)}
              className="p-2 rounded-lg hover:bg-zinc-800 transition-colors flex items-center gap-2"
            >
              <List className="w-5 h-5 text-zinc-400" />
              <span className="text-xs text-zinc-500">{chapters.length}</span>
            </button>
          )}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <Settings className="w-5 h-5 text-zinc-400" />
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-8">
        {(words.length > 0 || isLoading) && <div className="w-full max-w-4xl">
          {(words.length > 0 || isLoading) && (showSingleWord || showBackglance || showContext || isLoading) && <div className="bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-2xl p-8 mb-8">
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-zinc-400">Loading PDF...</span>
                </div>
              </div>
            ) : showSingleWord ? (
              <WordDisplay word={currentWord} />
            ) : null}
            
            {showBackglance && words.length > 0 && (() => {
              const FIXED_CHARS = 35;
              const beforeWords = words.slice(Math.max(0, currentIndex - 10), currentIndex);
              const afterWords = words.slice(currentIndex + 1, currentIndex + 11);
              
              let beforeText = beforeWords.join(' ');
              let afterText = afterWords.join(' ');
              
              if (beforeText.length > FIXED_CHARS) {
                beforeText = beforeText.slice(-FIXED_CHARS);
              } else {
                beforeText = beforeText.padStart(FIXED_CHARS, ' ');
              }
              
              if (afterText.length > FIXED_CHARS) {
                afterText = afterText.slice(0, FIXED_CHARS);
              } else {
                afterText = afterText.padEnd(FIXED_CHARS, ' ');
              }
              
              return (
                <div className={showSingleWord ? "mt-4 pt-4 border-t border-zinc-700" : "py-2"}>
                  <div className="text-xs text-zinc-500 mb-3 px-2">Reading flow</div>
                  <div className="text-zinc-300 text-base font-mono flex justify-center items-center overflow-hidden px-4" style={{ gap: '0.75rem' }}>
                    <span className="text-zinc-500 text-right" style={{ width: `${FIXED_CHARS}ch`, display: 'inline-block', whiteSpace: 'pre' }}>
                      {beforeText}
                    </span>
                    <span className="text-red-400 font-bold bg-red-500/20 px-3 py-1 rounded" style={{ minWidth: '3ch', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      {currentWord}
                    </span>
                    <span className="text-zinc-500 text-left" style={{ width: `${FIXED_CHARS}ch`, display: 'inline-block', whiteSpace: 'pre' }}>
                      {afterText}
                    </span>
                  </div>
                </div>
              );
            })()}
            
            {showContext && words.length > 0 && !isLoading && (() => {
              const CHARS_PER_LINE = 75;
              const TOTAL_LINES = 7;
              
              const applyBionic = (word) => {
                if (!bionicReading) return word;
                const midpoint = Math.ceil(word.length / 2);
                return <><strong className="font-bold">{word.slice(0, midpoint)}</strong>{word.slice(midpoint)}</>;
              };
              
              // Build a static page of lines - only updates when currentIndex leaves the page
              const buildStaticPage = () => {
                const lines = [];
                let lineWords = [];
                let lineLength = 0;
                let pageStartIdx = 0;
                let pageEndIdx = 0;
                
                // First, find which "page" the current word is on
                // Build pages sequentially until we find the one containing currentIndex
                let wordIdx = 0;
                let foundPage = false;
                
                while (wordIdx < words.length && !foundPage) {
                  const pageLines = [];
                  const pageStart = wordIdx;
                  lineWords = [];
                  lineLength = 0;
                  
                  // Build lines for this page
                  while (wordIdx < words.length && pageLines.length < TOTAL_LINES) {
                    const word = words[wordIdx];
                    const wordLen = word.length + 1;
                    
                    if (lineLength + wordLen > CHARS_PER_LINE && lineWords.length > 0) {
                      pageLines.push({ words: [...lineWords] });
                      lineWords = [];
                      lineLength = 0;
                    }
                    
                    lineWords.push({ word, globalIdx: wordIdx });
                    lineLength += wordLen;
                    wordIdx++;
                  }
                  
                  // Add remaining words as last line
                  if (lineWords.length > 0 && pageLines.length < TOTAL_LINES) {
                    pageLines.push({ words: [...lineWords] });
                  }
                  
                  const pageEnd = wordIdx;
                  
                  // Check if currentIndex is within this page
                  if (currentIndex >= pageStart && currentIndex < pageEnd) {
                    foundPage = true;
                    return pageLines;
                  }
                  
                  // If we've gone past and still haven't found it, use this page
                  if (currentIndex < pageStart) {
                    foundPage = true;
                    return pageLines;
                  }
                }
                
                // Return last page if we're at the end
                const lastPageLines = [];
                lineWords = [];
                lineLength = 0;
                const startFrom = Math.max(0, words.length - 80); // approximate words for 7 lines
                
                for (let i = startFrom; i < words.length && lastPageLines.length < TOTAL_LINES; i++) {
                  const word = words[i];
                  const wordLen = word.length + 1;
                  
                  if (lineLength + wordLen > CHARS_PER_LINE && lineWords.length > 0) {
                    lastPageLines.push({ words: [...lineWords] });
                    lineWords = [];
                    lineLength = 0;
                  }
                  
                  lineWords.push({ word, globalIdx: i });
                  lineLength += wordLen;
                }
                
                if (lineWords.length > 0 && lastPageLines.length < TOTAL_LINES) {
                  lastPageLines.push({ words: [...lineWords] });
                }
                
                return lastPageLines;
              };
              
              const lines = buildStaticPage();
              
              return (
                <div className={(showSingleWord || showBackglance) ? "mt-4 pt-4 border-t border-zinc-700" : "py-2"}>
                  <div className="flex items-center justify-between mb-3 px-2">
                    <span className="text-xs text-zinc-500">Context</span>
                    <button 
                      onClick={() => setShowContextSettings(!showContextSettings)}
                      className="text-xs text-zinc-400 hover:text-white px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700"
                    >
                      ⚙️ Settings
                    </button>
                  </div>
                  
                  {showContextSettings && (
                    <div className="mb-3 p-3 bg-zinc-800/50 rounded-lg border border-zinc-700 grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="text-zinc-400 block mb-1">Chunk Size</label>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map(n => (
                            <button key={n} onClick={() => setChunkSize(n)}
                              className={`px-2 py-1 rounded ${chunkSize === n ? 'bg-red-600 text-white' : 'bg-zinc-700 text-zinc-300'}`}>
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-zinc-400 block mb-1">Speed Multiplier</label>
                        <div className="flex gap-1">
                          {[1, 1.5, 2, 3].map(n => (
                            <button key={n} onClick={() => setContextSpeedMultiplier(n)}
                              className={`px-2 py-1 rounded ${contextSpeedMultiplier === n ? 'bg-red-600 text-white' : 'bg-zinc-700 text-zinc-300'}`}>
                              {n}x
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <input type="checkbox" id="bionic" checked={bionicReading} onChange={(e) => setBionicReading(e.target.checked)} className="accent-red-500" />
                        <label htmlFor="bionic" className="text-zinc-300">Bionic Reading</label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input type="checkbox" id="peripheral" checked={peripheralPreview} onChange={(e) => setPeripheralPreview(e.target.checked)} className="accent-red-500" />
                        <label htmlFor="peripheral" className="text-zinc-300">Peripheral Preview</label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input type="checkbox" id="spotlight" checked={spotlightMode} onChange={(e) => setSpotlightMode(e.target.checked)} className="accent-red-500" />
                        <label htmlFor="spotlight" className="text-zinc-300">Line Spotlight</label>
                      </div>
{/* DISABLED: Rhythm feature - uncomment to re-enable
                      <div className="col-span-2">
                        <label className="text-zinc-400 block mb-1">Rhythm</label>
                        <div className="flex gap-1">
                          {[
                            { value: 'off', label: 'Off' },
                            { value: 'metronome', label: '⏱ Metro' },
                            { value: 'breathing', label: '🌬 Breath' },
                            { value: '4/4', label: '🎵 4/4' }
                          ].map(r => (
                            <button key={r.value} onClick={() => setRhythmType(r.value)}
                              className={`px-2 py-1 rounded text-xs ${rhythmType === r.value ? 'bg-red-600 text-white' : 'bg-zinc-700 text-zinc-300'}`}>
                              {r.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      */}
                    </div>
                  )}
                  
                  <div 
                    className="bg-zinc-900/50 p-4 rounded-lg text-sm"
                    style={{ fontFamily: 'ui-monospace, monospace', lineHeight: '1.8', width: '100%', maxWidth: '700px', margin: '0 auto' }}
                  >
                    {lines.map((line, lineIdx) => {
                      // Check if this line contains the current word
                      const lineContainsCurrent = line.words.some(item => 
                        item.globalIdx >= currentIndex && item.globalIdx < currentIndex + chunkSize
                      );
                      
                      // Calculate line duration based on words and WPM
                      const lineWordsCount = line.words.length;
                      const lineDuration = (lineWordsCount / wpm) * 60; // seconds to read this line
                      
                      // Find first word index of this line to use as animation key
                      const lineStartIdx = line.words[0]?.globalIdx || 0;
                      
                      const lineStyle = {
                        height: '1.8em',
                        whiteSpace: 'pre',
                        position: 'relative',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        ...(spotlightMode && !lineContainsCurrent ? { opacity: 0.4, transition: 'opacity 0.3s ease' } : {})
                      };
                      
                      return (
                        <div key={lineIdx} style={lineStyle}>
                          {/* Red sweep glow disabled - just using line-by-line white reveal */}
                          {line.words.map((item, wordIdx) => {
                            const { word, globalIdx } = item;
                            const isInChunk = globalIdx >= currentIndex && globalIdx < currentIndex + chunkSize;
                            const isPast = globalIdx < currentIndex;
                            const isPreview = peripheralPreview && globalIdx >= currentIndex + chunkSize && globalIdx < currentIndex + chunkSize + 3;
                            
                            let style = { color: '#71717a' }; // zinc-500 (dim, unread)
                            
                            if (spotlightMode) {
                              // Spotlight mode: whole line turns white when sweep passes
                              // Lines before current = white (already read)
                              // Current line = white (being swept)
                              // Lines after = dim (not yet read)
                              const lineIsPast = line.words[line.words.length - 1].globalIdx < currentIndex;
                              const lineIsCurrent = lineContainsCurrent;
                              
                              if (lineIsPast || lineIsCurrent) {
                                style = { color: '#fff', fontWeight: 500 }; // white, revealed line
                              } else {
                                style = { color: '#52525b' }; // dim, not yet revealed
                              }
                            } else {
                              // Normal mode with red highlight box
                              if (isInChunk) style = { color: '#fff', fontWeight: 600, backgroundColor: 'rgba(239,68,68,0.3)', padding: '2px 4px', borderRadius: '4px' };
                              else if (isPast) style = { color: '#52525b' }; // zinc-600
                              else if (isPreview) style = { color: '#a1a1aa' }; // zinc-400
                            }
                            
                            return (
                              <span key={wordIdx}>
                                <span style={style}>{(isInChunk || isPreview) && !spotlightMode ? applyBionic(word) : word}</span>
                                {wordIdx < line.words.length - 1 ? ' ' : ''}
                              </span>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>}

          {words.length > 0 && <div className="mb-6">
            <ProgressBar 
              current={currentIndex} 
              total={words.length} 
              onSeek={setCurrentIndex}
            />
            <div className="flex justify-between mt-2 text-sm text-zinc-500">
              <span>{currentIndex.toLocaleString()} / {words.length.toLocaleString()} words</span>
              <span>{estimatedTimeLeft} min remaining</span>
            </div>
          </div>}

          {words.length > 0 && <div className="flex items-center justify-center gap-4 mb-8">
            <button
              onClick={skipBack}
              className="p-3 rounded-full bg-zinc-800 hover:bg-zinc-700 transition-colors"
              disabled={words.length === 0}
            >
              <SkipBack className="w-5 h-5 text-white" />
            </button>
            
            <button
              onClick={togglePlay}
              className="p-6 rounded-full bg-red-600 hover:bg-red-500 transition-colors shadow-lg shadow-red-600/30"
            >
              {isPlaying ? (
                <Pause className="w-8 h-8 text-white" />
              ) : (
                <Play className="w-8 h-8 text-white ml-1" />
              )}
            </button>
            
            <button
              onClick={skipForward}
              className="p-3 rounded-full bg-zinc-800 hover:bg-zinc-700 transition-colors"
              disabled={words.length === 0}
            >
              <SkipForward className="w-5 h-5 text-white" />
            </button>
          </div>}

          {words.length > 0 && <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-4 w-full max-w-md">
              <span className="text-zinc-500 text-sm w-16">100</span>
              <input
                type="range"
                min="100"
                max="1000"
                step="25"
                value={wpm}
                onChange={(e) => setWpm(Number(e.target.value))}
                className="flex-1 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-red-500"
              />
              <span className="text-zinc-500 text-sm w-16 text-right">1000</span>
            </div>
            <div className="text-2xl font-bold text-white">
              {wpm} <span className="text-zinc-500 text-lg font-normal">WPM</span>
            </div>
          </div>}

        </div>}

        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.epub,.pdf"
          onChange={handleFileUpload}
          className="hidden"
        />

        {words.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center gap-6 max-w-lg">
            <div className="text-center">
              <p className="text-zinc-400 text-lg mb-2">Read faster with natural pacing</p>
              <p className="text-zinc-600 text-sm">Your internal voice doesn't read every word at the same speed. Neither does this.</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  const sampleWords = SAMPLE_TEXT.replace(/\s+/g, ' ').trim().split(' ').filter(w => w.length > 0);
                  const paragraphs = SAMPLE_TEXT.split(/\n\n+/);
                  const paraStarts = new Set();
                  let idx = 0;
                  for (const para of paragraphs) {
                    const pw = para.replace(/\s+/g, ' ').trim().split(' ').filter(w => w.length > 0);
                    if (pw.length > 0) { paraStarts.add(idx); idx += pw.length; }
                  }
                  setParagraphStarts(paraStarts);
                  setWords(sampleWords);
                  setFileName('demo');
                  setRawText(SAMPLE_TEXT);
                  setChapters([]);
                  setCurrentIndex(0);
                  setIsPlaying(false);
                }}
                className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-500 rounded-xl transition-colors text-white font-medium"
              >
                <Zap className="w-4 h-4" />
                Try Demo
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors border border-zinc-700"
              >
                <Upload className="w-4 h-4 text-red-500" />
                <span className="text-white font-medium">Upload Book</span>
              </button>
            </div>
            <p className="text-zinc-600 text-xs">Supports .txt, .epub, .pdf</p>
          </div>
        )}
      </main>

      {showChapters && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowChapters(false)}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-lg w-full mx-4 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Chapters & Sections</h2>
              <button onClick={() => setShowChapters(false)} className="p-1 hover:bg-zinc-800 rounded">
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>
            
            <div className="overflow-y-auto flex-1 space-y-1">
              {chapters.map((chapter, idx) => {
                const nextChapter = chapters[idx + 1];
                const chapterEnd = nextChapter ? nextChapter.wordIndex : words.length;
                const chapterStart = chapter.wordIndex;
                const isActive = currentIndex >= chapterStart && currentIndex < chapterEnd;
                const isPast = currentIndex >= chapterEnd;
                const chapterProgress = isActive 
                  ? Math.round(((currentIndex - chapterStart) / (chapterEnd - chapterStart)) * 100)
                  : isPast ? 100 : 0;
                
                return (
                  <button
                    key={idx}
                    onClick={() => jumpToChapter(chapter)}
                    className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                      chapter.level === 0 ? 'mt-2' : ''
                    } ${
                      isActive 
                        ? 'bg-red-600/20 border border-red-600/50 text-white' 
                        : 'hover:bg-zinc-800 text-zinc-300'
                    }`}
                    style={{ paddingLeft: `${16 + (chapter.level || 0) * 12}px` }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-sm truncate ${chapter.level === 0 ? 'font-bold' : 'font-medium'}`}>
                        {chapter.title}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        {chapterProgress > 0 && (
                          <div className="w-12 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-red-500 transition-all"
                              style={{ width: `${chapterProgress}%` }}
                            />
                          </div>
                        )}
                        <span className="text-xs text-zinc-500 w-8 text-right">
                          {Math.round((chapter.wordIndex / words.length) * 100)}%
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            
            <div className="mt-4 pt-4 border-t border-zinc-800 text-center text-zinc-500 text-sm">
              Click a chapter to jump to it
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowSettings(false)}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-white mb-4">Settings</h2>
            
            <div className="space-y-4">
              <div>
                <label className="text-zinc-400 text-sm">Reading Speed (WPM)</label>
                <input
                  type="number"
                  min="100"
                  max="1500"
                  value={wpm}
                  onChange={(e) => setWpm(Number(e.target.value))}
                  className="w-full mt-1 px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                />
              </div>
              
              <div className="pt-4 border-t border-zinc-800">
                <h3 className="text-zinc-400 text-sm mb-2">Session Stats</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-zinc-800 rounded-lg p-3">
                    <div className="text-2xl font-bold text-white">{stats.wordsRead.toLocaleString()}</div>
                    <div className="text-zinc-500 text-sm">Words Read</div>
                  </div>
                  <div className="bg-zinc-800 rounded-lg p-3">
                    <div className="text-2xl font-bold text-white">{formatTime(stats.timeSpent)}</div>
                    <div className="text-zinc-500 text-sm">Time Spent</div>
                  </div>
                </div>
              </div>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-500 rounded-lg transition-colors text-white font-medium"
              >
                <Upload className="w-4 h-4" />
                Upload New Book
              </button>
            </div>
          </div>
        </div>
      )}

      {showFullPage && words.length > 0 && (() => {
        const currentChapterIdx = chapters.findIndex((ch, idx) => {
          const nextCh = chapters[idx + 1];
          const end = nextCh ? nextCh.wordIndex : words.length;
          return currentIndex >= ch.wordIndex && currentIndex < end;
        });
        const chapterStart = currentChapterIdx >= 0 ? chapters[currentChapterIdx].wordIndex : 0;
        const chapterEnd = currentChapterIdx >= 0 && chapters[currentChapterIdx + 1] 
          ? chapters[currentChapterIdx + 1].wordIndex 
          : words.length;
        const chapterTitle = currentChapterIdx >= 0 ? chapters[currentChapterIdx].title : 'Full Text';
        
        return (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-8">
            <div className="bg-zinc-900 border border-zinc-700 rounded-2xl max-w-3xl w-full max-h-[80vh] flex flex-col">
              <div className="flex justify-between items-center p-6 border-b border-zinc-700">
                <div>
                  <h2 className="text-xl font-semibold text-white">{chapterTitle}</h2>
                  <span className="text-xs text-zinc-500">
                    {(chapterEnd - chapterStart).toLocaleString()} words • {Math.round((currentIndex - chapterStart) / (chapterEnd - chapterStart) * 100)}% through
                  </span>
                </div>
                <button onClick={() => setShowFullPage(false)} className="p-2 hover:bg-zinc-800 rounded-lg">
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>
              <div className="overflow-auto p-6 flex-1">
                <div className="text-zinc-300 text-base leading-relaxed">
                  <div className="text-2xl font-bold text-white mb-6 pb-4 border-b border-zinc-700">
                    {chapterTitle}
                  </div>
                  {words.slice(chapterStart, currentIndex).map((w, i) => {
                    const globalIdx = chapterStart + i;
                    const isParagraphStart = paragraphStarts.has(globalIdx) && i > 0;
                    return (
                      <span key={i}>
                        {isParagraphStart && <span className="block h-4" />}
                        <span 
                          onClick={() => { setCurrentIndex(globalIdx); }}
                          className="text-zinc-500 hover:text-white hover:bg-zinc-700 cursor-pointer rounded px-0.5"
                        >{w} </span>
                      </span>
                    );
                  })}
                  {paragraphStarts.has(currentIndex) && currentIndex > chapterStart && <span className="block h-4" />}
                  <span 
                    ref={(el) => el?.scrollIntoView({ behavior: 'instant', block: 'center' })}
                    className="text-white font-bold bg-red-500/30 px-1 rounded border border-red-500"
                  >{currentWord}</span>{' '}
                  {words.slice(currentIndex + 1, chapterEnd).map((w, i) => {
                    const globalIdx = currentIndex + 1 + i;
                    const isParagraphStart = paragraphStarts.has(globalIdx);
                    return (
                      <span key={i}>
                        {isParagraphStart && <span className="block h-4" />}
                        <span 
                          onClick={() => { setCurrentIndex(globalIdx); }}
                          className="text-zinc-400 hover:text-white hover:bg-zinc-700 cursor-pointer rounded px-0.5"
                        >{w} </span>
                      </span>
                    );
                  })}
                </div>
              </div>
              <div className="p-4 border-t border-zinc-700 text-xs text-zinc-500 text-center">
                Click any word to jump there • Scroll to navigate • Press P to close
              </div>
            </div>
          </div>
        );
      })()}

      <footer className="p-4 border-t border-zinc-800 text-center text-zinc-600 text-sm flex flex-col gap-1">
        <div>Space: play/pause • ←/→: skip • ↑/↓: speed • B: flow • C: context • M: minimal • P: page</div>
        <div className="text-zinc-700 text-xs">Beta • <a href="https://forms.gle/placeholder" target="_blank" rel="noopener noreferrer" className="text-red-500/60 hover:text-red-400 underline">Send feedback</a></div>
      </footer>
    </div>
  );
}
