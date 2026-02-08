export function detectChapters(text, pdfOutline = null) {
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

export async function readEpub(file) {
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
}

export async function readPdf(file) {
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
}

/**
 * Process raw text into word list with paragraph tracking.
 * Returns { words, paragraphStarts, chapters }
 */
export function processText(rawText, pdfOutline = []) {
  const cleanedText = rawText
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

  const detectedChapters = detectChapters(rawText, pdfOutline);

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

  const ratio = wordList.length / Math.max(1, rawText.split(/\s+/).length);
  const adjustedChapters = detectedChapters.map(ch => {
    const estimated = Math.floor(ch.wordIndex * ratio);
    const found = findChapterInWordList(ch.title, estimated);
    return { ...ch, wordIndex: found };
  }).sort((a, b) => a.wordIndex - b.wordIndex);

  return {
    words: wordList.length > 0 ? wordList : ['No', 'text', 'found', 'in', 'file.', 'Try', 'a', 'different', 'file.'],
    paragraphStarts: paraStarts,
    chapters: adjustedChapters
  };
}
