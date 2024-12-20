export const MESSAGE_TYPES = {
  TAB_ACTION: 'TAB_ACTION',
  RULE_ACTION: 'RULE_ACTION',
  STATE_SYNC: 'STATE_SYNC',
  STATE_UPDATE: 'STATE_UPDATE'
};

export const TAB_STATES = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  ARCHIVED: 'ARCHIVED'
};

export const CONFIG = {
  RETRY: {
    MAX_ATTEMPTS: 3,
    DELAYS: [1000, 2000, 4000]
  }
};
