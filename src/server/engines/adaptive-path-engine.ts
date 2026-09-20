import { db } from '../db/store.ts';
import { LearningPathItem } from '../../types.ts';

export function generateAdaptiveLearningPath(studentId: string, subjectId: string = 'sub_ml'): LearningPathItem[] {
  const state = db.getState();
  const concepts = state.concepts.filter((c) => c.subjectId === subjectId);
  const twinConcepts = state.learningTwinConcepts.filter((tc) => tc.studentId === studentId);
  const prerequisites = state.prerequisites;
  const activeGaps = state.knowledgeGaps.filter((g) => g.studentId === studentId && g.status !== 'RESOLVED');

  // Order concepts based on the ML curriculum sequence
  const sequence = [
    'c_prob',
    'c_cond_prob',
    'c_bayes',
    'c_naive_bayes',
    'c_classif',
    'c_eval',
  ];

  const pathItems: LearningPathItem[] = [];

  sequence.forEach((conceptId, index) => {
    const concept = concepts.find((c) => c.id === conceptId);
    if (!concept) return;

    const tc = twinConcepts.find((item) => item.conceptId === conceptId);
    const mastery = tc ? tc.masteryScore : 0;
    const hasActiveGap = activeGaps.some((g) => g.conceptId === conceptId);

    // Check prerequisites
    const directPrereqs = prerequisites.filter((p) => p.conceptId === conceptId);
    const allPrereqsMet = directPrereqs.every((pr) => {
      const prTc = twinConcepts.find((item) => item.conceptId === pr.prerequisiteConceptId);
      return prTc && prTc.masteryScore >= 65;
    });

    let status: 'Completed' | 'In Progress' | 'Recommended' | 'Locked';

    if (mastery >= 75 && !hasActiveGap) {
      status = 'Completed';
    } else if (hasActiveGap) {
      // Prioritize fixing the gap
      status = 'In Progress';
    } else if (allPrereqsMet || directPrereqs.length === 0) {
      status = 'Recommended';
    } else {
      status = 'Locked';
    }

    pathItems.push({
      id: `path_${concept.id}`,
      conceptId: concept.id,
      conceptName: concept.name,
      order: index + 1,
      status,
      mastery,
      estimatedMinutes: concept.estimatedMinutes || 20,
      activities: [
        {
          type: 'Video',
          title: `Video Lesson: Intuitive ${concept.name}`,
          duration: `${Math.round(concept.estimatedMinutes * 0.4)} min`,
          completed: mastery >= 50,
        },
        {
          type: 'Practice',
          title: `Practice Questions & Derivations`,
          duration: `${Math.round(concept.estimatedMinutes * 0.4)} min`,
          completed: mastery >= 75,
        },
        {
          type: 'Notes',
          title: `Summary Notes & Flashcards`,
          duration: `${Math.round(concept.estimatedMinutes * 0.2)} min`,
          completed: mastery >= 40,
        },
      ],
    });
  });

  return pathItems;
}
