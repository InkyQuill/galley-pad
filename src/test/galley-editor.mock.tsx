export function GalleyEditor({
  value,
  onChange,
  toolbar = true,
}: {
  value: string;
  onChange: (content: string) => void;
  toolbar?: boolean | { icons?: Record<string, unknown> };
}) {
  const iconCount =
    typeof toolbar === "object" ? Object.keys(toolbar.icons ?? {}).length : 0;

  return (
    <>
      {toolbar ? (
        <div role="toolbar" aria-label="Mock Galley Toolbar">
          <span aria-label="Mock toolbar icon count">{iconCount}</span>
        </div>
      ) : null}
      <textarea
        aria-label="Mock Galley Editor"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </>
  );
}
