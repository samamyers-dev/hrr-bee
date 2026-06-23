// API client for HRR-Bee backend

export interface ParsedTitle {
  title: string | null;
  riddle_theme: string | null;
  guest_names: string[];
  format: 'main' | 'ad-free' | 'bonus' | 'live' | 'patreon-exclusive' | 'other';
  is_bonus: boolean;
}

export interface Episode {
  id: string;
  title: string;
  episode_number: number | null;
  description: string | null;
  pub_date: number;
  audio_url: string;
  duration: number | null;
  play_state: 'unplayed' | 'in-progress' | 'played';
  last_position: number;
  image_url: string | null;
  parsed_title: ParsedTitle | null;
}

export interface MetaOptions {
  minEpisodeNumber: number;
  maxEpisodeNumber: number;
  years: string[];
  formats: string[];
}

export type SortOption = 'unplayed-first' | 'unplayed-first-newest' | 'oldest' | 'newest';
export type FilterOption = 'all' | 'played' | 'unplayed' | 'in-progress';
export type FormatOption = 'all' | ParsedTitle['format'];

export interface AdminStatus {
  total_episodes: number;
  unplayed: number;
  in_progress: number;
  played: number;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  auth: {
    check: () =>
      request<{ authenticated: boolean; passwordRequired: boolean }>('/api/auth/check'),
    login: (password: string) =>
      request<{ success: boolean; message?: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password }),
      }),
    logout: () =>
      request<{ success: boolean }>('/api/auth/logout', { method: 'POST' }),
  },

  episodes: {
    list: (params: Record<string, string>) =>
      request<Episode[]>(`/api/episodes?${new URLSearchParams(params)}`),
    get: (id: string) =>
      request<Episode>(`/api/episodes/${id}`),
    updateProgress: (id: string, play_state: string, last_position?: number) =>
      request<{ success: boolean }>('/api/episodes/progress', {
        method: 'POST',
        body: JSON.stringify({ id, play_state, last_position }),
      }),
    bulkUpdate: (mode: string, play_state: string, start?: number, end?: number) =>
      request<{ success: boolean; updatedCount: number }>('/api/episodes/bulk-update', {
        method: 'POST',
        body: JSON.stringify({ mode, play_state, start_episode: start, end_episode: end }),
      }),
    metaOptions: () =>
      request<MetaOptions>('/api/episodes/meta-options'),
  },

  playback: {
    report: (episode_id: string, position_seconds: number, playback_speed: number) =>
      request<{ success: boolean }>('/api/playback/report', {
        method: 'POST',
        body: JSON.stringify({ episode_id, position_seconds, playback_speed }),
      }),
    position: (id: string) =>
      request<{ position_seconds: number }>(`/api/playback/position/${id}`),
  },

  preferences: {
    get: () =>
      request<Record<string, unknown>>('/api/preferences'),
    set: (key: string, value: string) =>
      request<{ success: boolean }>('/api/preferences', {
        method: 'POST',
        body: JSON.stringify({ key, value }),
      }),
  },

  admin: {
    status: () =>
      request<AdminStatus>('/api/admin/status'),
    sync: () =>
      request<{ success: boolean; total: number; added: number; synced: number }>(
        '/api/admin/sync',
        { method: 'POST' }
      ),
  },
};
