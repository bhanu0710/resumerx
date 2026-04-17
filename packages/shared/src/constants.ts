// centralized constants so magic numbers don't scatter across files

export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024; // 5MB
export const UPLOAD_ALLOWED_TYPES = ['application/pdf'] as const;
export const UPLOAD_URL_TTL_SECONDS = 300; // 5 min

export const ARTIFACT_TTL_HOURS = 24;

export const JD_MIN_LENGTH = 50;
export const JD_MAX_LENGTH = 20000;

export const RATE_LIMITS = {
  analyze: { requests: 5, window: '1h' as const },
  rewrite: { requests: 3, window: '1h' as const },
  upload: { requests: 10, window: '1h' as const },
};

export const REWRITE_MAX_BULLETS_PER_REQUEST = 40;

// target length drift — a rewrite can't stretch more than this many percent from the original
export const REWRITE_LENGTH_DRIFT_MAX = 0.2;
