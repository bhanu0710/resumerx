import { customAlphabet } from 'nanoid';

// no ambiguous characters (0/O, I/l, 1) — these show up in URLs
const alphabet = '23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';

export const resumeId = customAlphabet(alphabet, 16);
export const analysisId = customAlphabet(alphabet, 16);
export const rewriteId = customAlphabet(alphabet, 16);
export const bulletId = customAlphabet(alphabet, 10);
export const experienceId = customAlphabet(alphabet, 10);
export const projectId = customAlphabet(alphabet, 10);
