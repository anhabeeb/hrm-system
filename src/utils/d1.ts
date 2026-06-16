export const MAX_D1_BINDINGS = 50;

export const chunkArray = <T>(items: readonly T[], size = MAX_D1_BINDINGS): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};
