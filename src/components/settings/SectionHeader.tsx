interface SectionHeaderProps {
  title: string;
  id?: string;
}

export function SectionHeader({ title, id }: SectionHeaderProps) {
  return (
    <h3
      id={id}
      className="text-[length:11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-secondary)]"
    >
      {title}
    </h3>
  );
}
