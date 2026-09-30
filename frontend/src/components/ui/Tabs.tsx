interface TabOption {
  value: string;
  label: string;
}

interface TabsProps {
  options: TabOption[];
  value: string;
  onChange: (value: string) => void;
}

export function Tabs({ options, value, onChange }: TabsProps) {
  return (
    <div className="inline-flex items-center bg-border/60 rounded-control p-1 gap-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3.5 py-1.5 rounded-[8px] text-sm font-medium transition-colors ${
            value === opt.value
              ? "bg-surface text-text shadow-soft"
              : "text-muted hover:text-text"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
