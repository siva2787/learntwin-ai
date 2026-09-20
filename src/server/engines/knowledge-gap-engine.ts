import { db } from '../db/store.ts';
import { KnowledgeGap } from '../../types.ts';

export function detectKnowledgeGaps(studentId: string): KnowledgeGap[] {
  const state = db.getState();
  const twinConcepts = state.learningTwinConcepts.filter((tc) => tc.studentId === studentId);
  const prerequisites = state.prerequisites;
  const concepts = state.concepts;

  const newlyDetectedOrUpdatedGaps: KnowledgeGap[] = [];

  for (const tc of twinConcepts) {
    // If student mastery is weak (< 60%)
    if (tc.masteryScore < 60) {
      const currentConcept = concepts.find((c) => c.id === tc.conceptId);
      if (!currentConcept) continue;

      // Find prerequisites for this concept
      const directPrereqs = prerequisites.filter((p) => p.conceptId === tc.conceptId);

      let missingPrereqId: string | undefined;
      let missingPrereqName: string | undefined;
      let underlyingGapConcept = 'Foundational Definitions';
      let reason = `Weak assessment performance (${tc.masteryScore}%). Frequent errors during practice.`;

      // Check if any prerequisite is also weak
      for (const pr of directPrereqs) {
        const prereqTc = twinConcepts.find((ptc) => ptc.conceptId === pr.prerequisiteConceptId);
        const prereqConcept = concepts.find((c) => c.id === pr.prerequisiteConceptId);

        if (prereqTc && prereqTc.masteryScore < 65) {
          missingPrereqId = prereqConcept?.id;
          missingPrereqName = prereqConcept?.name;
          reason = `Struggles in ${currentConcept.name} trace back to weak mastery (${prereqTc.masteryScore}%) in prerequisite: ${prereqConcept?.name}.`;

          // Check second degree prerequisite
          const upstreamPrereq = prerequisites.find((up) => up.conceptId === prereqConcept?.id);
          if (upstreamPrereq) {
            const upConcept = concepts.find((c) => c.id === upstreamPrereq.prerequisiteConceptId);
            underlyingGapConcept = upConcept?.name || 'Probability Fundamentals';
          }
          break;
        } else if (!prereqTc || prereqTc.masteryScore === 0) {
          missingPrereqId = prereqConcept?.id;
          missingPrereqName = prereqConcept?.name;
          reason = `Prerequisite ${prereqConcept?.name} has not been completed or verified yet.`;
          break;
        }
      }

      // Check if gap already exists in db
      const existingGap = state.knowledgeGaps.find(
        (g) => g.studentId === studentId && g.conceptId === tc.conceptId && g.status !== 'RESOLVED'
      );

      const severity: 'Critical' | 'Moderate' | 'Mild' =
        tc.masteryScore < 40 ? 'Critical' : tc.masteryScore < 50 ? 'Moderate' : 'Mild';

      if (existingGap) {
        existingGap.masteryScore = tc.masteryScore;
        existingGap.severity = severity;
        existingGap.reason = reason;
        if (missingPrereqId) {
          existingGap.missingPrerequisiteId = missingPrereqId;
          existingGap.missingPrerequisiteName = missingPrereqName;
          existingGap.underlyingGapConcept = underlyingGapConcept;
        }
        newlyDetectedOrUpdatedGaps.push(existingGap);
      } else {
        const newGap: KnowledgeGap = {
          id: `gap_${Date.now()}_${tc.conceptId}`,
          studentId,
          conceptId: tc.conceptId,
          conceptName: currentConcept.name,
          severity,
          masteryScore: tc.masteryScore,
          reason,
          missingPrerequisiteId: missingPrereqId,
          missingPrerequisiteName: missingPrereqName,
          underlyingGapConcept,
          status: 'UNRESOLVED',
          detectedAt: new Date().toISOString(),
        };
        state.knowledgeGaps.push(newGap);
        newlyDetectedOrUpdatedGaps.push(newGap);
      }
    } else {
      // If mastery is now >= 70, mark any previous gap as RESOLVED!
      const existingGap = state.knowledgeGaps.find(
        (g) => g.studentId === studentId && g.conceptId === tc.conceptId && g.status !== 'RESOLVED'
      );
      if (existingGap) {
        existingGap.status = 'RESOLVED';
        existingGap.resolvedAt = new Date().toISOString();
      }
    }
  }

  db.save();
  return state.knowledgeGaps.filter((g) => g.studentId === studentId && g.status !== 'RESOLVED');
}
