// Shared constants: tool palettes, default tools, roles, tracking tunables.

// Each palette: fill (tag/tile background), text (tag text), chart (bars/dots).
export const PALETTES = {
  lilac: { name: 'Lilac', fill: '#EFEAFD', text: '#6A4FD0', chart: '#B7A5F5', dark: '#7A6CD6' },
  sage: { name: 'Sage', fill: '#E6F4EC', text: '#2F7D55', chart: '#9BD3B2', dark: '#4F9C77' },
  sky: { name: 'Sky', fill: '#E5EFFD', text: '#2F66B8', chart: '#9DBFF2', dark: '#5A87CC' },
  apricot: { name: 'Apricot', fill: '#FDEDE3', text: '#B8531F', chart: '#F5B895', dark: '#C27F5C' },
  rose: { name: 'Rose', fill: '#FCE8F0', text: '#B23A6B', chart: '#F2A7C4', dark: '#B9668A' },
  teal: { name: 'Teal', fill: '#E2F5F4', text: '#1F7A75', chart: '#8FD3CF', dark: '#3F9893' },
  sun: { name: 'Sun', fill: '#FCF4DC', text: '#8A6A12', chart: '#EED27A', dark: '#B39A45' },
  slate: { name: 'Slate', fill: '#ECEEF3', text: '#4A5468', chart: '#B4BBCB', dark: '#7A8296' },
};

// Palettes handed out to custom tools, in order.
export const CUSTOM_PALETTE_ORDER = ['rose', 'teal', 'sun', 'slate', 'lilac', 'sage', 'sky', 'apricot'];

// "Other" is used for manual entries not tied to a tracked tool.
export const OTHER_TOOL = { id: 'other', name: 'Other', short: 'Other', domains: [], palette: 'slate', enabled: true, builtin: true, virtual: true };

export const DEFAULT_TOOLS = [
  { id: 'figma', name: 'Figma', short: 'Figma', domains: ['figma.com'], palette: 'lilac', enabled: true, builtin: true, home: 'https://www.figma.com/files' },
  { id: 'meet', name: 'Google Meet', short: 'Meet', domains: ['meet.google.com'], palette: 'sage', enabled: true, builtin: true, home: 'https://meet.google.com/' },
  { id: 'docs', name: 'Google Docs', short: 'Docs', domains: ['docs.google.com'], palette: 'sky', enabled: true, builtin: true, home: 'https://docs.google.com/document/' },
  { id: 'claude', name: 'Claude', short: 'Claude', domains: ['claude.ai'], palette: 'apricot', enabled: true, builtin: true, home: 'https://claude.ai/' },
];

// One-click suggestions in "Add a tool". A domain with a path (docs.google.com/spreadsheets)
// is more specific than docs.google.com, so it takes those tabs over from Google Docs.
export const SUGGESTED_TOOLS = [
  { name: 'Vacation Tracker', domain: 'vacationtracker.io' },
  { name: 'Google Drive', domain: 'drive.google.com' },
  { name: 'Google Search', domain: 'google.com/search' },
  { name: 'Gmail', domain: 'mail.google.com' },
  { name: 'Google Calendar', domain: 'calendar.google.com' },
  { name: 'Google Sheets', domain: 'docs.google.com/spreadsheets' },
  { name: 'Google Slides', domain: 'docs.google.com/presentation' },
  { name: 'ClickUp', domain: 'app.clickup.com' },
  { name: 'Notion', domain: 'notion.so' },
  { name: 'Slack', domain: 'app.slack.com' },
  { name: 'GitHub', domain: 'github.com' },
  { name: 'Canva', domain: 'canva.com' },
  { name: 'Miro', domain: 'miro.com' },
];

export const DEFAULT_WORK_HOURS = {
  start: '08:00',
  end: '17:00',
  lunchStart: '13:00',
  lunchEnd: '14:00',
  days: [1, 2, 3, 4, 5], // 0 = Sunday … 6 = Saturday
  lunchIsOvertime: false,
};

export const DEFAULT_NUDGES = {
  where: 'tab', // 'tab': a card inside the page you're on · 'system': OS notifications
  breakEnabled: true,
  breakMinutes: 90, // continuous focus before suggesting a break
  water: true,
  waterMinutes: 45,
  lunch: true,
  overtime: true,
};

export const PROJECT_PALETTES = ['lilac', 'teal', 'apricot', 'sky', 'rose', 'sage', 'sun', 'slate'];

export const DEFAULT_END_OF_DAY = {
  enabled: true,
  time: '17:30',
  snoozeMinutes: 30,
};

export const ROLES = [
  { id: 'designer', label: 'UI/UX Designer' },
  { id: 'developer', label: 'Developer' },
  { id: 'pm', label: 'Project Manager' },
  { id: 'marketer', label: 'Marketer' },
  { id: 'other', label: 'Other' },
];

export const DEFAULT_SETTINGS = {
  onboarded: false,
  name: '',
  role: 'designer',
  photo: '',
  theme: 'light',
  autoStart: true, // switch tracking on when Chrome opens and each new day
  idleMinutes: 2,
  meetIdleMinutes: 10,
  tools: DEFAULT_TOOLS,
  workHours: DEFAULT_WORK_HOURS,
  endOfDay: DEFAULT_END_OF_DAY,
  projects: [], // [{ id, name, palette, keywords: [], task: ClickUp task | null, archived }]
  excludes: [], // [{ id, kind: 'url' | 'title', value }] pages that never count
  leave: [], // [{ date: 'YYYY-MM-DD', kind: 'leave' | 'holiday', note }]
  holidays: [], // public holidays from Google Calendar: [{ date, name }]
  vacation: null, // Vacation Tracker iCal: { url, lastSync, error, count }
  nudges: DEFAULT_NUDGES,
  dailyGoalHours: 6,
  weeklyRecap: true,
  standup: { reminder: true, time: '08:45' },
};

// Tracking tunables.
export const MERGE_GAP_MS = 10 * 60 * 1000; // resume the same session if you return within 10 min
export const MIN_SESSION_MS = 5 * 1000; // drop tab flicks shorter than this
export const HEARTBEAT_MINUTES = 0.5; // 30s alarm
export const STALE_BEAT_MS = 2.5 * 60 * 1000; // a gap this long means sleep / crash: don't count it

// App logos shipped with the extension (public/logos), by tracked domain.
export const BRAND_LOGOS = {
  'figma.com': 'figma',
  'meet.google.com': 'meet',
  'docs.google.com': 'docs',
  'docs.google.com/document': 'docs',
  'claude.ai': 'claude',
  'mail.google.com': 'gmail',
  'calendar.google.com': 'calendar',
  'drive.google.com': 'drive',
};

export const TAGLINE = 'Track your time without thinking about it.';
