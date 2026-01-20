export interface ProjectInput {
  userId: string;
  userPrompt: string;
  brandContext?: Record<string, unknown>;
}

export interface OrchestrationResult {
  success: boolean;
  jobId: string;
  correlationId: string;
  error?: string;
}

export interface JobStatus {
  jobId: string;
  status: 'queued' | 'running' | 'waiting_provider' | 'completed' | 'failed' | 'canceled';
  progress: number;
  currentStep?: string;
  shotstack?: {
    renderId: string;
    timelineJson: any;
    videoUrl?: string;
  };
  error?: {
    code: string;
    message: string;
  };
}
