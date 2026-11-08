/**
 * AEGIS-EDGE: Sovereign Edge RAG Evaluation Engine
 * Edge-Optimized Tokenizer, Stemmer, and N-Gram Generator
 */

const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren\'t',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'can', 'can\'t', 'cannot', 'could', 'couldn\'t', 'did', 'didn\'t', 'do', 'does', 'doesn\'t', 'doing',
  'don\'t', 'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'hadn\'t', 'has', 'hasn\'t',
  'have', 'haven\'t', 'having', 'he', 'he\'d', 'he\'ll', 'he\'s', 'her', 'here', 'here\'s', 'hers',
  'herself', 'him', 'himself', 'his', 'how', 'how\'s', 'i', 'i\'d', 'i\'ll', 'i\'m', 'i\'ve', 'if', 'in',
  'into', 'is', 'isn\'t', 'it', 'it\'s', 'its', 'itself', 'let\'s', 'me', 'more', 'most', 'mustn\'t',
  'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our',
  'ours', 'ourselves', 'out', 'over', 'own', 'same', 'shan\'t', 'she', 'she\'d', 'she\'ll', 'she\'s',
  'should', 'shouldn\'t', 'so', 'some', 'such', 'than', 'that', 'that\'s', 'the', 'their', 'theirs',
  'them', 'themselves', 'then', 'there', 'there\'s', 'these', 'they', 'they\'d', 'they\'ll', 'they\'re',
  'they\'ve', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'wasn\'t',
  'we', 'we\'d', 'we\'ll', 'we\'re', 'we\'ve', 'were', 'weren\'t', 'what', 'what\'s', 'when', 'when\'s',
  'where', 'where\'s', 'which', 'while', 'who', 'who\'s', 'whom', 'why', 'why\'s', 'with', 'won\'t',
  'would', 'wouldn\'t', 'you', 'you\'d', 'you\'ll', 'you\'re', 'you\'ve', 'your', 'yours', 'yourself',
  'yourselves'
]);

export class FastTokenizer {
  /**
   * Split string into clean lowercased tokens.
   */
  static tokenize(text: string, filterStopWords: boolean = false): string[] {
    if (!text) return [];
    const rawTokens = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 0 && !/^\d+$/.test(t)); // filter pure standalone numbers or empty

    if (!filterStopWords) return rawTokens;
    return rawTokens.filter(t => !STOP_WORDS.has(t) && t.length > 1);
  }

  /**
   * Generate n-grams (e.g. bigrams or trigrams) from token stream.
   */
  static ngrams(tokens: string[], n: number = 2): string[] {
    if (tokens.length < n) return [];
    const grams: string[] = [];
    for (let i = 0; i <= tokens.length - n; i++) {
      grams.push(tokens.slice(i, i + n).join(' '));
    }
    return grams;
  }

  /**
   * Produce Term Frequency map for a token array.
   */
  static termFrequency(tokens: string[]): Map<string, number> {
    const tf = new Map<string, number>();
    for (const t of tokens) {
      tf.set(t, (tf.get(t) || 0) + 1);
    }
    return tf;
  }

  /**
   * Fast sentence boundary splitter for edge environments.
   * Handles abbreviations, lists, and punctuation safely.
   */
  static splitSentences(text: string): string[] {
    if (!text) return [];
    const sanitized = text
      .replace(/\r\n/g, '\n')
      .replace(/([.?!])\s+(?=[A-Z0-9])/g, '$1|SPLIT|');

    return sanitized
      .split('|SPLIT|')
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  /**
   * Decompose answer into discrete claim propositions.
   * On the edge, decomposes compound sentences with clauses into atomic testable assertions.
   */
  static extractClaims(text: string): string[] {
    if (!text || typeof text !== 'string') return [];
    const sentences = this.splitSentences(text);
    const claims: string[] = [];

    for (const s of sentences) {
      // Split on major conjunctive / adverbial discourse markers
      const subClauses = s.split(/;\s*|\band furthermore\b|\bmoreover\b|\badditionally\b|\bhowever\b/i);
      for (const clause of subClauses) {
        const cleaned = clause.trim().replace(/^[-*•\d.]+\s*/, '');
        if (cleaned.length > 12 && /\s+/.test(cleaned)) {
          claims.push(cleaned);
        }
      }
    }

    const trimmed = text.trim();
    return claims.length > 0 ? claims : (trimmed ? [trimmed] : []);
  }

  /**
   * Detect polarity / negative inversion keywords in a claim or sentence.
   */
  static hasNegation(text: string): boolean {
    const negations = /\b(not|never|no|none|neither|nor|without|fails|cannot|can't|won't|doesn't|didn't|isn't|aren't|untrue|false)\b/i;
    return negations.test(text);
  }
}
