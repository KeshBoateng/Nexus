import type { Health } from '../../lib/projectHealth';

export const HEALTH_STYLE: Record<Health, { label: string; cls: string }> = {
  on_track: { label: 'On track', cls: 'text-success' },
  at_risk: { label: 'At risk', cls: 'text-accent' },
  off_track: { label: 'Off track', cls: 'text-danger' },
  closed: { label: 'Closed', cls: 'text-text-faint' },
};
