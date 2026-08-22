'use client';

import { useState, KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function TagInput({ value, onChange, placeholder = 'Ketik lalu tekan Enter...', className }: TagInputProps) {
  const [input, setInput] = useState('');

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const tag = input.trim();
      if (tag && !value.includes(tag)) {
        onChange([...value, tag]);
      }
      setInput('');
    } else if (e.key === 'Backspace' && !input && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  function remove(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-1.5 rounded-lg border border-input bg-transparent px-2.5 py-1.5 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50',
        className
      )}
    >
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent"
        >
          {tag}
          <button
            type="button"
            onClick={() => remove(tag)}
            className="rounded-full p-0.5 hover:bg-accent-soft/70"
            aria-label={`Remove ${tag}`}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={value.length === 0 ? placeholder : ''}
        className="min-w-[120px] flex-1 bg-transparent py-0.5 text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
