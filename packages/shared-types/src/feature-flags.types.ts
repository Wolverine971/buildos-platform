// packages/shared-types/src/feature-flags.types.ts

export type FeatureName = "time_play" | "future_feature";

export interface FeatureFlag {
  id: string;
  user_id: string;
  feature_name: FeatureName;
  enabled: boolean;
  enabled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FeatureFlagCheck {
  feature_name: FeatureName;
  enabled: boolean;
}
