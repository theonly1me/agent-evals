export const textRules = [
  {
    pattern: /\u2014/,
    rule: "no-em-dash",
    message: "em dash, recast with plain punctuation",
  },
  {
    pattern: /\u2013/,
    rule: "no-en-dash",
    message: 'en dash, write "to" for a range or recast the sentence',
  },
  {
    pattern: /\/(Users|home)\/[a-z][a-z0-9_-]*\//,
    rule: "no-machine-path",
    message: "machine path, use a relative path or a placeholder",
  },
] as const;
