/*
LEEWAY HEADER — DO NOT REMOVE
REGION: VOICE.PLAYOUT.NORMALIZATION
TAG: SPOKEN_TEXT_FORMATTING_FILTER
WHO: LeeWay Industries; WHAT: speech-only text normalization;
WHY: prevent Kokoro vocalizing markdown markers, bullets and dashes;
WHERE: Voice Fabric synthesis handoff; WHEN: 2026-10-24;
HOW: non-destructive deterministic text transform;
AUTHORITY: playback only, not model text, instructions, or receipts.
LICENSE: existing LeeWay Voice Fabric repository terms.
*/
export function toSpokenText(input) {
  if (typeof input !== 'string') throw new TypeError('Spoken text must be a string.');
  return input
    .replace(/\r\n?/g, '\n')
    .replace(/\x60\x60\x60[^\n]*\n[\s\S]*?\x60\x60\x60/g, ' Code example omitted from speech. ')
    .replace(/\x60([^\x60]+)\x60/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*(?:[-*+•]|\d+[.)])\s+/gm, '')
    .replace(/^\s*(?:---+|___+|\*\*\*+)\s*$/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, '$1')
    .replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/[＊*•|#]+/g, ' ')
    .replace(/[—–]/g, ', ')
    .replace(/\s+,/g, ',')
    .replace(/(\w)\s+-\s+(\w)/g, '$1, $2')
    .replace(/(^|\s)[-]{2,}(?=\s|$)/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s*\n+\s*/g, '. ')
    .replace(/(?:\.\s*){2,}/g, '. ')
    .trim();
}
