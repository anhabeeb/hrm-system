const assertMinorUnitInteger = (value: number): void => {
  if (!Number.isInteger(value)) {
    throw new Error("Money values must be stored as integer minor units.");
  }
};

export const toMinorUnits = (value: string | number, scale = 2): number => {
  const normalized = String(value).replace(/,/g, "").trim();
  const amountPattern = new RegExp(`^-?\\d+(?:\\.\\d{1,${scale}})?$`);

  if (!amountPattern.test(normalized)) {
    throw new Error("Money amount is not valid.");
  }

  const negative = normalized.startsWith("-");
  const unsignedValue = negative ? normalized.slice(1) : normalized;
  const [wholePart, fractionPart = ""] = unsignedValue.split(".");
  const paddedFraction = fractionPart.padEnd(scale, "0");
  const scaleFactor = 10n ** BigInt(scale);

  const result =
    BigInt(wholePart || "0") * scaleFactor + BigInt(paddedFraction || "0");
  const signedResult = negative ? -result : result;

  if (
    signedResult > BigInt(Number.MAX_SAFE_INTEGER) ||
    signedResult < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new Error("Money amount is too large to process safely.");
  }

  return Number(signedResult);
};

export const formatMinorUnits = (
  value: number,
  currency = "MVR",
  scale = 2,
  locale = "en-US",
): string => {
  assertMinorUnitInteger(value);

  const sign = value < 0 ? "-" : "";
  const absoluteValue = Math.abs(value);
  const scaleFactor = 10 ** scale;
  const wholePart = Math.trunc(absoluteValue / scaleFactor);
  const fractionPart = String(absoluteValue % scaleFactor).padStart(scale, "0");

  return `${sign}${currency} ${wholePart.toLocaleString(locale)}.${fractionPart}`;
};

export const addMinorUnits = (...values: number[]): number => {
  values.forEach(assertMinorUnitInteger);
  return values.reduce((total, current) => total + current, 0);
};
