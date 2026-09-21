import { Input } from "@/components/ui/input";

// The filter box that sat inline (with an sr-only label) at the top of every
// list page. Wraps the Input primitive as a type="search" field with an
// accessible label.
export function SearchInput({
  id,
  label,
  placeholder,
  value,
  onChange,
  className,
}: {
  id: string;
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={className ?? "w-full max-w-sm"}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Input
        id={id}
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
