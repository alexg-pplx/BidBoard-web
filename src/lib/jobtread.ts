/**
 * JobTread Pave API helpers.
 *
 * All mutations hit the single Pave endpoint with GraphQL-style bodies.
 *
 * TODO: Move these calls to a Supabase Edge Function or backend proxy so the
 *       API key is never exposed to the browser.
 */

const PAVE_URL = "https://api.jobtread.com/pave";

function apiKey(): string {
  const key = import.meta.env.VITE_JOBTREAD_API_KEY as string | undefined;
  if (!key) throw new Error("VITE_JOBTREAD_API_KEY is not set");
  return key;
}

async function pave<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(PAVE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`JobTread API ${res.status}: ${text}`);
  }

  const json = await res.json();

  if (json.errors?.length) {
    throw new Error(
      `JobTread GraphQL error: ${json.errors.map((e: any) => e.message).join("; ")}`
    );
  }

  return json.data as T;
}

// ── Create Customer Account ────────────────────────────────────────────────

export interface CreatedAccount {
  id: string;
  name: string;
}

const CREATE_ACCOUNT_MUTATION = `
  mutation CreateAccount($input: CreateAccountInput!) {
    createAccount(input: $input) {
      account {
        id
        name
      }
    }
  }
`;

export async function createCustomerAccount(
  customerName: string
): Promise<CreatedAccount> {
  const data = await pave<{
    createAccount: { account: CreatedAccount };
  }>(CREATE_ACCOUNT_MUTATION, {
    input: {
      name: customerName,
      types: ["CUSTOMER"],
    },
  });

  return data.createAccount.account;
}

// ── Create Location (parseAddress enabled) ─────────────────────────────────

export interface CreatedLocation {
  id: string;
  name: string;
  address: {
    line1: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  } | null;
}

const CREATE_LOCATION_MUTATION = `
  mutation CreateLocation($input: CreateLocationInput!) {
    createLocation(input: $input) {
      location {
        id
        name
        address {
          line1
          city
          state
          zip
        }
      }
    }
  }
`;

export async function createLocation(
  addressText: string
): Promise<CreatedLocation> {
  const data = await pave<{
    createLocation: { location: CreatedLocation };
  }>(CREATE_LOCATION_MUTATION, {
    input: {
      name: addressText,
      parseAddress: true,
    },
  });

  return data.createLocation.location;
}

// ── Create Job (name truncated to 30 chars) ────────────────────────────────

export interface CreatedJob {
  id: string;
  name: string;
  number: string;
}

const CREATE_JOB_MUTATION = `
  mutation CreateJob($input: CreateJobInput!) {
    createJob(input: $input) {
      job {
        id
        name
        number
      }
    }
  }
`;

export async function createJob(
  projectName: string,
  accountId: string,
  locationId: string
): Promise<CreatedJob> {
  const truncatedName = projectName.slice(0, 30);

  const data = await pave<{
    createJob: { job: CreatedJob };
  }>(CREATE_JOB_MUTATION, {
    input: {
      name: truncatedName,
      accountId,
      locationId,
    },
  });

  return data.createJob.job;
}
