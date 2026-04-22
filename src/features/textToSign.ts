/**
 * TextToSign — Convert written text to sign language avatar animations
 * supporting ASL, BSL, and other sign languages.
 */

import { z } from 'zod';

export const SignAnimationSchema = z.object({
  id: z.string().uuid(),
  inputText: z.string(), targetLanguage: z.string(),
  glossSequence: z.array(z.string()),
  animations: z.array(z.object({
    gloss: z.string(), durationMs: z.number().positive(),
    handshapeRight: z.string().optional(), handshapeLeft: z.string().optional(),
    movement: z.string(), location: z.string(),
    nonManualMarkers: z.array(z.string()),
  })),
  totalDurationMs: z.number(),
  avatarStyle: z.enum(['realistic', 'stylized', 'minimal']),
});

export const GlossaryEntrySchema = z.object({
  english: z.string(), gloss: z.string(), language: z.string(),
  partOfSpeech: z.enum(['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'conjunction', 'classifier', 'fingerspell']),
  animationId: z.string().optional(),
  videoUrl: z.string().url().optional(),
  notes: z.string().optional(),
});

export const AccessibilityContextSchema = z.object({
  context: z.enum(['medical', 'legal', 'education', 'emergency', 'daily_conversation', 'workplace', 'government']),
  formality: z.enum(['formal', 'informal', 'technical']),
  audience: z.enum(['adult', 'child', 'mixed']),
  includeFingerSpelling: z.boolean().default(true),
});

export type SignAnimation = z.infer<typeof SignAnimationSchema>;
export type GlossaryEntry = z.infer<typeof GlossaryEntrySchema>;
export type AccessibilityContext = z.infer<typeof AccessibilityContextSchema>;

// English-to-ASL gloss conversion rules (simplified)
const ENGLISH_TO_ASL_GLOSS: Record<string, string> = {
  'hello': 'HELLO', 'goodbye': 'GOODBYE', 'thank you': 'THANK-YOU', 'please': 'PLEASE',
  'yes': 'YES', 'no': 'NO', 'help': 'HELP', 'water': 'WATER', 'food': 'FOOD',
  'doctor': 'DOCTOR', 'hospital': 'HOSPITAL', 'pain': 'PAIN', 'medicine': 'MEDICINE',
  'emergency': 'EMERGENCY', 'police': 'POLICE', 'fire': 'FIRE',
  'name': 'NAME', 'what': 'WHAT', 'where': 'WHERE', 'when': 'WHEN', 'why': 'WHY', 'how': 'HOW',
  'i': 'IX-1', 'you': 'IX-2', 'he': 'IX-3', 'she': 'IX-3', 'they': 'IX-3-PLURAL',
  'need': 'NEED', 'want': 'WANT', 'can': 'CAN', 'understand': 'UNDERSTAND',
};

// ASL uses Topic-Comment structure, not English SVO
const WORD_ORDER_RULES = {
  question_wh: 'WH-word moves to end: "What is your name?" -> "YOUR NAME WHAT?"',
  question_yn: 'Eyebrow raise for yes/no: "Are you okay?" -> "YOU OKAY?" (eyebrow raise)',
  negation: 'Headshake with negative: "I don\'t understand" -> "UNDERSTAND NOT" (headshake)',
  time_first: 'Time marker comes first: "Yesterday I went" -> "YESTERDAY IX-1 GO"',
};

export function englishToGloss(text: string, context?: AccessibilityContext): string[] {
  const words = text.toLowerCase().replace(/[.,!?;:]/g, '').split(/\s+/);
  const glosses: string[] = [];

  let i = 0;
  while (i < words.length) {
    // Check two-word phrases first
    if (i < words.length - 1) {
      const phrase = `${words[i]} ${words[i + 1]}`;
      if (ENGLISH_TO_ASL_GLOSS[phrase]) {
        glosses.push(ENGLISH_TO_ASL_GLOSS[phrase]);
        i += 2;
        continue;
      }
    }

    const word = words[i];
    if (ENGLISH_TO_ASL_GLOSS[word]) {
      glosses.push(ENGLISH_TO_ASL_GLOSS[word]);
    } else {
      // Fingerspell unknown words
      glosses.push(`#${word.toUpperCase()}`);
    }
    i++;
  }

  return glosses;
}

export function generateSignAnimation(
  text: string,
  language: string = 'ASL',
  style: SignAnimation['avatarStyle'] = 'stylized'
): SignAnimation {
  const glosses = englishToGloss(text);

  const animations = glosses.map(gloss => ({
    gloss,
    durationMs: gloss.startsWith('#') ? gloss.length * 300 : 800, // Fingerspelling is slower
    movement: 'neutral_space',
    location: 'chest_level',
    nonManualMarkers: [] as string[],
  }));

  const totalDuration = animations.reduce((s, a) => s + a.durationMs, 0);

  return {
    id: crypto.randomUUID(), inputText: text, targetLanguage: language,
    glossSequence: glosses, animations, totalDurationMs: totalDuration, avatarStyle: style,
  };
}

export function generateEmergencyPhrases(language: string = 'ASL'): Array<{ english: string; gloss: string[]; priority: number }> {
  return [
    { english: 'I need help', gloss: ['IX-1', 'NEED', 'HELP'], priority: 1 },
    { english: 'Call 911', gloss: ['CALL', '#911'], priority: 1 },
    { english: 'I am deaf', gloss: ['IX-1', 'DEAF'], priority: 1 },
    { english: 'I need an interpreter', gloss: ['IX-1', 'NEED', 'INTERPRETER'], priority: 1 },
    { english: 'Where is the hospital?', gloss: ['HOSPITAL', 'WHERE'], priority: 2 },
    { english: 'I have pain here', gloss: ['PAIN', 'HERE'], priority: 2 },
    { english: 'I am allergic to', gloss: ['IX-1', 'ALLERGIC'], priority: 2 },
    { english: 'I take medicine', gloss: ['IX-1', 'MEDICINE', 'TAKE'], priority: 3 },
    { english: 'My name is', gloss: ['IX-1', 'NAME'], priority: 3 },
    { english: 'I do not understand', gloss: ['UNDERSTAND', 'NOT'], priority: 2 },
  ];
}
