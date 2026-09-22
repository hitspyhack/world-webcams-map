'use client';

import { useState, useRef, useEffect, useMemo } from 'react';

export interface CountryEntry {
  code: string;   // ISO-3166-1 alpha-2 or best-guess
  name: string;   // display name
  lat:  number;
  lon:  number;
  count: number;  // total cams for this country
}

interface Props {
  countries: CountryEntry[];
  selected: CountryEntry | null;
  onSelect: (c: CountryEntry | null) => void;
}

export default function CountrySearch({ countries, selected, onSelect }: Props) {
  const [query, setQuery]       = useState(selected?.name ?? '');
  const [open,  setOpen]        = useState(false);
  const [cursor, setCursor]     = useState(-1);
  const inputRef  = useRef<HTMLInputElement>(null);
  const listRef   = useRef<HTMLUListElement>(null);
  const wrapRef   = useRef<HTMLDivElement>(null);

  // Keep input text in sync when external selection changes
  useEffect(() => { setQuery(selected?.name ?? ''); }, [selected]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return countries.slice(0, 60);
    const q = query.toLowerCase();
    return countries.filter(c =>
      c.name.toLowerCase().includes(q) || c.code.toLowerCase().startsWith(q)
    ).slice(0, 60);
  }, [query, countries]);

  const handleSelect = (c: CountryEntry) => {
    setQuery(c.name);
    setOpen(false);
    setCursor(-1);
    onSelect(c);
  };

  const handleClear = () => {
    setQuery('');
    setOpen(false);
    onSelect(null);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor(c => Math.min(c + 1, filtered.length - 1));
      setOpen(true);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor(c => Math.max(c - 1, 0));
    } else if (e.key === 'Enter' && cursor >= 0 && filtered[cursor]) {
      handleSelect(filtered[cursor]);
    } else if (e.key === 'Escape') {
      if (open) { setOpen(false); }
      else { handleClear(); }
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (cursor >= 0 && listRef.current) {
      const el = listRef.current.children[cursor] as HTMLElement | undefined;
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [cursor]);

  return (
    <div
      ref={wrapRef}
      style={{
        position: 'fixed', top: 14, left: '50%', transform: 'translateX(-50%)',
        zIndex: 3000, width: 320, maxWidth: 'calc(100vw - 160px)',
        fontFamily: 'system-ui, monospace',
      }}
    >
      {/* Input row */}
      <div style={{
        display: 'flex', alignItems: 'center',
        background: 'rgba(13,17,23,0.97)',
        border: `1px solid ${selected ? 'rgba(88,166,255,0.5)' : '#30363d'}`,
        borderRadius: open && filtered.length > 0 ? '9px 9px 0 0' : 9,
        boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
        overflow: 'hidden',
        transition: 'border-color 0.15s',
      }}>
        <span style={{ padding: '0 10px', color: '#8b949e', fontSize: 14, flexShrink: 0 }}>🔍</span>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search country…"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); setCursor(-1); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          aria-label="Search country"
          aria-autocomplete="list"
          aria-expanded={open}
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            color: '#e6edf3', fontSize: 13, padding: '9px 0',
            letterSpacing: '0.02em',
          }}
        />
        {(query || selected) && (
          <button
            onClick={handleClear}
            aria-label="Clear filter"
            style={{
              background: 'none', border: 'none', color: '#8b949e',
              fontSize: 15, padding: '0 10px', cursor: 'pointer',
              lineHeight: 1, flexShrink: 0,
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
            onMouseLeave={e => (e.currentTarget.style.color = '#8b949e')}
          >✕</button>
        )}
      </div>

      {/* Dropdown */}
      {open && filtered.length > 0 && (
        <ul
          ref={listRef}
          role="listbox"
          aria-label="Country suggestions"
          style={{
            listStyle: 'none', margin: 0, padding: '4px 0',
            background: 'rgba(13,17,23,0.98)',
            border: '1px solid #30363d', borderTop: 'none',
            borderRadius: '0 0 9px 9px',
            maxHeight: 260, overflowY: 'auto',
            boxShadow: '0 8px 24px rgba(0,0,0,0.7)',
          }}
        >
          {filtered.map((c, i) => (
            <li
              key={c.code}
              role="option"
              aria-selected={i === cursor}
              onClick={() => handleSelect(c)}
              style={{
                display: 'flex', alignItems: 'center',
                padding: '7px 14px', cursor: 'pointer',
                background: i === cursor ? 'rgba(88,166,255,0.12)' : 'transparent',
                color: i === cursor ? '#79c0ff' : '#e6edf3',
                fontSize: 13, gap: 10,
                transition: 'background 0.1s',
              }}
              onMouseEnter={() => setCursor(i)}
            >
              <span style={{
                fontSize: 10, fontFamily: 'monospace', fontWeight: 700,
                color: '#484f58', minWidth: 24, letterSpacing: '0.05em',
              }}>{c.code}</span>
              <span style={{ flex: 1 }}>{c.name}</span>
              <span style={{
                fontSize: 10, color: '#484f58',
                background: 'rgba(48,54,61,0.6)',
                borderRadius: 4, padding: '1px 5px',
              }}>{c.count}</span>
            </li>
          ))}
        </ul>
      )}

      {open && query.trim() && filtered.length === 0 && (
        <div style={{
          background: 'rgba(13,17,23,0.98)',
          border: '1px solid #30363d', borderTop: 'none',
          borderRadius: '0 0 9px 9px',
          padding: '12px 14px', fontSize: 12, color: '#8b949e',
          boxShadow: '0 8px 24px rgba(0,0,0,0.7)',
        }}>No countries found for "{query}"</div>
      )}
    </div>
  );
}
