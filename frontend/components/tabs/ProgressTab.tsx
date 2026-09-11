'use client';

import React from 'react';
import { useLearningLanguage } from '@/context/LearningLanguageContext';
import { ProgressDashboard } from '@/components/progress/ProgressDashboard';
import { ZhProgressDashboard } from '@/components/progress/ZhProgressDashboard';

export const ProgressTab: React.FC = () => {
  const { learningLanguage } = useLearningLanguage();
  return learningLanguage === 'zh' ? <ZhProgressDashboard /> : <ProgressDashboard />;
};
