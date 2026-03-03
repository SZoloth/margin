import { cn } from "@/lib/cn";

interface SettingsCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}

export function SettingsCard({ children, className, ...props }: SettingsCardProps) {
  return (
    <div className={cn("rounded-xl bg-[var(--color-sidebar)] p-6", className)} {...props}>
      {children}
    </div>
  );
}
