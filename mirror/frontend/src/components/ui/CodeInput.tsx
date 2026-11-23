import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react';

export interface CodeInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  invalid?: boolean;
}

/** One-time-code input rendered as a row of single-character cells. */
export function CodeInput({
  length = 6,
  value,
  onChange,
  autoFocus,
  invalid,
}: CodeInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  const focusAt = (index: number) => {
    const el = refs.current[index];
    el?.focus();
    el?.select();
  };

  const setChar = (index: number, char: string) => {
    const next = value.split('');
    next[index] = char;
    const joined = next.join('').slice(0, length);
    onChange(joined);
  };

  const handleChange = (index: number, raw: string) => {
    const char = raw.replace(/\D/g, '').slice(-1);
    if (!char) {
      setChar(index, '');
      return;
    }
    setChar(index, char);
    if (index < length - 1) focusAt(index + 1);
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !value[index] && index > 0) {
      focusAt(index - 1);
    }
    if (event.key === 'ArrowLeft' && index > 0) focusAt(index - 1);
    if (event.key === 'ArrowRight' && index < length - 1) focusAt(index + 1);
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (text) {
      onChange(text);
      focusAt(Math.min(text.length, length - 1));
    }
  };

  return (
    <div style={{ display: 'flex', gap: 'var(--sp-2)' }} dir="ltr">
      {Array.from({ length }).map((_, index) => (
        <input
          key={index}
          ref={(el) => {
            refs.current[index] = el;
          }}
          className="input"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          value={value[index] ?? ''}
          autoFocus={autoFocus && index === 0}
          aria-invalid={invalid || undefined}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={handlePaste}
          style={{
            width: 44,
            height: 52,
            textAlign: 'center',
            fontSize: '1.25rem',
            padding: 0,
          }}
        />
      ))}
    </div>
  );
}
