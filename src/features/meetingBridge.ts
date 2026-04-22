/**
 * MeetingBridge — Real-time meeting accessibility for deaf/HoH participants
 * with live captions, sign language overlay, and speaker identification.
 */

import { z } from 'zod';

export const MeetingConfigSchema = z.object({
  meetingId: z.string().uuid(),
  platform: z.enum(['zoom', 'teams', 'meet', 'webex', 'standalone']),
  participants: z.array(z.object({
    id: z.string(), name: z.string(),
    communicationMode: z.enum(['hearing', 'deaf_sign', 'deaf_oral', 'hard_of_hearing', 'deafblind']),
    preferredLanguage: z.string(),
    signLanguage: z.string().optional(),
    needsCaptions: z.boolean(), needsSignInterpreter: z.boolean(),
    needsTranscript: z.boolean(),
  })),
  settings: z.object({
    autoCaption: z.boolean().default(true),
    signOverlay: z.boolean().default(false),
    speakerIdentification: z.boolean().default(true),
    transcriptLanguage: z.string().default('en'),
    captionFontSize: z.enum(['small', 'medium', 'large', 'x-large']).default('medium'),
    highContrastCaptions: z.boolean().default(false),
  }),
});

export const LiveCaptionSchema = z.object({
  meetingId: z.string().uuid(), timestamp: z.string().datetime(),
  speakerId: z.string(), speakerName: z.string(),
  text: z.string(), isFinal: z.boolean(),
  language: z.string(), confidence: z.number().min(0).max(1),
});

export const MeetingTranscriptSchema = z.object({
  meetingId: z.string().uuid(), generatedAt: z.string().datetime(),
  duration: z.number().positive(),
  entries: z.array(z.object({
    timestamp: z.string(), speakerName: z.string(),
    text: z.string(), type: z.enum(['speech', 'sign_translation', 'system']),
  })),
  summary: z.string().optional(),
  actionItems: z.array(z.object({ item: z.string(), assignee: z.string().optional(), deadline: z.string().optional() })).optional(),
  accessibilityScore: z.number().min(0).max(100),
});

export type MeetingConfig = z.infer<typeof MeetingConfigSchema>;
export type LiveCaption = z.infer<typeof LiveCaptionSchema>;
export type MeetingTranscript = z.infer<typeof MeetingTranscriptSchema>;

export function assessMeetingAccessibility(config: MeetingConfig): {
  score: number;
  issues: string[];
  recommendations: string[];
} {
  let score = 50;
  const issues: string[] = [];
  const recommendations: string[] = [];

  const deafParticipants = config.participants.filter(p => p.communicationMode.startsWith('deaf') || p.communicationMode === 'hard_of_hearing');

  if (deafParticipants.length > 0) {
    if (config.settings.autoCaption) score += 15;
    else { issues.push('Auto-captions disabled with deaf/HoH participants'); recommendations.push('Enable auto-captions'); }

    if (deafParticipants.some(p => p.needsSignInterpreter) && !config.settings.signOverlay) {
      issues.push('Sign interpreter needed but sign overlay not enabled');
      recommendations.push('Enable sign language overlay or provide interpreter feed');
    }

    if (config.settings.speakerIdentification) score += 10;
    else { issues.push('Speaker identification disabled — deaf participants cannot identify who is speaking'); recommendations.push('Enable speaker identification'); }

    if (config.settings.highContrastCaptions) score += 5;
    if (config.settings.captionFontSize === 'large' || config.settings.captionFontSize === 'x-large') score += 5;

    const deafblind = deafParticipants.filter(p => p.communicationMode === 'deafblind');
    if (deafblind.length > 0) {
      recommendations.push('Deafblind participant(s) present — ensure braille display support or SSP interpreter');
      if (config.settings.captionFontSize === 'small') { issues.push('Small caption font with HoH/deafblind participant'); }
    }

    if (deafParticipants.every(p => p.needsTranscript)) score += 10;
    else recommendations.push('Enable transcript for post-meeting review');
  } else {
    score = 80;
  }

  return { score: Math.min(100, score), issues, recommendations };
}

export function generateTranscript(
  captions: LiveCaption[],
  meetingDuration: number
): MeetingTranscript {
  const finalCaptions = captions.filter(c => c.isFinal);
  const entries = finalCaptions.map(c => ({
    timestamp: c.timestamp, speakerName: c.speakerName,
    text: c.text, type: 'speech' as const,
  }));

  const speakerCounts = new Map<string, number>();
  for (const c of finalCaptions) {
    speakerCounts.set(c.speakerName, (speakerCounts.get(c.speakerName) ?? 0) + 1);
  }

  const accessibilityScore = Math.min(100, Math.round(
    (finalCaptions.length > 0 ? 40 : 0) +
    (finalCaptions.filter(c => c.confidence > 0.8).length / (finalCaptions.length || 1)) * 40 +
    (speakerCounts.size > 0 ? 20 : 0)
  ));

  return {
    meetingId: finalCaptions[0]?.meetingId ?? crypto.randomUUID(),
    generatedAt: new Date().toISOString(),
    duration: meetingDuration, entries, accessibilityScore,
  };
}
