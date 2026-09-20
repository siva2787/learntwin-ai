import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { db } from './src/server/db/store.ts';
import { calculateMastery, updateTwinMastery } from './src/server/engines/mastery-engine.ts';
import { detectKnowledgeGaps } from './src/server/engines/knowledge-gap-engine.ts';
import { generateAdaptiveLearningPath } from './src/server/engines/adaptive-path-engine.ts';
import { calculateRetentionHealth, recordPracticeSession } from './src/server/engines/retention-engine.ts';
import { generateTutorResponse } from './src/server/ai-tutor-service.ts';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Raised from Express's 100kb default so base64-encoded profile photo uploads
  // (data URLs, up to ~2MB source images) fit in the request body.
  app.use(express.json({ limit: '5mb' }));

  // Current session user tracking (default student Siva)
  let currentUserId = 'usr_student_1';

  // =================== AUTH ROUTES ===================
  app.get('/api/auth/current-user', (req, res) => {
    const state = db.getState();
    const user = state.users.find((u) => u.id === currentUserId) || state.users[0];
    const profile =
      user.role === 'STUDENT'
        ? state.studentProfiles.find((p) => p.userId === user.id)
        : state.teacherProfiles.find((p) => p.userId === user.id);

    res.json({ user, profile });
  });

  app.post('/api/auth/switch-role', (req, res) => {
    const { role } = req.body;
    const state = db.getState();
    if (role === 'TEACHER') {
      const teacher = state.users.find((u) => u.role === 'TEACHER');
      if (teacher) currentUserId = teacher.id;
    } else {
      const student = state.users.find((u) => u.role === 'STUDENT');
      if (student) currentUserId = student.id;
    }
    const user = state.users.find((u) => u.id === currentUserId);
    res.json({ success: true, user });
  });

  app.post('/api/auth/login', (req, res) => {
    const { email } = req.body;
    const state = db.getState();
    const user = state.users.find((u) => u.email.toLowerCase() === (email || '').toLowerCase()) || state.users[0];
    currentUserId = user.id;
    res.json({ success: true, user });
  });

  app.post('/api/auth/logout', (req, res) => {
    currentUserId = 'usr_student_1';
    res.json({ success: true, message: 'Logged out successfully' });
  });

  app.delete('/api/auth/profile', (req, res) => {
    const state = db.getState();
    const deletedUserId = currentUserId;
    state.users = state.users.filter((u) => u.id !== deletedUserId);
    state.studentProfiles = state.studentProfiles.filter((p) => p.userId !== deletedUserId);
    state.learningTwins = state.learningTwins.filter((t) => t.studentId !== deletedUserId);
    state.knowledgeGaps = state.knowledgeGaps.filter((g) => g.studentId !== deletedUserId);
    db.save();

    // Reset currentUserId to default student
    const defaultStudent = state.users.find((u) => u.role === 'STUDENT') || state.users[0];
    currentUserId = defaultStudent ? defaultStudent.id : 'usr_student_1';
    res.json({ success: true, message: 'Profile deleted successfully' });
  });

  app.post('/api/auth/register', (req, res) => {
    const { name, email, password } = req.body;
    const state = db.getState();
    const newId = `usr_${Date.now()}`;
    const newUser = {
      id: newId,
      name: name || 'Learner',
      email: email || `user_${Date.now()}@example.com`,
      role: 'STUDENT' as const,
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      createdAt: new Date().toISOString(),
    };
    state.users.push(newUser);
    currentUserId = newUser.id;

    // Create default student profile
    const profile = {
      id: `prof_${newId}`,
      userId: newId,
      department: 'AI & Data Science',
      yearSemester: '3rd Year',
      college: 'Engineering Institute',
      learningMode: 'Visual' as const,
      studyConsistency: 'High' as const,
      avgSessionMinutes: 25,
      learningStreakDays: 1,
    };
    state.studentProfiles.push(profile);

    // Initialize initial twin
    updateTwinMastery(newId);
    db.save();

    res.json({ success: true, user: newUser, profile });
  });

  app.post('/api/auth/onboarding', (req, res) => {
    const { name, department, yearSemester, college, learningMode, goals, avatarUrl } = req.body;
    const state = db.getState();

    let user = state.users.find((u) => u.id === currentUserId);
    if (user && name) user.name = name;
    // avatarUrl === '' explicitly clears the custom photo (falls back to default avatar);
    // avatarUrl === undefined means "not provided, leave as-is".
    if (user && typeof avatarUrl === 'string') user.avatarUrl = avatarUrl || undefined;

    let profile = state.studentProfiles.find((p) => p.userId === currentUserId);
    if (profile) {
      if (department) profile.department = department;
      if (yearSemester) profile.yearSemester = yearSemester;
      if (college) profile.college = college;
      if (learningMode) profile.learningMode = learningMode;
    }

    if (goals && goals.length > 0) {
      const goal = state.learningGoals.find((g) => g.studentId === currentUserId);
      if (goal) {
        goal.title = goals;
      }
    }

    db.save();
    res.json({ success: true, user, profile });
  });

  // =================== LEARNING TWIN ===================
  app.get('/api/learning-twin', (req, res) => {
    const studentId = currentUserId;
    // ensure mastery is up to date
    const twin = updateTwinMastery(studentId);
    const profile = db.getStudentProfile(studentId);
    const retentionData = calculateRetentionHealth(studentId);
    const gaps = detectKnowledgeGaps(studentId);

    res.json({
      twin,
      profile,
      retentionHealth: retentionData.overallRetentionHealth,
      activeGapsCount: gaps.length,
    });
  });

  app.get('/api/learning-twin/concepts', (req, res) => {
    const studentId = currentUserId;
    const state = db.getState();
    const twinConcepts = state.learningTwinConcepts.filter((c) => c.studentId === studentId);
    const concepts = state.concepts.map((c) => {
      const tc = twinConcepts.find((item) => item.conceptId === c.id);
      return {
        ...c,
        masteryScore: tc ? tc.masteryScore : 0,
        status: tc ? tc.status : 'Not Learned',
        confidenceLevel: tc ? tc.confidenceLevel : 0,
        attemptsCount: tc ? tc.attemptsCount : 0,
      };
    });
    res.json(concepts);
  });

  // =================== KNOWLEDGE GRAPH ===================
  app.get('/api/knowledge-graph', (req, res) => {
    const studentId = currentUserId;
    const subjectId = (req.query.subjectId as string) || 'sub_ml';
    const state = db.getState();

    const concepts = state.concepts.filter((c) => c.subjectId === subjectId);
    const twinConcepts = state.learningTwinConcepts.filter((tc) => tc.studentId === studentId);
    const gaps = state.knowledgeGaps.filter((g) => g.studentId === studentId && g.status !== 'RESOLVED');

    const nodes = concepts.map((c) => {
      const tc = twinConcepts.find((item) => item.conceptId === c.id);
      const isGap = gaps.some((g) => g.conceptId === c.id);

      let status = tc ? tc.status : 'Not Learned';
      if (isGap) status = 'Gap';

      return {
        id: c.id,
        name: c.name,
        description: c.description,
        difficulty: c.difficulty,
        topicId: c.topicId,
        parentConceptId: c.parentConceptId,
        masteryScore: tc ? tc.masteryScore : 0,
        status,
      };
    });

    const edges = state.prerequisites
      .filter((p) => concepts.some((c) => c.id === p.conceptId) && concepts.some((c) => c.id === p.prerequisiteConceptId))
      .map((p) => ({
        id: p.id,
        source: p.prerequisiteConceptId,
        target: p.conceptId,
        type: p.relationshipType,
      }));

    res.json({
      subjectId,
      nodes,
      edges,
      subjects: state.subjects,
    });
  });

  // =================== KNOWLEDGE GAPS ===================
  app.get('/api/knowledge-gaps', (req, res) => {
    const studentId = currentUserId;
    const gaps = detectKnowledgeGaps(studentId);
    res.json(gaps);
  });

  // =================== ADAPTIVE LEARNING PATH ===================
  app.get('/api/learning-path', (req, res) => {
    const studentId = currentUserId;
    const path = generateAdaptiveLearningPath(studentId, 'sub_ml');
    res.json(path);
  });

  // =================== RETENTION & REVISION ===================
  app.get('/api/retention', (req, res) => {
    const studentId = currentUserId;
    const data = calculateRetentionHealth(studentId);
    const schedule = (data.records || []).map((r) => ({
      conceptId: r.conceptId,
      conceptName: r.conceptName,
      retentionStatus: r.status,
      predictedRetentionScore: r.masteryScore,
      daysSincePractice: r.daysSincePractice,
      recommendedReviewDate: r.nextScheduledReview,
    }));
    res.json({
      ...data,
      schedule,
    });
  });

  app.post('/api/retention/practice', (req, res) => {
    const { conceptId } = req.body;
    const studentId = currentUserId;
    recordPracticeSession(studentId, conceptId);
    const data = calculateRetentionHealth(studentId);
    const schedule = (data.records || []).map((r) => ({
      conceptId: r.conceptId,
      conceptName: r.conceptName,
      retentionStatus: r.status,
      predictedRetentionScore: r.masteryScore,
      daysSincePractice: r.daysSincePractice,
      recommendedReviewDate: r.nextScheduledReview,
    }));
    res.json({ success: true, ...data, schedule });
  });

  // =================== PROGRESS & ANALYTICS ===================
  app.get('/api/progress', (req, res) => {
    const studentId = currentUserId;
    const twin = updateTwinMastery(studentId);
    const state = db.getState();

    // Mastery trend over time (points)
    const masteryTrend = [
      { day: 'Day 1', mastery: 42 },
      { day: 'Day 3', mastery: 50 },
      { day: 'Day 6', mastery: 58 },
      { day: 'Day 8', mastery: 64 },
      { day: 'Day 10', mastery: 68 },
      { day: 'Day 12 (Today)', mastery: twin.overallMastery },
    ];

    const subjectProgress = state.subjects.map((sub) => ({
      name: sub.name,
      mastery: twin.subjectMastery[sub.id] || 60,
      color: sub.color,
    }));

    res.json({
      overallMastery: twin.overallMastery,
      learningHours: twin.totalStudyHours,
      conceptsMastered: twin.conceptsMasteredCount,
      assessmentsCount: twin.assessmentsCompletedCount,
      avgScore: twin.avgAssessmentScore,
      masteryTrend,
      subjectProgress,
    });
  });

  // =================== LEARNING GOALS ===================
  app.get('/api/goals', (req, res) => {
    const studentId = currentUserId;
    const goals = db.getGoals(studentId);
    res.json(goals);
  });

  app.post('/api/goals', (req, res) => {
    const { title, targetDate, milestones } = req.body;
    const studentId = currentUserId;
    const state = db.getState();
    const newGoal = {
      id: `goal_${Date.now()}`,
      studentId,
      title: title || 'New AI Milestone',
      targetDate: targetDate || '2026-11-30',
      overallProgress: 0,
      milestones: milestones || [
        { id: 'm_1', skill: 'Foundational Knowledge', progress: 0, status: 'In Progress' as const },
      ],
    };
    state.learningGoals.push(newGoal);
    db.save();
    res.json({ success: true, goal: newGoal });
  });

  // =================== NOTIFICATIONS ===================
  app.get('/api/notifications', (req, res) => {
    const studentId = currentUserId;
    const notifs = db.getNotifications(studentId);
    res.json(notifs);
  });

  app.post('/api/notifications/mark-read', (req, res) => {
    const { id } = req.body;
    const state = db.getState();
    const notif = state.notifications.find((n) => n.id === id);
    if (notif) notif.read = true;
    db.save();
    res.json({ success: true });
  });

  // =================== ASSESSMENTS ===================
  app.get('/api/assessments', (req, res) => {
    const { subjectId, conceptId } = req.query;
    const state = db.getState();
    let list = state.assessments;
    if (subjectId) {
      list = list.filter((a) => a.subjectId === subjectId);
    }
    if (conceptId) {
      list = list.filter((a) => a.conceptId === conceptId || a.id.includes(conceptId as string));
    }
    res.json({ assessments: list, subjects: state.subjects });
  });

  app.get('/api/assessment/:id', (req, res) => {
    const { id } = req.params;
    const state = db.getState();
    let assessment = state.assessments.find((a) => a.id === id)
      || state.assessments.find((a) => a.conceptId === id)
      || state.assessments.find((a) => a.subjectId === id);
    if (!assessment) {
      assessment = state.assessments[0];
    }
    const questionsById = new Map(state.questions.map((q) => [q.id, q]));
    const questions = assessment.questionIds
      .map((qid) => questionsById.get(qid))
      .filter((q): q is (typeof state.questions)[number] => Boolean(q));
    res.json({ assessment, questions });
  });

  app.post('/api/assessment/submit', (req, res) => {
    const { assessmentId, answers } = req.body; // answers: { questionId: chosenOption }
    const studentId = currentUserId;
    const state = db.getState();

    let assessment = state.assessments.find((a) => a.id === assessmentId)
      || state.assessments.find((a) => a.conceptId === assessmentId)
      || state.assessments.find((a) => a.subjectId === assessmentId);
    if (!assessment) {
      assessment = state.assessments[0];
    }

    const questionsById = new Map(state.questions.map((q) => [q.id, q]));
    const questions = assessment.questionIds
      .map((qid) => questionsById.get(qid))
      .filter((q): q is (typeof state.questions)[number] => Boolean(q));
    let correctCount = 0;
    const breakdown: any[] = [];

    questions.forEach((q) => {
      const chosen = answers ? answers[q.id] : undefined;
      const norm = (s: any) => String(s || '').trim().toLowerCase();
      const isCorrect = Boolean(chosen && norm(chosen) === norm(q.correctAnswer));

      if (isCorrect) correctCount += 1;

      breakdown.push({
        questionId: q.id,
        question: q.question,
        chosenOption: chosen || 'Not Answered',
        correctAnswer: q.correctAnswer,
        isCorrect,
        explanation: q.explanation,
        difficulty: q.difficulty,
      });

      // Update question's concept mastery in LearningTwinConcepts
      let tc = state.learningTwinConcepts.find((item) => item.studentId === studentId && item.conceptId === q.conceptId);
      if (!tc) {
        tc = {
          id: `ltc_${Date.now()}_${q.conceptId}`,
          studentId,
          conceptId: q.conceptId,
          masteryScore: 50,
          confidenceLevel: 50,
          attemptsCount: 0,
          status: 'Learning',
        };
        state.learningTwinConcepts.push(tc);
      }

      tc.attemptsCount += 1;
      tc.lastAssessedAt = new Date().toISOString();

      const diffWeight = q.difficulty === 'Easy' ? 0.9 : q.difficulty === 'Hard' ? 1.3 : 1.1;
      const questionScore = isCorrect ? 90 : 30;

      tc.masteryScore = calculateMastery({
        assessmentAccuracy: isCorrect ? 100 : 20,
        questionDifficultyWeight: diffWeight,
        attemptsCount: tc.attemptsCount,
        recentScore: questionScore,
        previousMastery: tc.masteryScore,
      });

      tc.confidenceLevel = Math.min(100, Math.max(20, isCorrect ? tc.confidenceLevel + 12 : tc.confidenceLevel - 15));
      tc.status = tc.masteryScore >= 75 ? 'Mastered' : tc.masteryScore < 50 ? 'Gap' : 'Learning';
    });

    const totalQ = questions.length || 1;
    const scorePercentage = Math.round((correctCount / totalQ) * 100);

    const attempt = {
      id: `att_${Date.now()}`,
      studentId,
      assessmentId: assessment.id,
      score: scorePercentage,
      totalQuestions: totalQ,
      correctAnswersCount: correctCount,
      answers,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      status: 'COMPLETED' as const,
    };
    state.assessmentAttempts.push(attempt);

    // Run knowledge gap detection engine & update twin
    detectKnowledgeGaps(studentId);
    const updatedTwin = updateTwinMastery(studentId);
    db.save();

    res.json({
      success: true,
      score: scorePercentage,
      correctCount,
      totalQuestions: totalQ,
      twin: updatedTwin,
      breakdown,
    });
  });

  // =================== AI TUTOR ===================
  app.get('/api/tutor/history', (req, res) => {
    const studentId = currentUserId;
    const conceptId = (req.query.conceptId as string) || 'c_bayes';
    const state = db.getState();

    let conv = state.tutorConversations.find((c) => c.studentId === studentId && c.conceptId === conceptId);
    if (!conv) {
      const concept = state.concepts.find((c) => c.id === conceptId);
      conv = {
        id: `conv_${Date.now()}`,
        studentId,
        conceptId,
        conceptName: concept?.name || 'Bayes Theorem',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      state.tutorConversations.push(conv);
      db.save();
    }

    const messages = state.tutorMessages.filter((m) => m.conversationId === conv.id);
    res.json({ conversation: conv, messages });
  });

  app.post('/api/tutor/message', async (req, res) => {
    try {
      const { conceptId = 'c_bayes', message, action } = req.body;
      const studentId = currentUserId;
      const state = db.getState();

      let conv = state.tutorConversations.find((c) => c.studentId === studentId && c.conceptId === conceptId);
      if (!conv) {
        const concept = state.concepts.find((c) => c.id === conceptId);
        conv = {
          id: `conv_${Date.now()}`,
          studentId,
          conceptId,
          conceptName: concept?.name || 'Bayes Theorem',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        state.tutorConversations.push(conv);
      }

      const userMsg = {
        id: `msg_${Date.now()}_u`,
        conversationId: conv.id,
        sender: 'USER' as const,
        content: typeof message === 'string' ? message : '',
        actionUsed: action,
        timestamp: new Date().toISOString(),
      };
      state.tutorMessages.push(userMsg);

      // Call server-side Gemini tutor
      const replyText = await generateTutorResponse({
        studentId,
        conceptId,
        userMessage: userMsg.content,
        action,
        history: state.tutorMessages.filter((m) => m.conversationId === conv.id),
      });

      const tutorMsg = {
        id: `msg_${Date.now()}_t`,
        conversationId: conv.id,
        sender: 'TUTOR' as const,
        content: replyText,
        actionUsed: action,
        timestamp: new Date().toISOString(),
      };
      state.tutorMessages.push(tutorMsg);
      conv.updatedAt = new Date().toISOString();
      db.save();

      res.json({ userMessage: userMsg, tutorMessage: tutorMsg });
    } catch (err) {
      // Never let an unexpected error surface as a broken/non-JSON response —
      // that's what was causing the client's generic "connection interference"
      // fallback message to appear instead of a real (even if basic) answer.
      console.error('POST /api/tutor/message failed:', err);
      res.status(200).json({
        tutorMessage: {
          id: `msg_${Date.now()}_t`,
          conversationId: 'active',
          sender: 'TUTOR' as const,
          content:
            "I hit a snag pulling up your learning twin context just now, but I'm still here — could you ask that again, maybe rephrased slightly?",
          timestamp: new Date().toISOString(),
        },
      });
    }
  });

  // =================== TEACHER ROUTES ===================
  app.get('/api/teacher/dashboard', (req, res) => {
    const state = db.getState();
    const students = state.teacherStudents;
    const avgMastery = Math.round(students.reduce((acc, s) => acc + s.overallMastery, 0) / students.length);
    const atRiskCount = students.filter((s) => s.status === 'At Risk' || s.overallMastery < 60).length;

    res.json({
      totalStudents: 48,
      avgMastery: 68,
      atRiskCount: 12,
      activeToday: 36,
      classSubjectMastery: [
        { subject: 'Machine Learning', mastery: 76 },
        { subject: 'Statistics & Probability', mastery: 61 },
        { subject: 'Data Science & Python', mastery: 82 },
        { subject: 'Operating Systems', mastery: 54 },
      ],
    });
  });

  app.get('/api/teacher/students', (req, res) => {
    const state = db.getState();
    const avatars = [
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&auto=format&fit=crop&q=80',
    ];
    const formatted = state.teacherStudents.map((ts, idx) => ({
      ...ts,
      gaps: ts.knowledgeGaps || [],
      momentum: ts.learningMomentum || 12,
      avatarUrl: avatars[idx % avatars.length],
    }));
    res.json(formatted);
  });

  app.get('/api/teacher/knowledge-gaps', (req, res) => {
    // Heatmap data across topics
    res.json([
      { topic: 'Probability', low: 22, medium: 45, high: 33, alert: 'Prerequisite bottle-neck detected' },
      { topic: 'Hypothesis Testing', low: 35, medium: 40, high: 25, alert: 'High error rate on p-values' },
      { topic: 'Linear Regression', low: 10, medium: 30, high: 60, alert: 'Good overall mastery' },
      { topic: 'Bayes Theorem', low: 42, medium: 38, high: 20, alert: 'Struggling with conditional probability' },
      { topic: 'Classification', low: 18, medium: 52, high: 30, alert: 'Moderate progression' },
      { topic: 'Neural Networks', low: 50, medium: 35, high: 15, alert: 'Introduction scheduled next week' },
    ]);
  });

  app.get('/api/teacher/analytics', (req, res) => {
    res.json({
      engagement: 82,
      assignmentCompletion: 76,
      classAverage: 68,
      weeklyActivity: [
        { day: 'Mon', active: 38 },
        { day: 'Tue', active: 44 },
        { day: 'Wed', active: 41 },
        { day: 'Thu', active: 46 },
        { day: 'Fri', active: 39 },
        { day: 'Sat', active: 28 },
        { day: 'Sun', active: 34 },
      ],
    });
  });

  app.get('/api/teacher/interventions', (req, res) => {
    const state = db.getState();
    const normalized = (state.interventions || []).map((item: any) => {
      const affectedStudents = Array.isArray(item.affectedStudents) && item.affectedStudents.length > 0
        ? item.affectedStudents
        : (item.studentName ? [item.studentName] : ['Siva', 'Priya', 'Karthik', 'Rahul']);
      return {
        ...item,
        concept: item.concept || item.topicName || 'Foundational Concept',
        groupName: item.groupName || `${item.topicName || item.concept || 'Cohort'} Remediation Cohort`,
        severity: item.severity || (item.affectedCount && item.affectedCount >= 8 ? 'HIGH' : 'MEDIUM'),
        affectedStudents,
        affectedCount: item.affectedCount || affectedStudents.length,
        reason: item.reason || item.issue || 'Knowledge gap detected across student twins.',
        issue: item.issue || item.reason || 'Knowledge gap detected across student twins.',
        suggestedAction: item.suggestedAction || 'Deploy adaptive booster micro-set.',
        status: item.status || 'Pending',
        createdAt: item.createdAt || new Date().toISOString(),
      };
    });
    res.json(normalized);
  });

  app.post('/api/teacher/interventions', (req, res) => {
    const { id, status } = req.body;
    const state = db.getState();
    const item = state.interventions.find((i) => i.id === id);
    if (item) item.status = status;
    db.save();
    res.json({ success: true, intervention: item });
  });

  // =================== COMPETITION DEMO SCENARIO ===================
  // Demonstrates: Probability (strong) -> Conditional Probability (weak gap) -> Bayes Theorem (detected gap)
  app.post('/api/demo/trigger-gap', (req, res) => {
    const studentId = currentUserId;
    const state = db.getState();

    // Set Conditional Probability to 45% and Bayes to 38%
    const cCond = state.learningTwinConcepts.find((c) => c.studentId === studentId && c.conceptId === 'c_cond_prob');
    if (cCond) cCond.masteryScore = 45;
    const cBayes = state.learningTwinConcepts.find((c) => c.studentId === studentId && c.conceptId === 'c_bayes');
    if (cBayes) cBayes.masteryScore = 38;

    detectKnowledgeGaps(studentId);
    updateTwinMastery(studentId);
    db.save();

    res.json({ success: true, message: 'Seeded gap scenario activated: Bayes Theorem gap with Conditional Probability prerequisite bottleneck.' });
  });

  app.post('/api/demo/resolve-gap', (req, res) => {
    const studentId = currentUserId;
    const state = db.getState();

    // Student mastered Conditional Probability -> now 88%!
    const cCond = state.learningTwinConcepts.find((c) => c.studentId === studentId && c.conceptId === 'c_cond_prob');
    if (cCond) {
      cCond.masteryScore = 88;
      cCond.status = 'Mastered';
    }

    // Bayes Theorem mastery jumps to 82%!
    const cBayes = state.learningTwinConcepts.find((c) => c.studentId === studentId && c.conceptId === 'c_bayes');
    if (cBayes) {
      cBayes.masteryScore = 82;
      cBayes.status = 'Mastered';
    }

    // Resolve gaps
    state.knowledgeGaps
      .filter((g) => g.studentId === studentId && (g.conceptId === 'c_bayes' || g.conceptId === 'c_cond_prob'))
      .forEach((g) => {
        g.status = 'RESOLVED';
        g.resolvedAt = new Date().toISOString();
      });

    updateTwinMastery(studentId);
    db.save();

    res.json({ success: true, message: 'Gap resolved! Prerequisite mastered and Learning Twin updated.' });
  });

  app.post('/api/demo/reset', (req, res) => {
    const seed = db.resetToSeed();
    currentUserId = 'usr_student_1';
    res.json({ success: true, state: seed });
  });

  // =================== GLOBAL JSON ERROR HANDLER ===================
  // Catches anything unhandled by an individual route (including body-parser
  // errors on malformed JSON) so API clients always get JSON back instead of
  // Express's default HTML error page, which breaks `res.json()` on the client.
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(`Unhandled error on ${req.method} ${req.path}:`, err);
    if (res.headersSent) {
      return next(err);
    }
    res.status(200).json({
      error: 'internal_error',
      message: 'Something went wrong processing that request. Please try again.',
    });
  });

  // =================== VITE MIDDLEWARE ===================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LearnTwin AI Server running on port ${PORT}`);
  });
}

startServer();