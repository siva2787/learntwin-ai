export type UserRole = 'STUDENT' | 'TEACHER' | 'ADMIN';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl?: string;
  createdAt: string;
}

export interface StudentProfile {
  id: string;
  userId: string;
  department: string;
  yearSemester: string;
  college: string;
  learningMode: 'Visual' | 'Practical' | 'Theoretical' | 'Interactive';
  studyConsistency: 'High' | 'Medium' | 'Low';
  avgSessionMinutes: number;
  learningStreakDays: number;
}

export interface TeacherProfile {
  id: string;
  userId: string;
  department: string;
  title: string;
  institution: string;
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  description: string;
  iconName: string;
  color: string;
}

export interface Topic {
  id: string;
  subjectId: string;
  name: string;
  description: string;
  orderIndex: number;
}

export interface Concept {
  id: string;
  topicId: string;
  subjectId: string;
  name: string;
  description: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  parentConceptId?: string;
  estimatedMinutes: number;
  summaryNotes: string;
}

export interface ConceptPrerequisite {
  id: string;
  conceptId: string;
  prerequisiteConceptId: string;
  relationshipType: 'DIRECT' | 'FOUNDATIONAL' | 'ANCILLARY';
}

export interface LearningTwinConcept {
  id: string;
  studentId: string;
  conceptId: string;
  masteryScore: number; // 0 - 100
  confidenceLevel: number; // 0 - 100
  attemptsCount: number;
  lastAssessedAt?: string;
  status: 'Mastered' | 'Learning' | 'Gap' | 'Not Learned';
}

export interface LearningTwin {
  id: string;
  studentId: string;
  overallMastery: number; // 0 - 100
  learningMomentum: number; // percentage change, e.g. +12
  retentionHealth: number; // 0 - 100
  activeGapsCount: number;
  conceptsMasteredCount: number;
  totalStudyHours: number;
  assessmentsCompletedCount: number;
  avgAssessmentScore: number;
  subjectMastery: Record<string, number>; // subjectId -> mastery percentage
  updatedAt: string;
}

export interface KnowledgeGap {
  id: string;
  studentId: string;
  conceptId: string;
  conceptName: string;
  severity: 'Critical' | 'Moderate' | 'Mild';
  masteryScore: number;
  reason: string;
  missingPrerequisiteId?: string;
  missingPrerequisiteName?: string;
  underlyingGapConcept?: string;
  status: 'UNRESOLVED' | 'IN_PROGRESS' | 'RESOLVED';
  detectedAt: string;
  resolvedAt?: string;
}

export interface Question {
  id: string;
  conceptId: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

export interface Assessment {
  id: string;
  title: string;
  type: 'DIAGNOSTIC' | 'ADAPTIVE' | 'REVISION';
  subjectId: string;
  conceptId?: string;
  questionIds: string[];
  totalQuestions: number;
}

export interface AssessmentAttempt {
  id: string;
  studentId: string;
  assessmentId: string;
  score: number; // percentage 0 - 100
  totalQuestions: number;
  correctAnswersCount: number;
  answers: Record<string, string>; // questionId -> selected option
  startedAt: string;
  completedAt?: string;
  status: 'IN_PROGRESS' | 'COMPLETED';
}

export interface TutorMessage {
  id: string;
  conversationId: string;
  sender: 'USER' | 'TUTOR';
  content: string;
  actionUsed?: 'Explain' | 'Simplify' | 'Example' | 'Quiz Me' | 'Practice' | 'Give Hint' | 'Explain Visually';
  timestamp: string;
}

export interface TutorConversation {
  id: string;
  studentId: string;
  conceptId: string;
  conceptName: string;
  createdAt: string;
  updatedAt: string;
}

export interface RetentionRecord {
  id: string;
  studentId: string;
  conceptId: string;
  conceptName: string;
  subjectName: string;
  learnedAt: string;
  lastPracticedAt: string;
  practiceCount: number;
  masteryScore: number;
  reviewCount: number;
  daysSincePractice: number;
  status: 'Needs Revision' | 'Fading' | 'Healthy';
  nextScheduledReview: string;
}

export interface LearningGoal {
  id: string;
  studentId: string;
  title: string;
  targetDate: string;
  overallProgress: number; // 0 - 100
  milestones: {
    id: string;
    skill: string;
    progress: number; // 0 - 100
    status: 'Completed' | 'In Progress' | 'Not Started';
  }[];
}

export interface NotificationItem {
  id: string;
  studentId: string;
  title: string;
  message: string;
  category: 'Learning' | 'Progress' | 'Reminders' | 'System';
  timestamp: string;
  read: boolean;
  actionUrl?: string;
}

export interface LearningPathItem {
  id: string;
  conceptId: string;
  conceptName: string;
  order: number;
  status: 'Completed' | 'In Progress' | 'Recommended' | 'Locked';
  mastery: number;
  estimatedMinutes: number;
  activities: {
    type: 'Video' | 'Notes' | 'Practice' | 'Quiz';
    title: string;
    duration: string;
    completed: boolean;
  }[];
}

export interface TeacherStudentSummary {
  id: string;
  studentId: string;
  name: string;
  email: string;
  department: string;
  overallMastery: number;
  learningMomentum: number;
  retentionHealth: number;
  status: 'On Track' | 'Need Support' | 'At Risk';
  strengths: string[];
  knowledgeGaps: string[];
  recommendedIntervention: string;
  lastActive: string;
}

export interface Intervention {
  id: string;
  studentId?: string;
  studentName?: string;
  topicName: string;
  concept?: string;
  groupName?: string;
  severity?: 'HIGH' | 'MEDIUM' | 'LOW';
  affectedStudents?: string[];
  affectedCount?: number;
  issue: string;
  reason?: string;
  suggestedAction?: string;
  status: 'Pending' | 'In Progress' | 'Resolved';
  createdAt: string;
}

export type InterventionItem = {
  id: string;
  groupName?: string;
  concept?: string;
  topicName?: string;
  severity?: 'HIGH' | 'MEDIUM' | 'LOW';
  affectedStudents?: string[];
  affectedCount?: number;
  reason?: string;
  issue?: string;
  suggestedAction?: string;
  status: 'Pending' | 'In Progress' | 'Resolved';
  createdAt: string;
};

export type Notification = {
  id: string;
  title: string;
  message: string;
  category: 'ALL' | 'LEARNING' | 'PROGRESS' | 'REMINDER';
  type?: 'GAP_ALERT' | 'REVISION_DUE' | 'MASTERY_UP' | 'SYSTEM';
  timestamp: string;
  read: boolean;
};

export interface AdaptivePathStep {
  conceptId: string;
  conceptName: string;
  status: 'Completed' | 'In Progress' | 'Recommended Next' | 'Locked';
  masteryScore: number;
  prerequisiteGapsCount: number;
  estimatedMinutes: number;
  reasonForPlacement: string;
}

export interface AdaptiveLearningPath {
  studentId: string;
  targetGoal: string;
  steps: AdaptivePathStep[];
  updatedAt: string;
}

export interface RetentionScheduleItem {
  conceptId: string;
  conceptName: string;
  retentionStatus: 'Needs Revision' | 'Fading' | 'Healthy';
  predictedRetentionScore: number;
  daysSincePractice: number;
  recommendedReviewDate: string;
}

export interface RetentionHealthResult {
  overallRetentionHealth: number;
  fadingCount: number;
  urgentRevisionCount: number;
  schedule: RetentionScheduleItem[];
}

export interface TeacherStudentItem {
  id: string;
  name: string;
  overallMastery: number;
  momentum: number;
  status: 'On Track' | 'Need Support' | 'At Risk';
  gaps: string[];
  strengths: string[];
  lastActive: string;
  avatarUrl: string;
}

