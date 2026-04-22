/**
 * SignRecognition — Real-time sign language recognition engine
 * with hand landmark detection, gesture classification, and sentence assembly.
 */

import { z } from 'zod';

export const HandLandmarkSchema = z.object({
  frameId: z.number().int(), timestamp: z.number(),
  landmarks: z.array(z.object({ id: z.number().int(), x: z.number(), y: z.number(), z: z.number(), visibility: z.number().min(0).max(1) })),
  handedness: z.enum(['left', 'right']),
  confidence: z.number().min(0).max(1),
});

export const SignGestureSchema = z.object({
  id: z.string(), gloss: z.string(),
  language: z.enum(['ASL', 'BSL', 'LSF', 'DGS', 'JSL', 'Auslan', 'ISL', 'CSL']),
  category: z.enum(['letter', 'number', 'word', 'phrase', 'classifier', 'fingerspelling']),
  confidence: z.number().min(0).max(1),
  startFrame: z.number().int(), endFrame: z.number().int(),
  duration: z.number().positive(),
  dominantHand: z.enum(['left', 'right', 'both']),
  nonManualMarkers: z.array(z.enum(['eyebrow_raise', 'eyebrow_furrow', 'head_nod', 'head_shake', 'mouth_morpheme', 'eye_gaze_shift', 'body_lean', 'shoulder_raise'])).optional(),
});

export const TranslationResultSchema = z.object({
  sessionId: z.string().uuid(),
  timestamp: z.string().datetime(),
  sourceLanguage: z.string(),
  targetLanguage: z.string(),
  gestures: z.array(SignGestureSchema),
  assembledText: z.string(),
  confidence: z.number().min(0).max(1),
  alternatives: z.array(z.object({ text: z.string(), confidence: z.number() })),
  processingLatencyMs: z.number(),
});

export const ConversationSessionSchema = z.object({
  sessionId: z.string().uuid(),
  startedAt: z.string().datetime(),
  participants: z.array(z.object({ id: z.string(), role: z.enum(['signer', 'speaker', 'interpreter']), language: z.string() })),
  messages: z.array(z.object({
    participantId: z.string(), timestamp: z.string().datetime(),
    content: z.string(), type: z.enum(['sign_to_text', 'text_to_sign', 'voice_to_text']),
    confidence: z.number().min(0).max(1),
  })),
  durationSeconds: z.number(),
});

export type HandLandmark = z.infer<typeof HandLandmarkSchema>;
export type SignGesture = z.infer<typeof SignGestureSchema>;
export type TranslationResult = z.infer<typeof TranslationResultSchema>;
export type ConversationSession = z.infer<typeof ConversationSessionSchema>;

// ASL fingerspelling landmark patterns (simplified representation)
const ASL_HANDSHAPES: Record<string, { fingers_extended: number[]; thumb_position: string }> = {
  'A': { fingers_extended: [], thumb_position: 'across' },
  'B': { fingers_extended: [1, 2, 3, 4], thumb_position: 'tucked' },
  'C': { fingers_extended: [1, 2, 3, 4], thumb_position: 'curved' },
  'D': { fingers_extended: [1], thumb_position: 'touching_middle' },
  'L': { fingers_extended: [1], thumb_position: 'extended_perpendicular' },
  'O': { fingers_extended: [], thumb_position: 'touching_fingers' },
  'V': { fingers_extended: [1, 2], thumb_position: 'tucked' },
  'W': { fingers_extended: [1, 2, 3], thumb_position: 'tucked' },
  'Y': { fingers_extended: [4], thumb_position: 'extended' },
};

export function extractHandFeatures(landmarks: HandLandmark['landmarks']): {
  fingersExtended: boolean[];
  palmDirection: 'forward' | 'backward' | 'up' | 'down' | 'left' | 'right';
  wristAngle: number;
} {
  if (landmarks.length < 21) {
    return { fingersExtended: [false, false, false, false, false], palmDirection: 'forward', wristAngle: 0 };
  }

  // Simplified finger extension detection using tip vs PIP joint y-coordinate
  const fingersExtended = [
    landmarks[4].y < landmarks[3].y, // Thumb
    landmarks[8].y < landmarks[6].y, // Index
    landmarks[12].y < landmarks[10].y, // Middle
    landmarks[16].y < landmarks[14].y, // Ring
    landmarks[20].y < landmarks[18].y, // Pinky
  ];

  // Palm direction from normal vector (simplified)
  const palmX = landmarks[9].x - landmarks[0].x;
  const palmY = landmarks[9].y - landmarks[0].y;
  const palmDirection = Math.abs(palmX) > Math.abs(palmY)
    ? (palmX > 0 ? 'right' : 'left') as const
    : (palmY > 0 ? 'down' : 'up') as const;

  // Wrist angle
  const dx = landmarks[9].x - landmarks[0].x;
  const dy = landmarks[9].y - landmarks[0].y;
  const wristAngle = Math.atan2(dy, dx) * 180 / Math.PI;

  return { fingersExtended, palmDirection, wristAngle };
}

export function classifyGesture(
  frames: HandLandmark[],
  language: SignGesture['language'] = 'ASL'
): SignGesture | null {
  if (frames.length === 0) return null;

  const features = frames.map(f => extractHandFeatures(f.landmarks));
  const avgExtended = [0, 1, 2, 3, 4].map(i =>
    features.filter(f => f.fingersExtended[i]).length / features.length > 0.5
  );

  const extendedCount = avgExtended.filter(Boolean).length;

  // Very simplified classification for demonstration
  let gloss = 'UNKNOWN';
  let category: SignGesture['category'] = 'word';

  if (extendedCount === 0) { gloss = 'S'; category = 'letter'; }
  else if (extendedCount === 1 && avgExtended[1]) { gloss = 'D'; category = 'letter'; }
  else if (extendedCount === 2 && avgExtended[1] && avgExtended[2]) { gloss = 'V'; category = 'letter'; }
  else if (extendedCount === 5) { gloss = 'OPEN-HAND'; category = 'classifier'; }

  const avgConfidence = frames.reduce((s, f) => s + f.confidence, 0) / frames.length;

  return {
    id: crypto.randomUUID(), gloss, language, category,
    confidence: Math.round(avgConfidence * 100) / 100,
    startFrame: frames[0].frameId, endFrame: frames[frames.length - 1].frameId,
    duration: (frames[frames.length - 1].timestamp - frames[0].timestamp) / 1000,
    dominantHand: frames[0].handedness === 'right' ? 'right' : 'left',
  };
}

export function assembleTranslation(
  gestures: SignGesture[],
  targetLanguage: string = 'en'
): TranslationResult {
  const text = gestures.map(g => g.gloss).join(' ');
  const avgConfidence = gestures.reduce((s, g) => s + g.confidence, 0) / (gestures.length || 1);

  return {
    sessionId: crypto.randomUUID(), timestamp: new Date().toISOString(),
    sourceLanguage: gestures[0]?.language ?? 'ASL', targetLanguage,
    gestures, assembledText: text,
    confidence: Math.round(avgConfidence * 100) / 100,
    alternatives: [], processingLatencyMs: 0,
  };
}
