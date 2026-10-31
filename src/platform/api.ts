/**
 * Endpoint facade. The UI imports these exactly like the original hosted
 * endpoints; every call is now served on-device (data) or straight from the
 * student's chosen AI provider (AI features).
 */
import * as db from './localDb';
import * as ai from './ai';
import { exportPdf } from './pdf';

export type { McqQuestion, Flashcard, StudyPlanBlock } from './ai';

export const syncData = (_input?: object) => db.syncData();
export const saveSettings = db.saveSettings;
export const saveSubjects = db.saveSubjects;
export const saveTopic = db.saveTopic;
export const deleteRecords = db.deleteRecords;
export const saveDailyLog = db.saveDailyLog;
export const createSession = db.createSession;
export const updateSession = db.updateSession;
export const deleteSession = db.deleteSession;
export const migrateSessions = (_input?: object) => db.migrateSessions();
export const confirmReset = db.confirmReset;
export const loadPrefillSyllabus = (_input?: { subjectIds: string[] }) => db.loadPrefillSyllabus();

export const studyChat = ai.studyChat;
export const generateMCQ = ai.generateMCQ;
export const generateFlashcards = ai.generateFlashcards;
export const generateStudyPlan = ai.generateStudyPlan;
export const studyAdvice = ai.studyAdvice;
export { exportPdf };

export type GenerateMCQOutputType = Awaited<ReturnType<typeof ai.generateMCQ>>;
export type GenerateFlashcardsOutputType = Awaited<ReturnType<typeof ai.generateFlashcards>>;
export type GenerateStudyPlanOutputType = Awaited<ReturnType<typeof ai.generateStudyPlan>>;
