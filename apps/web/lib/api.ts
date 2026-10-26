const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
  } catch {
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
