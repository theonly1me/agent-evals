const decimalPlaces = 3;
const smallestShownPValue = 0.001;

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "not available";
  }

  const rounded = Number(value.toFixed(decimalPlaces));

  return Object.is(rounded, -0) ? "0" : String(rounded);
}

export function formatSigned(value: number): string {
  const text = formatNumber(value);

  return value > 0 && text !== "0" ? `+${text}` : text;
}

export function pValuePhrase(value: number): string {
  return value < smallestShownPValue ? `p < ${smallestShownPValue}` : `p = ${formatNumber(value)}`;
}
