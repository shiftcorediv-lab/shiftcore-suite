export function createResponseGeneration() {
  let current = 0;
  return Object.freeze({
    begin() {
      current += 1;
      return current;
    },
    isCurrent(generation) {
      return generation === current;
    },
    invalidate() {
      current += 1;
    }
  });
}
