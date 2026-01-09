import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FavoriteButtonProps {
  isFavorite: boolean;
  onToggle: () => void;
  className?: string;
}

export function FavoriteButton({ isFavorite, onToggle, className }: FavoriteButtonProps) {
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        'absolute top-2 right-2 p-1 rounded-full transition-all z-10',
        'hover:scale-110 active:scale-95',
        isFavorite 
          ? 'text-yellow-400 drop-shadow-lg' 
          : 'text-white/50 hover:text-white/80',
        className
      )}
    >
      <Star 
        className={cn('h-4 w-4', isFavorite && 'fill-yellow-400')} 
      />
    </button>
  );
}
