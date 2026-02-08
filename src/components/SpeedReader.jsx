import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, Upload, Settings, BookOpen, Zap, List, X } from 'lucide-react';
import { calculateWordDelay, SAMPLE_TEXT } from '../utils/timing';
import { readEpub, readPdf, processText } from '../utils/fileParser';
import WordDisplay from './WordDisplay';
import ProgressBar from './ProgressBar';

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
    return calculateWordDelay(word, wpm, {
      isContextMode, speedMult, chunk, wordPosition,
      isFirstOfSentence, isAfterComma, wordsIntoSentence, nextWord
    });
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

    const { words: wordList, paragraphStarts: paraStarts, chapters: adjustedChapters } = processText(text, pdfOutline);
    
    setParagraphStarts(paraStarts);
    setWords(wordList);
    setRawText(text);
    setChapters(adjustedChapters);
    
    const bookKey = `speedreader_${file.name}`;
    const savedProgress = localStorage.getItem(bookKey);
    if (savedProgress) {
      const { index, wpm: savedWpm } = JSON.parse(savedProgress);
      if (index > 0 && index < wordList.length) {
        setCurrentIndex(index);
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
        return;
      }
    }
    
    setCurrentIndex(Math.min(chapter.wordIndex, words.length - 1));
    setShowChapters(false);
    setIsPlaying(false);
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
                  const { words: demoWords, paragraphStarts: paraStarts, chapters: demoChapters } = processText(SAMPLE_TEXT);
                  setParagraphStarts(paraStarts);
                  setWords(demoWords);
                  setFileName('demo');
                  setRawText(SAMPLE_TEXT);
                  setChapters(demoChapters);
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
