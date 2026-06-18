export function GalleyEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (content: string) => void;
}) {
  return (
    <textarea
      aria-label="Mock Galley Editor"
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}
