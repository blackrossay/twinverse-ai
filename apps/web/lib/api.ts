const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const TOKEN_KEY = "twinverse_token";
export const getToken = () =>
  typeof window === "undefined" ? null : window.localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string | null) => {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
};

export type User = { id: string; email: string; name: string; created_at: string };
export const signup = (body: { email: string; password: string; name?: string }) =>
  api<{ token: string; user: User }>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify(body),
  });
export const login = (body: { email: string; password: string }) =>
  api<{ token: string; user: User }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
  });
export const getMe = () => api<User>("/api/auth/me");

export class ApiError extends Error {
  status: number;
  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
  }
}

const REQUEST_TIMEOUT_MS = 120_000;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  try {
    const token = getToken();
    res = await fetch(`${BASE}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...init,
      signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    if (e instanceof DOMException && e.name === "TimeoutError") {
      throw new ApiError(0, "Request timed out — the backend may be busy rendering.");
    }
    throw new ApiError(0, `API unreachable at ${BASE} — is the backend running?`);
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail =
      typeof body?.detail === "string" ? body.detail : `Request failed (${res.status})`;
    throw new ApiError(res.status, detail);
  }
  return body as T;
}

export type Health = {
  status: string;
  service: string;
  version: string;
  model_mode: "live" | "fixture";
  model: string;
  model_api_configured: boolean;
};

export type Fact = { id: string; statement: string; category: string };
export type Hypothesis = { id: string; statement: string; confidence: number; basis: string };
export type Provenance = { field: string; source: string; detail: string; at: string };

export type Twin = {
  id: string;
  name: string;
  profile_type: string;
  current_version: number;
  created_at: string;
  updated_at: string;
};

export type TwinDetail = Twin & {
  version: number;
  payload: {
    verified_facts: Fact[];
    skills: string[];
    goals: string[];
    constraints: string[];
    behavioral_hypotheses: Hypothesis[];
    communication_style: Record<string, string>;
    consent: Record<string, unknown>;
    bio: string;
    provenance: Provenance[];
  };
};

export const getHealth = () => api<Health>("/api/health");
export const listTwins = () => api<Twin[]>("/api/twins");
export const getTwin = (id: string, version?: number) =>
  api<TwinDetail>(`/api/twins/${id}${version ? `?version=${version}` : ""}`);
export const listVersions = (id: string) => api<number[]>(`/api/twins/${id}/versions`);
export const seedTwins = () =>
  api<TwinDetail[]>("/api/twins/seed", { method: "POST" });
export const createTwin = (body: { name: string; bio: string }) =>
  api<TwinDetail>("/api/twins", { method: "POST", body: JSON.stringify(body) });
export const deleteTwin = (id: string) =>
  api<void>(`/api/twins/${id}`, { method: "DELETE" });

export type ScenarioTemplate = {
  template_id: string;
  type: string;
  title: string;
  context: string;
  objective: string;
  constraints: string[];
  variables: Record<string, string>;
  counterpart: { name: string; role: string; attitude: string };
};

export type ScenarioResultView = {
  scenario_id: string;
  spec: {
    template_id: string;
    title: string;
    context: string;
    objective: string;
    constraints: string[];
    variables: Record<string, string>;
    counterpart: { name: string; role: string; attitude: string };
  };
  status: "running" | "done" | "failed";
  output: {
    response_text: string;
    decisions: { decision: string; rationale: string }[];
    assumptions: string[];
    identity_facts_used: string[];
    contradictions: { claim: string; issue: string }[];
    variables_noted: Record<string, string>;
  } | null;
  error: string;
  model: string;
  latency_ms: number;
};

export type SimulationRun = {
  id: string;
  twin_id: string;
  identity_version: number;
  status: "running" | "done" | "partial" | "failed";
  parent_run_id: string;
  created_at: string;
  scenarios: ScenarioResultView[];
};

export const listTemplates = () => api<ScenarioTemplate[]>("/api/scenarios/templates");
export const launchRun = (body: {
  twin_id: string;
  version?: number;
  scenarios: { template_id: string; variables?: Record<string, string> }[];
}) => api<SimulationRun>("/api/simulations", { method: "POST", body: JSON.stringify(body) });
export const getRun = (id: string) => api<SimulationRun>(`/api/simulations/${id}`);
export const listRuns = (twin_id?: string) =>
  api<SimulationRun[]>(`/api/simulations${twin_id ? `?twin_id=${twin_id}` : ""}`);

export type DimensionScore = { score: number; evidence: string[]; notes: string };
export type Comparison = {
  run_id: string;
  twin_id: string;
  deterministic: {
    scenario_id: string;
    checks_passed: number;
    checks_total: number;
    details: { name: string; passed: boolean; detail: string }[];
  }[];
  evaluations: {
    scenario_id: string;
    template_id: string;
    evaluated: boolean;
    skip_reason: string;
    identity_consistency: DimensionScore | null;
    scenario_effectiveness: DimensionScore | null;
    adaptation: DimensionScore | null;
  }[];
  summary: string;
  model: string;
};

export const getComparison = (id: string) =>
  api<Comparison>(`/api/simulations/${id}/comparison`);

export const apiBase = () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
export const twinImageUrl = (id: string, cacheBuster = 0) =>
  `${apiBase()}/api/twins/${id}/image?cb=${cacheBuster}`;
export const createImage = (id: string) =>
  api<{ twin_id: string; url: string; bytes: number }>(`/api/twins/${id}/image`, {
    method: "POST",
  });

export type AvatarStatus = {
  configured: boolean;
  voice_ready: boolean;
  lipsync_ready: boolean;
  likeness_present: boolean;
  device: string;
  missing: string[];
  lipsync_note: string;
};

export type TalkingVerdict = {
  id: string;
  run_id: string;
  provider: string;
  provider_job_id: string;
  status: "queued" | "rendering" | "done" | "failed";
  render_mode: "portrait" | "lipsync";
  script: string;
  video_url: string;
  error: string;
};

export const getAvatarStatus = () => api<AvatarStatus>("/api/avatar/status");
export const requestTalkingVerdict = (id: string) =>
  api<TalkingVerdict>(`/api/simulations/${id}/talking-verdict`, { method: "POST" });
export const getTalkingVerdict = (id: string) =>
  api<TalkingVerdict>(`/api/simulations/${id}/talking-verdict`);
export const deleteLikeness = () =>
  api<AvatarStatus>("/api/avatar/likeness", { method: "DELETE" });

export async function uploadLikeness(photo: File, voice: File): Promise<AvatarStatus> {
  const form = new FormData();
  form.append("photo", photo);
  form.append("voice", voice);
  form.append("consent", "true");
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/avatar/likeness`, { method: "POST", body: form });
  } catch {
    throw new ApiError(0, `API unreachable at ${BASE} — is the backend running?`);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail =
      typeof body?.detail === "string" ? body.detail : `Request failed (${res.status})`;
    throw new ApiError(res.status, detail);
  }
  return body as AvatarStatus;
}

export type MediaStatus = "idle" | "queued" | "rendering" | "done" | "failed";

export type ConversationTurn = {
  id: string;
  role: "user" | "twin";
  text: string;
  created_at: string;
  model: string;
  latency_ms: number;
  fixture: boolean;
  facts_used: string[];
  voice_status: MediaStatus;
  voice_url: string;
  video_status: MediaStatus;
  video_url: string;
  render_mode: string;
  media_error: string;
};

export type Conversation = {
  id: string;
  twin_id: string;
  identity_version: number;
  title: string;
  created_at: string;
  updated_at: string;
  turns: ConversationTurn[];
};

export const createConversation = (twinId: string) =>
  api<Conversation>(`/api/twins/${twinId}/conversations`, {
    method: "POST",
    body: JSON.stringify({}),
  });
export const listConversations = (twinId: string) =>
  api<Conversation[]>(`/api/twins/${twinId}/conversations`);
export const getConversation = (id: string) => api<Conversation>(`/api/conversations/${id}`);
export const deleteConversation = (id: string) =>
  api<void>(`/api/conversations/${id}`, { method: "DELETE" });
export const postTurn = (sessionId: string, message: string) =>
  api<ConversationTurn>(`/api/conversations/${sessionId}/turns`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
export const requestTurnVoice = (turnId: string) =>
  api<ConversationTurn>(`/api/conversations/turns/${turnId}/voice`, { method: "POST" });
export const requestTurnVideo = (turnId: string) =>
  api<ConversationTurn>(`/api/conversations/turns/${turnId}/video`, { method: "POST" });

export type LiveMessage = {
  id: string;
  kind: "chat" | "point" | "system";
  platform: string;
  username: string;
  message: string;
  priority: boolean;
  reply: string;
  created_at: string;
  model: string;
  latency_ms: number;
  fixture: boolean;
  voice_status: MediaStatus;
  voice_url: string;
  video_status: MediaStatus;
  video_url: string;
  render_mode: string;
  media_error: string;
};

export type LiveSession = {
  id: string;
  twin_id: string;
  identity_version: number;
  title: string;
  mode: string;
  platforms: string[];
  status: "live" | "ended";
  agenda: { id: string; text: string; done: boolean }[];
  current_point: number;
  stream_status: "idle" | "publishing" | "stopped" | "error";
  youtube_configured: boolean;
  created_at: string;
  ended_at: string | null;
  messages: LiveMessage[];
};

export const createLiveSession = (
  twinId: string,
  body: { title?: string; mode?: string; platforms?: string[]; agenda?: string[] },
) =>
  api<LiveSession>(`/api/twins/${twinId}/live-sessions`, {
    method: "POST",
    body: JSON.stringify(body),
  });
export const listLiveSessions = (twinId: string) =>
  api<LiveSession[]>(`/api/twins/${twinId}/live-sessions`);
export const getLiveSession = (id: string) => api<LiveSession>(`/api/live/${id}`);
export const endLiveSession = (id: string) =>
  api<LiveSession>(`/api/live/${id}/end`, { method: "POST" });
export const addAgendaPoint = (id: string, text: string) =>
  api<LiveSession>(`/api/live/${id}/agenda`, { method: "POST", body: JSON.stringify({ text }) });
export const advanceLive = (id: string) =>
  api<LiveMessage>(`/api/live/${id}/advance`, { method: "POST" });
export const postLiveChat = (
  id: string,
  body: { platform: string; username: string; message: string; priority?: boolean },
) => api<LiveMessage>(`/api/live/${id}/chat`, { method: "POST", body: JSON.stringify(body) });
export type LiveDestination = { configured: boolean; rtmp_url: string; key_hint: string; platform: string };
export const getLiveDestination = (id: string) =>
  api<LiveDestination>(`/api/live/${id}/destination`);
export const setLiveDestination = (id: string, rtmp_url: string, stream_key: string) =>
  api<LiveDestination>(`/api/live/${id}/destination`, {
    method: "POST",
    body: JSON.stringify({ rtmp_url, stream_key }),
  });
export const publishLive = (id: string) =>
  api<LiveSession>(`/api/live/${id}/publish`, { method: "POST" });
export const unpublishLive = (id: string) =>
  api<LiveSession>(`/api/live/${id}/unpublish`, { method: "POST" });
export const requestLiveVoice = (msgId: string) =>
  api<LiveMessage>(`/api/live/messages/${msgId}/voice`, { method: "POST" });
export const requestLiveVideo = (msgId: string) =>
  api<LiveMessage>(`/api/live/messages/${msgId}/video`, { method: "POST" });
export const likenessPhotoUrl = () => `${apiBase()}/api/avatar/likeness/photo`;

export type InferenceSettings = {
  provider: string;
  inference_url: string;
  token_hint: string;
  ready: boolean;
  missing: string[];
};
export const getInferenceSettings = () => api<InferenceSettings>("/api/settings/inference");
export const setInferenceSettings = (body: {
  provider: string;
  inference_url: string;
  inference_token?: string;
}) =>
  api<InferenceSettings>("/api/settings/inference", {
    method: "PUT",
    body: JSON.stringify(body),
  });
export const likenessPhotoSrc = (cacheBuster = 0) =>
  `${apiBase()}/api/avatar/likeness/photo?cb=${cacheBuster}`;

export const resetDemo = () =>
  api<TwinDetail[]>("/api/demo/reset", { method: "POST" });

export const rerunRun = (
  id: string,
  body: {
    scenario_ids?: string[];
    variables?: Record<string, Record<string, string>>;
    objective_overrides?: Record<string, string>;
    context_overrides?: Record<string, string>;
  },
) => api<SimulationRun>(`/api/simulations/${id}/rerun`, { method: "POST", body: JSON.stringify(body) });
