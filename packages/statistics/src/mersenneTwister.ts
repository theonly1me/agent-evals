const stateSize = 624;
const shiftSize = 397;
const upperMask = 0x80000000;
const lowerMask = 0x7fffffff;
const twistConstant = 0x9908b0df;
const wordModulus = 2 ** 32;

export type PythonRandom = {
  readonly random: () => number;
  readonly choice: <Value>(values: readonly Value[]) => Value;
};

function wordAt(options: { words: Uint32Array; index: number }): number {
  return options.words[options.index] ?? 0;
}

function seedWords(seed: number): number[] {
  if (!Number.isSafeInteger(seed)) {
    throw new Error(`The seed must be a safe integer, received ${seed}.`);
  }
  const words: number[] = [];
  let remaining = Math.abs(seed);
  do {
    words.push(remaining % wordModulus);
    remaining = Math.floor(remaining / wordModulus);
  } while (remaining > 0);
  return words;
}

function mix(options: { words: Uint32Array; index: number; multiplier: number }): number {
  const previous = wordAt({ words: options.words, index: options.index - 1 });
  const current = wordAt(options);
  return current ^ Math.imul(previous ^ (previous >>> 30), options.multiplier);
}

function initialState(seed: number): Uint32Array {
  const key = seedWords(seed);
  const words = new Uint32Array(stateSize);
  words[0] = 19650218;
  for (let index = 1; index < stateSize; index += 1) {
    const previous = wordAt({ words, index: index - 1 });
    words[index] = Math.imul(1812433253, previous ^ (previous >>> 30)) + index;
  }
  let index = 1;
  let keyIndex = 0;
  const advance = () => {
    index += 1;
    if (index >= stateSize) {
      words[0] = wordAt({ words, index: stateSize - 1 });
      index = 1;
    }
  };
  for (let round = Math.max(stateSize, key.length); round > 0; round -= 1) {
    words[index] = mix({ words, index, multiplier: 1664525 }) + (key[keyIndex] ?? 0) + keyIndex;
    keyIndex = (keyIndex + 1) % key.length;
    advance();
  }
  for (let round = stateSize - 1; round > 0; round -= 1) {
    words[index] = mix({ words, index, multiplier: 1566083941 }) - index;
    advance();
  }
  words[0] = upperMask;
  return words;
}

function twist(words: Uint32Array): void {
  for (let index = 0; index < stateSize; index += 1) {
    const joined =
      (wordAt({ words, index }) & upperMask) |
      (wordAt({ words, index: (index + 1) % stateSize }) & lowerMask);
    const shifted = wordAt({ words, index: (index + shiftSize) % stateSize });
    words[index] = shifted ^ (joined >>> 1) ^ (joined & 1 ? twistConstant : 0);
  }
}

function temper(word: number): number {
  let tempered = word;
  tempered ^= tempered >>> 11;
  tempered ^= (tempered << 7) & 0x9d2c5680;
  tempered ^= (tempered << 15) & 0xefc60000;
  tempered ^= tempered >>> 18;
  return tempered >>> 0;
}

export function createPythonRandom(seed: number): PythonRandom {
  const words = initialState(seed);
  let position = stateSize;
  const nextWord = () => {
    if (position >= stateSize) {
      twist(words);
      position = 0;
    }
    const word = wordAt({ words, index: position });
    position += 1;
    return temper(word);
  };
  const random = () => {
    const high = nextWord() >>> 5;
    const low = nextWord() >>> 6;
    return (high * 67108864 + low) / 9007199254740992;
  };
  const choice = <Value>(values: readonly Value[]): Value => {
    const value = values[Math.floor(random() * values.length)];
    if (value === undefined) {
      throw new Error("Cannot choose from an empty list.");
    }
    return value;
  };
  return { random, choice };
}
