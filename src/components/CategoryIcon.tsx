import { Dumbbell, Flower2, Leaf, Scissors, Sparkles, Wind } from 'lucide-react';

export function CategoryIcon({ category, size = 16 }: { category: string; size?: number }) {
  const normalized = category.toLowerCase();
  if (normalized.includes('barber')) return <Scissors size={size} />;
  if (normalized.includes('nail')) return <Sparkles size={size} />;
  if (normalized.includes('fitness')) return <Dumbbell size={size} />;
  if (normalized.includes('hair')) return <Wind size={size} />;
  if (normalized.includes('wellness')) return <Flower2 size={size} />;
  if (normalized.includes('spa')) return <Leaf size={size} />;
  return <Sparkles size={size} />;
}
