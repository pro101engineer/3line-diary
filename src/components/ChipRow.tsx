import { ReactNode, useEffect, useRef } from 'react';

export interface ChipOption {
  key: string;
  label: string;
  color?: string;
  count?: number;
}

interface Props {
  options: ChipOption[];
  value: string;
  onChange: (key: string) => void;
  ariaLabel: string;
  /** 한 줄 가로 스크롤로 보여 준다 (주제가 많아도 높이가 늘지 않게). */
  scrollable?: boolean;
  /** 칩 줄 끝에 붙는 항목 (예: 주제 관리 링크) */
  children?: ReactNode;
}

export function ChipRow({ options, value, onChange, ariaLabel, scrollable, children }: Props) {
  const rowRef = useRef<HTMLDivElement>(null);

  // 가려진 곳에 있는 선택 칩이 보이도록 가운데로 가져온다. (페이지 스크롤은 건드리지 않는다.)
  useEffect(() => {
    const row = rowRef.current;
    if (!scrollable || !row || row.scrollWidth <= row.clientWidth) return;
    const active = row.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!active) return;
    row.scrollLeft = active.offsetLeft - (row.clientWidth - active.offsetWidth) / 2;
  }, [scrollable, value, options.length]);

  return (
    <div
      ref={rowRef}
      className={'chip-row' + (scrollable ? ' chip-row-scroll' : '')}
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          className={'chip' + (option.key === value ? ' chip-active' : '')}
          aria-pressed={option.key === value}
          onClick={() => onChange(option.key)}
        >
          {option.color && <i className="topic-dot" style={{ background: option.color }} />}
          {option.label}
          {option.count !== undefined && <span className="chip-count">{option.count}</span>}
        </button>
      ))}
      {children}
    </div>
  );
}
