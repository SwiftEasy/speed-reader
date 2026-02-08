export default function ProgressBar({ current, total, onSeek }) {
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
