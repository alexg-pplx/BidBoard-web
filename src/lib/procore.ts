/**
 * Procore REST v1.0 API helpers.
 *
 * Uses OAuth2 client-credentials / refresh-token flow to obtain short-lived
 * access tokens.  Tokens are cached in memory and refreshed automatically.
 *
 * TODO: Move these calls to a Supabase Edge Function or backend proxy so
 *       client_secret and refresh_token are never exposed to the browser.
 */

// ── Environment helpers ────────────────────────────────────────────────────

function env(name: string): string {
  const val = import.meta.env[name] as string | undefined;
  if (!val) throw new Error(`${name} is not set`);
  return val;
}

const PROCORE_BASE = "https://app.procore.com/rest/v1.0";
const TOKEN_URL = "https://login.procore.com/oauth/token";

// ── OAuth Token Management ─────────────────────────────────────────────────

let cachedToken: string | null = null;
let tokenExpiresAt = 0; // epoch ms

/**
 * Obtain a valid Procore access token, refreshing if necessary.
 */
export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt - 30_000) {
    return cachedToken;
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: env("VITE_PROCORE_CLIENT_ID"),
    client_secret: env("VITE_PROCORE_CLIENT_SECRET"),
    refresh_token: env("VITE_PROCORE_REFRESH_TOKEN"),
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Procore token refresh failed (${res.status}): ${text}`);
  }

  const json = await res.json();

  cachedToken = json.access_token as string;
  // expires_in is seconds; convert to ms with a small safety margin
  tokenExpiresAt = Date.now() + (json.expires_in as number) * 1000;

  return cachedToken;
}

// ── Authenticated fetch wrapper ────────────────────────────────────────────

async function procoreFetch(
  path: string,
  options: RequestInit = {}
): Promise<any> {
  const token = await getAccessToken();
  const companyId = env("VITE_PROCORE_COMPANY_ID");

  const res = await fetch(`${PROCORE_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "Procore-Company-Id": companyId,
      ...(options.headers as Record<string, string>),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Procore API ${res.status} ${path}: ${text}`);
  }

  // Some endpoints return 204 No Content
  if (res.status === 204) return null;

  return res.json();
}

// ── Clone Template Project ─────────────────────────────────────────────────

export interface ClonedProject {
  id: number;
  name: string;
}

/**
 * Clone the Procore Bid Board template project.
 */
export async function cloneTemplateProject(
  projectName: string
): Promise<ClonedProject> {
  const templateId = env("VITE_PROCORE_TEMPLATE_PROJECT_ID");

  const data = await procoreFetch(`/projects/${templateId}/copy`, {
    method: "POST",
    body: JSON.stringify({
      project: {
        name: projectName,
      },
    }),
  });

  return { id: data.id, name: data.name };
}

// ── Patch Cloned Project ───────────────────────────────────────────────────

export interface PatchProjectInput {
  projectNumber: string;
  address: string;
  dueDate: string | null; // ISO date string (YYYY-MM-DD)
}

export interface PatchedProject {
  id: number;
  name: string;
  project_number: string;
  address: string;
}

/**
 * PATCH the cloned Procore project with the JobTread project number,
 * address, due date, and status "ESTIMATING".
 */
export async function patchProject(
  projectId: number,
  input: PatchProjectInput
): Promise<PatchedProject> {
  const data = await procoreFetch(`/projects/${projectId}`, {
    method: "PATCH",
    body: JSON.stringify({
      project: {
        project_number: input.projectNumber,
        address: input.address,
        estimated_completion_date: input.dueDate,
        status: "ESTIMATING",
      },
    }),
  });

  return {
    id: data.id,
    name: data.name,
    project_number: data.project_number,
    address: data.address,
  };
}
