import { getOptimalRecognitionPoint } from '../utils/timing';

export default function WordDisplay({ word }) {
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
        style={{ fontFamily: "'Lexend', sans-serif", transform: `translateX(${offset * 0.4}ch)`, letterSpacing: '0.04em', fontWeight: 600 }}
      >
        <span className="text-white">{before}</span>
        <span className="text-red-500 font-bold">{focal}</span>
        <span className="text-white">{after}</span>
      </div>
    </div>
  );
}
