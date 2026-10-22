export interface QuizOption {
  id: string;
  uz: string;
  ru: string;
}

export interface QuizQuestion {
  id: string;
  // Yo'riqnomaning qaysi qadami (frontend tour qadamining id'si) — yiqilganda qayta o'qish uchun
  topic: string;
  uz: string;
  ru: string;
  options: QuizOption[];
  correct: string;
}

export interface QuizDefinition {
  module: string;
  version: number;
  questionsPerAttempt: number;
  passPercent: number;
  questions: QuizQuestion[];
}

export type Lang = 'uz' | 'ru';
