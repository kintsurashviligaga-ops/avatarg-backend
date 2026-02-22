export type RoutingStep = {
  service: string;
  action: string;
};

export type RoutingPlan = {
  intent: string;
  confidence: number;
  steps: RoutingStep[];
};

export type RouterInput = {
  waId: string;
  text: string;
  locale?: string | null;
  metadata?: Record<string, unknown>;
};

function includesAny(text: string, variants: string[]): boolean {
  return variants.some((variant) => text.includes(variant));
}

export function buildRoutingPlan(input: RouterInput): RoutingPlan {
  const normalized = String(input.text || '').trim().toLowerCase();

  if (includesAny(normalized, ['ვიდეო რეკლამა', 'video ad', 'ვიდეო'])) {
    return {
      intent: 'video_ad',
      confidence: 0.92,
      steps: [
        { service: 'text-intelligence', action: 'generate_script' },
        { service: 'text-intelligence', action: 'localize_georgian' },
        { service: 'voice-lab', action: 'generate_voiceover' },
        { service: 'visual-intelligence', action: 'collect_visuals' },
        { service: 'video-studio', action: 'render_video' },
      ],
    };
  }

  if (includesAny(normalized, ['მუსიკა', 'song', 'music'])) {
    return {
      intent: 'music_generation',
      confidence: 0.9,
      steps: [{ service: 'music-studio', action: 'generate_track' }],
    };
  }

  if (includesAny(normalized, ['სურათი', 'image', 'photo'])) {
    return {
      intent: 'image_generation',
      confidence: 0.86,
      steps: [{ service: 'visual-intelligence', action: 'generate_image' }],
    };
  }

  if (includesAny(normalized, ['ავატარი', 'avatar'])) {
    return {
      intent: 'avatar_build',
      confidence: 0.88,
      steps: [{ service: 'avatar-builder', action: 'build_avatar' }],
    };
  }

  if (includesAny(normalized, ['ბიზნესი', 'შოპი', 'shop', 'marketplace'])) {
    return {
      intent: 'commerce_flow',
      confidence: 0.82,
      steps: [
        { service: 'business-agent', action: 'analyze_business_need' },
        { service: 'marketplace', action: 'suggest_commerce_setup' },
      ],
    };
  }

  return {
    intent: 'general_help',
    confidence: 0.6,
    steps: [{ service: 'business-agent', action: 'respond_general' }],
  };
}