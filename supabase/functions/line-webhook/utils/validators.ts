// =============================
// VALIDATION UTILITIES
// =============================

export function isValidURL(text: string): boolean {
  try {
    new URL(text);
    return true;
  } catch {
    return false;
  }
}

export function containsSuspiciousPatterns(text: string): boolean {
  const suspiciousPatterns = [
    /bit\.ly/i,
    /tinyurl/i,
    /(?:รับเงิน|โอนเงิน|กดรับ).*(?:ฟรี|ทันที|เลย)/i,
    /(?:free.*money|click.*here|urgent.*action)/i,
    /(?:bitcoin|btc|eth|usdt).*(?:giveaway|airdrop)/i,
  ];

  return suspiciousPatterns.some(pattern => pattern.test(text));
}

export function extractMentions(text: string): string[] {
  const mentionPattern = /@(\w+)/g;
  const mentions: string[] = [];
  let match;

  while ((match = mentionPattern.exec(text)) !== null) {
    mentions.push(match[1].toLowerCase());
  }

  return mentions;
}

export function extractKeywords(text: string, excludeWords: string[] = []): string[] {
  const words = text.toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 2 && !excludeWords.includes(word));

  return [...new Set(words)];
}
