import { db } from '../db/store.ts';
import { LearningTwin, LearningTwinConcept } from '../../types.ts';

export function calculateMastery(params: {
  assessmentAccuracy: number; // 0 - 100
  questionDifficultyWeight: number; // 0.8 (Easy), 1.0 (Med), 1.3 (Hard)
  attemptsCount: number;
  recentScore: number;
  previousMastery?: number;
}): number {
  const { assessmentAccuracy, questionDifficultyWeight, attemptsCount, recentScore, previousMastery = 50 } = params;

  // Weighted scoring
  const weightedPerformance = assessmentAccuracy * questionDifficultyWeight;
  const recentWeight = 0.6;
  const historicWeight = 0.4;

  let computed = (recentScore * recentWeight) + (previousMastery * historicWeight);
  // Difficulty adjustment
  computed = computed * (0.8 + (questionDifficultyWeight * 0.2));

  // Consistency bonus or penalty
  const consistency = Math.min(attemptsCount * 2, 10);
  computed += consistency;

  // Bound to 0 - 100
  return Math.min(100, Math.max(0, Math.round(computed)));
}

export function updateTwinMastery(studentId: string): LearningTwin {
  const state = db.getState();
  const twinConcepts = state.learningTwinConcepts.filter((c) => c.studentId === studentId);
  const subjects = state.subjects;

  if (twinConcepts.length === 0) {
    const twin = db.getStudentTwin(studentId);
    return twin!;
  }

  // Calculate subject-wise mastery
  const subjectScores: Record<string, { total: number; count: number }> = {};
  for (const tc of twinConcepts) {
    const concept = state.concepts.find((c) => c.id === tc.conceptId);
    if (!concept) continue;
    if (!subjectScores[concept.subjectId]) {
      subjectScores[concept.subjectId] = { total: 0, count: 0 };
    }
    subjectScores[concept.subjectId].total += tc.masteryScore;
    subjectScores[concept.subjectId].count += 1;
  }

  const subjectMastery: Record<string, number> = {};
  let totalSum = 0;
  let totalCount = 0;

  for (const sub of subjects) {
    const data = subjectScores[sub.id];
    if (data && data.count > 0) {
      const avg = Math.round(data.total / data.count);
      subjectMastery[sub.id] = avg;
      totalSum += avg;
      totalCount += 1;
    } else {
      // Default to known subject baseline
      subjectMastery[sub.id] = 50;
      totalSum += 50;
      totalCount += 1;
    }
  }

  const overallMastery = totalCount > 0 ? Math.round(totalSum / totalCount) : 70;
  const masteredCount = twinConcepts.filter((c) => c.masteryScore >= 75).length;
  const activeGaps = state.knowledgeGaps.filter((g) => g.studentId === studentId && g.status !== 'RESOLVED').length;

  let twin = state.learningTwins.find((t) => t.studentId === studentId);
  if (!twin) {
    twin = {
      id: `twin_${studentId}`,
      studentId,
      overallMastery,
      learningMomentum: 12,
      retentionHealth: 81,
      activeGapsCount: activeGaps,
      conceptsMasteredCount: masteredCount,
      totalStudyHours: 28,
      assessmentsCompletedCount: 8,
      avgAssessmentScore: 76,
      subjectMastery,
      updatedAt: new Date().toISOString(),
    };
    state.learningTwins.push(twin);
  } else {
    twin.overallMastery = overallMastery;
    twin.conceptsMasteredCount = masteredCount;
    twin.activeGapsCount = activeGaps;
    twin.subjectMastery = subjectMastery;
    twin.updatedAt = new Date().toISOString();
  }

  db.save();
  return twin;
}
