'use client';

import { create } from 'zustand';
import type { PRD, PRDContent, PRDSectionKey, PRDStatus, PRDFormInput, PlanStructure, PlanStep } from '@/types';

export interface PendingEngineConfig {
  baseUrl?: string;
  apiKey?: string;
  compat?: 'openai' | 'anthropic';
}

interface PRDState {
  // Pending generation request (set by form, consumed by editor)
  pendingInput: PRDFormInput | null;
  pendingModel: string | null;
  pendingEngine: PendingEngineConfig | null;
  setPendingGeneration: (input: PRDFormInput, model: string, engine?: PendingEngineConfig) => void;
  clearPendingGeneration: () => void;

  // Workspace flow (Struktur → PRD → Task): the idea + resolved model/engine
  // set by the idea-first /new page, consumed by the workspace page.
  pendingIdea: string | null;
  setPendingIdea: (idea: string, model: string, engine?: PendingEngineConfig) => void;
  clearPendingIdea: () => void;

  // Persisted workspace structure across the three phases.
  structure: PlanStructure | null;
  setStructure: (structure: PlanStructure | null) => void;
  activeStep: PlanStep;
  setActiveStep: (step: PlanStep) => void;

  // Current PRD
  currentPRD: PRD | null;
  setCurrentPRD: (prd: PRD | null) => void;

  // Streaming state
  isStreaming: boolean;
  currentSection: PRDSectionKey | null;
  streamedSections: Partial<PRDContent>;
  streamTokens: string; // accumulator for current section tokens

  startStreaming: () => void;
  stopStreaming: () => void;
  setCurrentSection: (section: PRDSectionKey | null) => void;
  appendToken: (token: string) => void;
  finalizeSection: (section: PRDSectionKey) => void;
  resetStream: () => void;

  // PRD list
  prdList: PRD[];
  setPRDList: (list: PRD[]) => void;
  updatePRDInList: (id: string, updates: Partial<PRD>) => void;
  removePRDFromList: (id: string) => void;

  // Status
  updateStatus: (status: PRDStatus) => void;
}

export const usePRDStore = create<PRDState>((set, get) => ({
  pendingInput: null,
  pendingModel: null,
  pendingEngine: null,
  setPendingGeneration: (input, model, engine) => set({ pendingInput: input, pendingModel: model, pendingEngine: engine ?? null }),
  clearPendingGeneration: () => set({ pendingInput: null, pendingModel: null, pendingEngine: null }),

  pendingIdea: null,
  setPendingIdea: (idea, model, engine) => set({ pendingIdea: idea, pendingModel: model, pendingEngine: engine ?? null }),
  clearPendingIdea: () => set({ pendingIdea: null }),

  structure: null,
  setStructure: (structure) => set({ structure }),
  activeStep: 'structure',
  setActiveStep: (activeStep) => set({ activeStep }),

  currentPRD: null,
  setCurrentPRD: (prd) => set({ currentPRD: prd }),

  isStreaming: false,
  currentSection: null,
  streamedSections: {},
  streamTokens: '',

  startStreaming: () =>
    set({
      isStreaming: true,
      currentSection: null,
      streamedSections: {},
      streamTokens: '',
    }),

  stopStreaming: () => set({ isStreaming: false, currentSection: null }),

  setCurrentSection: (section) =>
    set({ currentSection: section, streamTokens: '' }),

  appendToken: (token) =>
    set((state) => ({ streamTokens: state.streamTokens + token })),

  finalizeSection: (section) =>
    set((state) => ({
      streamedSections: {
        ...state.streamedSections,
        [section]: state.streamTokens,
      },
      streamTokens: '',
    })),

  resetStream: () =>
    set({
      isStreaming: false,
      currentSection: null,
      streamedSections: {},
      streamTokens: '',
    }),

  prdList: [],
  setPRDList: (list) => set({ prdList: list }),

  updatePRDInList: (id, updates) =>
    set((state) => ({
      prdList: state.prdList.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      ),
      currentPRD:
        state.currentPRD?.id === id
          ? { ...state.currentPRD, ...updates }
          : state.currentPRD,
    })),

  removePRDFromList: (id) =>
    set((state) => ({
      prdList: state.prdList.filter((p) => p.id !== id),
    })),

  updateStatus: (status) => {
    const { currentPRD } = get();
    if (currentPRD) {
      set({ currentPRD: { ...currentPRD, status } });
    }
  },
}));
