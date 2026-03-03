import { useRef, useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/cn";

interface Option<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
  id?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  id,
}: SegmentedControlProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Map<T, HTMLButtonElement>>(new Map());
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  const selectedIndex = options.findIndex((o) => o.value === value);

  const updateIndicator = useCallback(() => {
    const el = optionRefs.current.get(value);
    const container = containerRef.current;
    if (el && container) {
      const containerRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      setIndicator({
        left: elRect.left - containerRect.left,
        width: elRect.width,
      });
    }
  }, [value]);

  useEffect(() => {
    updateIndicator();
  }, [updateIndicator]);

  function handleKeyDown(e: React.KeyboardEvent) {
    let nextIndex = selectedIndex;

    switch (e.key) {
      case "ArrowRight":
        nextIndex = (selectedIndex + 1) % options.length;
        break;
      case "ArrowLeft":
        nextIndex = (selectedIndex - 1 + options.length) % options.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = options.length - 1;
        break;
      default:
        return;
    }

    e.preventDefault();
    const next = options[nextIndex];
    if (next) {
      onChange(next.value);
      optionRefs.current.get(next.value)?.focus();
    }
  }

  return (
    <div
      ref={containerRef}
      role="radiogroup"
      aria-label={ariaLabel}
      id={id}
      className="relative inline-flex items-center rounded-[var(--radius-md)] bg-[var(--color-surface-subtle)] p-0.5"
    >
      <div
        className="absolute top-0.5 bottom-0.5 rounded-[calc(var(--radius-md)-2px)] bg-[var(--color-page)] shadow-[var(--shadow-sm)]"
        style={{
          transform: `translateX(${indicator.left}px)`,
          width: `${indicator.width}px`,
          transition:
            "transform 280ms var(--ease-spring), width 280ms var(--ease-spring)",
        }}
      />
      {options.map((option) => (
        <button
          key={option.value}
          ref={(el) => {
            if (el) optionRefs.current.set(option.value, el);
          }}
          role="radio"
          aria-checked={option.value === value}
          tabIndex={option.value === value ? 0 : -1}
          onClick={() => onChange(option.value)}
          onKeyDown={handleKeyDown}
          className={cn(
            "relative z-10 h-9 cursor-pointer px-4 text-[length:var(--text-base)] transition-colors duration-150",
            option.value === value
              ? "font-semibold text-[var(--color-text-primary)]"
              : "text-[var(--color-text-secondary)]",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
