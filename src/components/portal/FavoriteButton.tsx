import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FavoriteButtonProps {
  isFavorite: boolean;
  onToggle: (e: React.MouseEvent) => void;
  className?: string;
}

export function FavoriteButton({ isFavorite, onToggle, className }: FavoriteButtonProps) {
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle(e);
      }}
      className={cn(
        'absolute top-2 right-2 p-1.5 rounded-full transition-all z-10',
        'hover:scale-110 active:scale-95',
        'bg-white/90 shadow-sm backdrop-blur-sm',
        isFavorite 
          ? 'text-yellow-500 ring-1 ring-yellow-400/50' 
          : 'text-gray-400 hover:text-gray-600',
        className
      )}
    >
      <Star 
        className={cn('h-4 w-4', isFavorite && 'fill-yellow-500')} 
      />
    </button>
  );
}
