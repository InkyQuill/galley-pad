export function focusForeground(color: string): "#000" | "#fff" {
  const hex = /^#([\da-f]{6})$/i.exec(color)?.[1];
  if (!hex) return "#000";

  const rgb = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const [red, green, blue] = rgb.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  );
  const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  return (luminance + 0.05) ** 2 >= 0.0525 ? "#000" : "#fff";
}
