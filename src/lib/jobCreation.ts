/**
 * Orchestrates automatic job creation when a bid card moves to
 * "Accepted / Needs Takeoff".
 *
 * Calls the JobTread Pave API and Procore REST API in strict sequence:
 *   1. Create a customer account       (JobTread)
 *   2. Create a location (parseAddress) (JobTread)
 *   3. Create a job (name ≤ 30 chars)   (JobTread)
 *   4. Clone template project           (Procore)
 *   5. PATCH cloned project             (Procore)
 *
 * TODO: Move this entire flow to a Supabase Edge Function or backend
 *       so secrets stay server-side.
 */

import {
  createCustomerAccount,
  createLocation,
  createJob,
  type CreatedAccount,
  type CreatedLocation,
  type CreatedJob,
} from "./jobtread";

import {
  cloneTemplateProject,
  patchProject,
  type ClonedProject,
  type PatchedProject,
} from "./procore";

// ── Types ──────────────────────────────────────────────────────────────────

export type JobCreationStep =
  | "idle"
  | "creating_customer"
  | "creating_location"
  | "creating_job"
  | "cloning_procore_project"
  | "patching_procore_project"
  | "done"
  | "error";

export interface JobCreationProgress {
  step: JobCreationStep;
  message: string;
}

export interface BidCardData {
  /** Display name of the project / customer. */
  projectName: string;
  /** Address text — fed into JobTread's parseAddress. */
  address: string;
  /** Due date in ISO format (YYYY-MM-DD) or null. */
  dueDate: string | null;
}

export interface JobCreationResult {
  account: CreatedAccount;
  location: CreatedLocation;
  job: CreatedJob;
  procoreProject: ClonedProject;
  patchedProject: PatchedProject;
}

// ── Orchestrator ───────────────────────────────────────────────────────────

/**
 * Run the full job-creation pipeline.
 *
 * @param card      Data from the bid card being accepted.
 * @param onProgress Callback fired before each step so the UI can show progress.
 * @returns         Aggregated results from every API call.
 */
export async function executeJobCreation(
  card: BidCardData,
  onProgress: (p: JobCreationProgress) => void
): Promise<JobCreationResult> {
  // Step 1 — Create customer account in JobTread
  onProgress({
    step: "creating_customer",
    message: `Creating customer account "${card.projectName}" in JobTread…`,
  });
  const account = await createCustomerAccount(card.projectName);

  // Step 2 — Create location with parseAddress
  onProgress({
    step: "creating_location",
    message: `Creating location "${card.address}" in JobTread (parseAddress)…`,
  });
  const location = await createLocation(card.address);

  // Step 3 — Create job (name truncated to 30 chars)
  onProgress({
    step: "creating_job",
    message: `Creating job "${card.projectName.slice(0, 30)}" in JobTread…`,
  });
  const job = await createJob(card.projectName, account.id, location.id);

  // Step 4 — Clone Procore Bid Board template project
  onProgress({
    step: "cloning_procore_project",
    message: `Cloning Procore template project as "${card.projectName}"…`,
  });
  const procoreProject = await cloneTemplateProject(card.projectName);

  // Build a formatted address string from the parsed location
  const formattedAddress = formatAddress(location);

  // Step 5 — PATCH cloned project with JobTread data
  onProgress({
    step: "patching_procore_project",
    message: `Updating Procore project #${procoreProject.id} with JobTread data…`,
  });
  const patchedProject = await patchProject(procoreProject.id, {
    projectNumber: job.number,
    address: formattedAddress,
    dueDate: card.dueDate,
  });

  onProgress({
    step: "done",
    message: "Job creation complete.",
  });

  return { account, location, job, procoreProject, patchedProject };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatAddress(loc: CreatedLocation): string {
  if (!loc.address) return loc.name;

  const parts = [
    loc.address.line1,
    loc.address.city,
    loc.address.state,
    loc.address.zip,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : loc.name;
}
