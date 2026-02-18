/**
 * Speaking assessment: AI-based evaluation of user speech by rubric.
 * Criteria: fluency, vocabulary_grammar, pronunciation, completeness, dialogue_skills.
 */

export type AssessmentFormat = 'dialogue' | 'monologue' | 'presentation' | 'debate';

export interface GoalAttainmentItem {
  goal_id: string;
  goal_label?: string;
  achieved: boolean;
  evidence?: string;
  suggestion?: string;
}

export interface CriteriaScores {
  fluency: number;
  vocabulary_grammar: number;
  pronunciation: number;
  completeness: number;
  dialogue_skills: number;
}

export interface AssessmentFeedback {
  strengths?: string[];
  improvements?: string[];
  summary?: string;
  goal_attainment?: GoalAttainmentItem[];
}

export interface SpeakingAssessmentResult {
  criteria_scores: CriteriaScores;
  overall_score: number;
  feedback: AssessmentFeedback;
  user_messages: string[];
  format: AssessmentFormat;
  scenario_id?: string | null;
  scenario_title?: string | null;
  agent_session_id?: string | null;
}

export interface SpeakingAssessmentRow {
  id: string;
  user_id: string;
  agent_session_id?: string | null;
  scenario_id?: string | null;
  scenario_title?: string | null;
  format: AssessmentFormat;
  criteria_scores: CriteriaScores;
  overall_score?: number | null;
  feedback: AssessmentFeedback;
  user_messages: string[];
  created_at: string;
}

const CRITERIA_LABELS: Record<keyof CriteriaScores, string> = {
  fluency: 'Беглость',
  vocabulary_grammar: 'Лексика и грамматика',
  pronunciation: 'Произношение',
  completeness: 'Полнота и логика',
  dialogue_skills: 'Умение вести диалог',
};

export function getCriteriaLabel(key: keyof CriteriaScores): string {
  return CRITERIA_LABELS[key] ?? key;
}
