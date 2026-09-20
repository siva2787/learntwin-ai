import { db } from '../db/store.ts';
import { RetentionRecord } from '../../types.ts';

export function calculateRetentionHealth(studentId: string): {
  overallRetentionHealth: number;
  records: RetentionRecord[];
} {
  const state = db.getState();
  const records = state.retentionRecords.filter((r) => r.studentId === studentId);

  if (records.length === 0) {
    return { overallRetentionHealth: 80, records: [] };
  }

  let totalHealthWeight = 0;

  for (const rec of records) {
    // Memory stability S increases with practice count and baseline mastery
    const stability = (rec.practiceCount * 2.5) + (rec.masteryScore * 0.1);
    const decayExponent = rec.daysSincePractice / Math.max(stability, 1);
    // Retention probability R = e^(-t/S)
    const retentionScore = Math.max(10, Math.min(100, Math.round(100 * Math.exp(-decayExponent * 0.25))));

    if (retentionScore >= 75) {
      rec.status = 'Healthy';
    } else if (retentionScore >= 50) {
      rec.status = 'Fading';
    } else {
      rec.status = 'Needs Revision';
    }

    totalHealthWeight += retentionScore;
  }

  const overallRetentionHealth = Math.round(totalHealthWeight / records.length);

  // Sync with twin
  const twin = state.learningTwins.find((t) => t.studentId === studentId);
  if (twin) {
    twin.retentionHealth = overallRetentionHealth;
  }
  db.save();

  return { overallRetentionHealth, records };
}

export function recordPracticeSession(studentId: string, conceptId: string) {
  const state = db.getState();
  const rec = state.retentionRecords.find((r) => r.studentId === studentId && r.conceptId === conceptId);
  if (rec) {
    rec.practiceCount += 1;
    rec.reviewCount += 1;
    rec.daysSincePractice = 0;
    rec.lastPracticedAt = new Date().toISOString();
    rec.status = 'Healthy';
  }
  db.save();
}
