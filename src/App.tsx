import { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase";
import {
  executeJobCreation,
  type JobCreationProgress,
  type JobCreationResult,
  type BidCardData,
} from "./lib/jobCreation";

type BidStatus =
  | "New Lead"
  | "Bidding"
  | "Accepted / Needs Takeoff"
  | "In Progress"
  | "Complete"
  | "Lost";

const BID_STATUSES: BidStatus[] = [
  "New Lead",
  "Bidding",
  "Accepted / Needs Takeoff",
  "In Progress",
  "Complete",
  "Lost",
];

const BID_STATUS_COLORS: Record<BidStatus, string> = {
  "New Lead": "#6c757d",
  "Bidding": "#0d6efd",
  "Accepted / Needs Takeoff": "#198754",
  "In Progress": "#fd7e14",
  "Complete": "#20c997",
  "Lost": "#dc3545",
};

type Project = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  owner_id: string;
  created_at: string;
  bid_status: BidStatus | null;
  address: string | null;
  jobtread_job_id: string | null;
  jobtread_job_number: string | null;
  procore_project_id: number | null;
};

type Trade = {
  id: string;
  project_id: string;
  name: string;
  created_at: string;
};

type VendorEstimate = {
  id: string;
  trade_id: string;
  vendor_name: string;
  estimate_amount: number;
  notes: string | null;
  received_at: string | null;
  status: "pending" | "awarded" | "denied";
  decision_notes: string | null;
  awarded_at: string | null;
  created_at: string;
  file_path: string | null;
};

type EstimateDraft = {
  vendor_name: string;
  estimate_amount: string;
  received_at: string;
  notes: string;
  status: "pending" | "awarded" | "denied";
};

type AuthMode = "signin" | "signup";
type ShareRole = "viewer" | "editor";
type ProjectRole = "owner" | "editor" | "viewer";

type ProjectMember = {
  project_id: string;
  user_id: string;
  role: ProjectRole;
  profiles?: {
    email: string | null;
  } | null;
};

const COMMON_TRADES = [
  "Demolition",
  "Sitework",
  "Concrete",
  "Masonry",
  "Structural Steel",
  "Framing",
  "Roofing",
  "Siding",
  "Windows",
  "Doors / Hardware",
  "Drywall",
  "Painting",
  "Flooring",
  "Ceilings",
  "Millwork",
  "Electrical",
  "Plumbing",
  "HVAC",
  "Fire Protection",
  "Insulation",
  "Landscaping",
  "Final Cleaning",
];

const inputStyle: React.CSSProperties = {
  color: "black",
  backgroundColor: "white",
  border: "1px solid #999",
};

const tableHeaderStyle: React.CSSProperties = {
  textAlign: "left",
  borderBottom: "2px solid black",
  padding: 8,
};

const tableCellStyle: React.CSSProperties = {
  padding: 8,
  borderBottom: "1px solid #ddd",
  color: "black",
  verticalAlign: "top",
};

export default function App() {
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const [projectName, setProjectName] = useState("");
  const [projectStartDate, setProjectStartDate] = useState("");
  const [projectEndDate, setProjectEndDate] = useState("");

  const [trades, setTrades] = useState<Trade[]>([]);
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);

  const [allProjectEstimates, setAllProjectEstimates] = useState<VendorEstimate[]>([]);
  const [editingEstimates, setEditingEstimates] = useState<Record<string, EstimateDraft>>({});

  const [vendorName, setVendorName] = useState("");
  const [estimateAmount, setEstimateAmount] = useState("");
  const [estimateNotes, setEstimateNotes] = useState("");
  const [receivedAt, setReceivedAt] = useState("");

  const [shareEmail, setShareEmail] = useState("");
  const [shareRole, setShareRole] = useState<ShareRole>("viewer");
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);
  const [memberRoleDrafts, setMemberRoleDrafts] = useState<Record<string, ShareRole>>({});

  // ── Job-creation state ───────────────────────────────────────────────
  const [jobCreationProgress, setJobCreationProgress] =
    useState<JobCreationProgress | null>(null);
  const [jobCreationResult, setJobCreationResult] =
    useState<JobCreationResult | null>(null);
  const [jobCreationError, setJobCreationError] = useState<string | null>(null);
  const [showAcceptConfirm, setShowAcceptConfirm] = useState<string | null>(null); // project id awaiting confirmation
  const [projectAddress, setProjectAddress] = useState(""); // address input for job creation

  useEffect(() => {
    async function loadSession() {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        setMessage(`Session error: ${error.message}`);
        return;
      }

      if (data.session?.user) {
        setUserId(data.session.user.id);
        setUserEmail(data.session.user.email ?? null);
      }
    }

    loadSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUserId(session.user.id);
        setUserEmail(session.user.email ?? null);
      } else {
        setUserId(null);
        setUserEmail(null);
        setProjects([]);
        setTrades([]);
        setAllProjectEstimates([]);
        setSelectedProjectId(null);
        setSelectedTradeId(null);
        setEditingEstimates({});
        setProjectMembers([]);
        setMemberRoleDrafts({});
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (userId) {
      loadProjects(userId);
    }
  }, [userId]);

  useEffect(() => {
    if (selectedProjectId) {
      loadTrades(selectedProjectId);
      loadProjectMembers(selectedProjectId);
    } else {
      setTrades([]);
      setSelectedTradeId(null);
      setAllProjectEstimates([]);
      setProjectMembers([]);
      setMemberRoleDrafts({});
    }
  }, [selectedProjectId]);

  useEffect(() => {
    if (trades.length > 0) {
      loadAllEstimatesForProjectTrades(trades);
      setSelectedTradeId((prev) => {
        const stillExists = trades.some((trade) => trade.id === prev);
        return stillExists ? prev : trades[0].id;
      });
    } else {
      setAllProjectEstimates([]);
      setSelectedTradeId(null);
    }
  }, [trades]);

  useEffect(() => {
    const next: Record<string, EstimateDraft> = {};
    for (const estimate of allProjectEstimates) {
      next[estimate.id] = {
        vendor_name: estimate.vendor_name,
        estimate_amount: String(estimate.estimate_amount),
        received_at: estimate.received_at ?? "",
        notes: estimate.notes ?? "",
        status: estimate.status,
      };
    }
    setEditingEstimates(next);
  }, [allProjectEstimates]);

  useEffect(() => {
    const next: Record<string, ShareRole> = {};
    for (const member of projectMembers) {
      if (member.role === "viewer" || member.role === "editor") {
        next[member.user_id] = member.role;
      }
    }
    setMemberRoleDrafts(next);
  }, [projectMembers]);

  async function loadProjects(currentUserId: string) {
    const { data: ownedProjects, error: ownedError } = await supabase
      .from("projects")
      .select("*")
      .eq("owner_id", currentUserId)
      .order("created_at", { ascending: false });

    if (ownedError) {
      setMessage(`Load owned projects error: ${ownedError.message}`);
      return;
    }

    const { data: memberships, error: memberError } = await supabase
      .from("project_members")
      .select("project_id")
      .eq("user_id", currentUserId);

    if (memberError) {
      setMessage(`Load memberships error: ${memberError.message}`);
      return;
    }

    const sharedProjectIds = (memberships || [])
      .map((m) => m.project_id)
      .filter((id) => id && !(ownedProjects || []).some((p) => p.id === id));

    let sharedProjects: Project[] = [];

    if (sharedProjectIds.length > 0) {
      const { data: sharedData, error: sharedError } = await supabase
        .from("projects")
        .select("*")
        .in("id", sharedProjectIds)
        .order("created_at", { ascending: false });

      if (sharedError) {
        setMessage(`Load shared projects error: ${sharedError.message}`);
        return;
      }

      sharedProjects = (sharedData || []) as Project[];
    }

    const combined = [...(ownedProjects || []), ...sharedProjects];

    combined.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    setProjects(combined);

    if (combined.length > 0) {
      setSelectedProjectId((prev) => prev ?? combined[0].id);
    } else {
      setSelectedProjectId(null);
    }
  }

  async function loadTrades(projectId: string) {
    const { data, error } = await supabase
      .from("trades")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    if (error) {
      setMessage(`Load trades error: ${error.message}`);
      return;
    }

    setTrades((data || []) as Trade[]);
  }

  async function loadProjectMembers(projectId: string) {
    const { data: membersData, error: membersError } = await supabase
      .from("project_members")
      .select("project_id,user_id,role")
      .eq("project_id", projectId);

    if (membersError) {
      setMessage(`Load members error: ${membersError.message}`);
      return;
    }

    const members = (membersData || []) as ProjectMember[];

    if (members.length === 0) {
      setProjectMembers([]);
      return;
    }

    const userIds = members.map((m) => m.user_id);

    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select("id,email")
      .in("id", userIds);

    if (profilesError) {
      setMessage(`Load profiles error: ${profilesError.message}`);
      return;
    }

    const emailMap = new Map(
      (profilesData || []).map((p: any) => [p.id, p.email])
    );

    const merged = members.map((member) => ({
      ...member,
      profiles: {
        email: emailMap.get(member.user_id) || null,
      },
    }));

    setProjectMembers(merged);
  }

  async function loadAllEstimatesForProjectTrades(projectTrades: Trade[]) {
    const tradeIds = projectTrades.map((trade) => trade.id);

    if (tradeIds.length === 0) {
      setAllProjectEstimates([]);
      return;
    }

    const { data, error } = await supabase
      .from("vendor_estimates")
      .select("*")
      .in("trade_id", tradeIds)
      .order("created_at", { ascending: true });

    if (error) {
      setMessage(`Load estimates error: ${error.message}`);
      return;
    }

    setAllProjectEstimates((data || []) as VendorEstimate[]);
  }

  async function refreshCurrentProjectData() {
    if (!selectedProjectId) return;
    await loadTrades(selectedProjectId);
    await loadProjectMembers(selectedProjectId);
  }

  async function refreshAllProjects() {
    if (userId) {
      await loadProjects(userId);
    }
  }

  async function handleAuthSubmit() {
    setAuthLoading(true);
    setMessage("");

    if (!authEmail.trim() || !authPassword.trim()) {
      setMessage("Enter both email and password.");
      setAuthLoading(false);
      return;
    }

    if (authMode === "signup") {
      const { error } = await supabase.auth.signUp({
        email: authEmail.trim().toLowerCase(),
        password: authPassword,
      });

      if (error) {
        setMessage(`Sign-up error: ${error.message}`);
      } else {
        setMessage("Account created. You can now sign in.");
        setAuthMode("signin");
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail.trim().toLowerCase(),
        password: authPassword,
      });

      if (error) {
        setMessage(`Sign-in error: ${error.message}`);
      } else {
        setMessage("Signed in.");
        setAuthEmail("");
        setAuthPassword("");
      }
    }

    setAuthLoading(false);
  }

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      setMessage(`Sign-out error: ${error.message}`);
    } else {
      setMessage("Signed out.");
    }
  }

  async function handleCreateProject() {
    if (!userId || !projectName.trim()) return;

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .insert({
        name: projectName.trim(),
        start_date: projectStartDate || null,
        end_date: projectEndDate || null,
        owner_id: userId,
        bid_status: "New Lead",
      })
      .select()
      .single();

    if (projectError || !project) {
      setMessage(`Create project error: ${projectError?.message || "Unknown error"}`);
      return;
    }

    const { error: memberError } = await supabase.from("project_members").upsert({
      project_id: project.id,
      user_id: userId,
      role: "owner",
    });

    if (memberError) {
      setMessage(`Owner membership error: ${memberError.message}`);
      return;
    }

    const tradeRows = COMMON_TRADES.map((name) => ({
      project_id: project.id,
      name,
    }));

    const { error: tradesError } = await supabase.from("trades").insert(tradeRows);

    if (tradesError) {
      setMessage(`Project created, but trades failed: ${tradesError.message}`);
      await refreshAllProjects();
      setSelectedProjectId(project.id);
      return;
    }

    setProjectName("");
    setProjectStartDate("");
    setProjectEndDate("");
    setMessage("Project created with default trades.");

    await refreshAllProjects();
    setSelectedProjectId(project.id);
  }

  async function handleCreateEstimate() {
    if (!canEdit) {
      setMessage("You have viewer access and cannot make changes.");
      return;
    }

    if (!selectedTradeId || !vendorName.trim() || !estimateAmount.trim()) return;

    const amount = Number(estimateAmount);
    if (Number.isNaN(amount)) {
      setMessage("Estimate amount must be a number.");
      return;
    }

    const { error } = await supabase.from("vendor_estimates").insert({
      trade_id: selectedTradeId,
      vendor_name: vendorName.trim(),
      estimate_amount: amount,
      notes: estimateNotes.trim() || null,
      received_at: receivedAt || null,
      status: "pending",
      file_path: null,
    });

    if (error) {
      setMessage(`Create estimate error: ${error.message}`);
      return;
    }

    setVendorName("");
    setEstimateAmount("");
    setEstimateNotes("");
    setReceivedAt("");
    setMessage("Vendor estimate added.");
    await refreshCurrentProjectData();
  }

  async function handleShareProject() {
    if (!selectedProjectId || !shareEmail.trim()) return;

    if (!isOwner) {
      setMessage("Only the project owner can share this project.");
      return;
    }

    const normalizedEmail = shareEmail.trim().toLowerCase();

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id,email")
      .eq("email", normalizedEmail)
      .single();

    if (profileError || !profile) {
      setMessage("That user must create an account first.");
      return;
    }

    const { error } = await supabase.from("project_members").upsert({
      project_id: selectedProjectId,
      user_id: profile.id,
      role: shareRole,
    });

    if (error) {
      setMessage(`Share error: ${error.message}`);
      return;
    }

    setShareEmail("");
    setMessage(`Project shared with ${profile.email} as ${shareRole}.`);
    await loadProjectMembers(selectedProjectId);
    await refreshAllProjects();
  }

  async function handleUpdateMemberRole(memberUserId: string, newRole: ShareRole) {
    if (!selectedProjectId) return;

    if (!isOwner) {
      setMessage("Only the project owner can change member roles.");
      return;
    }

    const { error } = await supabase
      .from("project_members")
      .update({ role: newRole })
      .eq("project_id", selectedProjectId)
      .eq("user_id", memberUserId);

    if (error) {
      setMessage(`Update role error: ${error.message}`);
      return;
    }

    setMessage(`Member role updated to ${newRole}.`);
    await loadProjectMembers(selectedProjectId);
  }

  async function handleRemoveMember(memberUserId: string) {
    if (!selectedProjectId) return;

    if (!isOwner) {
      setMessage("Only the project owner can remove access.");
      return;
    }

    if (memberUserId === userId) {
      setMessage("You cannot remove your own owner access here.");
      return;
    }

    const { error } = await supabase
      .from("project_members")
      .delete()
      .eq("project_id", selectedProjectId)
      .eq("user_id", memberUserId);

    if (error) {
      setMessage(`Remove access error: ${error.message}`);
      return;
    }

    setMessage("Access removed.");
    await loadProjectMembers(selectedProjectId);
    await refreshAllProjects();
  }

  async function handleUploadQuote(estimateId: string, file: File | null) {
    if (!canEdit) {
      setMessage("You have viewer access and cannot make changes.");
      return;
    }

    if (!file) return;

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${estimateId}/${Date.now()}_${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("vendor-quotes")
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      setMessage(`Upload error: ${uploadError.message}`);
      return;
    }

    const { error: updateError } = await supabase
      .from("vendor_estimates")
      .update({ file_path: filePath })
      .eq("id", estimateId);

    if (updateError) {
      setMessage(`Database save error: ${updateError.message}`);
      return;
    }

    setMessage("Quote uploaded successfully.");
    await refreshCurrentProjectData();
  }

  function getQuoteUrl(filePath: string | null) {
    if (!filePath) return null;
    const { data } = supabase.storage.from("vendor-quotes").getPublicUrl(filePath);
    return data.publicUrl;
  }

  function updateEstimateDraft(
    estimateId: string,
    field: keyof EstimateDraft,
    value: string
  ) {
    setEditingEstimates((prev) => ({
      ...prev,
      [estimateId]: {
        ...prev[estimateId],
        [field]: value,
      },
    }));
  }

  async function saveEstimateRow(estimateId: string, tradeId: string) {
    if (!canEdit) {
      setMessage("You have viewer access and cannot make changes.");
      return;
    }

    const draft = editingEstimates[estimateId];
    if (!draft) return;

    const amount = Number(draft.estimate_amount);
    if (Number.isNaN(amount)) {
      setMessage("Estimate amount must be a number.");
      return;
    }

    if (draft.status === "awarded") {
      const { error: resetError } = await supabase
        .from("vendor_estimates")
        .update({
          status: "pending",
          awarded_at: null,
        })
        .eq("trade_id", tradeId)
        .eq("status", "awarded")
        .neq("id", estimateId);

      if (resetError) {
        setMessage(`Award reset error: ${resetError.message}`);
        return;
      }
    }

    const { error } = await supabase
      .from("vendor_estimates")
      .update({
        vendor_name: draft.vendor_name.trim(),
        estimate_amount: amount,
        received_at: draft.received_at || null,
        notes: draft.notes.trim() || null,
        status: draft.status,
        awarded_at: draft.status === "awarded" ? new Date().toISOString() : null,
      })
      .eq("id", estimateId);

    if (error) {
      setMessage(`Save row error: ${error.message}`);
      return;
    }

    setMessage("Estimate updated.");
    await refreshCurrentProjectData();
  }

  async function deleteEstimateRow(estimateId: string) {
    if (!canEdit) {
      setMessage("You have viewer access and cannot make changes.");
      return;
    }

    const estimate = allProjectEstimates.find((e) => e.id === estimateId);

    if (estimate?.file_path) {
      await supabase.storage.from("vendor-quotes").remove([estimate.file_path]);
    }

    const { error } = await supabase
      .from("vendor_estimates")
      .delete()
      .eq("id", estimateId);

    if (error) {
      setMessage(`Delete row error: ${error.message}`);
      return;
    }

    setMessage("Estimate deleted.");
    await refreshCurrentProjectData();
  }

  async function awardLowestForTrade(tradeId: string) {
    if (!canEdit) {
      setMessage("You have viewer access and cannot make changes.");
      return;
    }

    const estimatesForTrade = allProjectEstimates.filter(
      (estimate) => estimate.trade_id === tradeId
    );

    if (estimatesForTrade.length === 0) {
      setMessage("No estimates available to award.");
      return;
    }

    const lowest = estimatesForTrade.reduce((lowest, current) => {
      return Number(current.estimate_amount) < Number(lowest.estimate_amount)
        ? current
        : lowest;
    }, estimatesForTrade[0]);

    const { error: resetError } = await supabase
      .from("vendor_estimates")
      .update({
        status: "pending",
        awarded_at: null,
      })
      .eq("trade_id", tradeId)
      .eq("status", "awarded")
      .neq("id", lowest.id);

    if (resetError) {
      setMessage(`Award lowest reset error: ${resetError.message}`);
      return;
    }

    const { error } = await supabase
      .from("vendor_estimates")
      .update({
        status: "awarded",
        awarded_at: new Date().toISOString(),
      })
      .eq("id", lowest.id);

    if (error) {
      setMessage(`Award lowest error: ${error.message}`);
      return;
    }

    setMessage(`Awarded lowest estimate from ${lowest.vendor_name}.`);
    await refreshCurrentProjectData();
  }

  function handlePrintSummary() {
    window.print();
  }

  // ── Bid-status change handler ──────────────────────────────────────────

  async function handleBidStatusChange(projectId: string, newStatus: BidStatus) {
    // If moving to "Accepted / Needs Takeoff", show confirmation first
    if (newStatus === "Accepted / Needs Takeoff") {
      const proj = projects.find((p) => p.id === projectId);
      setProjectAddress(proj?.address || "");
      setShowAcceptConfirm(projectId);
      return;
    }

    // For all other statuses, update directly
    const { error } = await supabase
      .from("projects")
      .update({ bid_status: newStatus })
      .eq("id", projectId);

    if (error) {
      setMessage(`Status update error: ${error.message}`);
      return;
    }

    setMessage(`Status changed to "${newStatus}".`);
    await refreshAllProjects();
  }

  async function handleAcceptAndCreateJob() {
    if (!showAcceptConfirm) return;

    const project = projects.find((p) => p.id === showAcceptConfirm);
    if (!project) {
      setMessage("Project not found.");
      setShowAcceptConfirm(null);
      return;
    }

    if (!projectAddress.trim()) {
      setMessage("An address is required for job creation.");
      return;
    }

    // Close the dialog immediately
    const projectId = showAcceptConfirm;
    setShowAcceptConfirm(null);
    setJobCreationResult(null);
    setJobCreationError(null);

    const card: BidCardData = {
      projectName: project.name,
      address: projectAddress.trim(),
      dueDate: project.end_date,
    };

    try {
      const result = await executeJobCreation(card, (progress) => {
        setJobCreationProgress(progress);
      });

      setJobCreationResult(result);
      setJobCreationProgress(null);

      // Persist the status + integration IDs back to Supabase
      const { error: updateError } = await supabase
        .from("projects")
        .update({
          bid_status: "Accepted / Needs Takeoff" as BidStatus,
          address: projectAddress.trim(),
          jobtread_job_id: result.job.id,
          jobtread_job_number: result.job.number,
          procore_project_id: result.patchedProject.id,
        })
        .eq("id", projectId);

      if (updateError) {
        setMessage(
          `Job created but status save failed: ${updateError.message}`
        );
      } else {
        setMessage(
          `Job creation complete. JobTread #${result.job.number}, Procore project #${result.patchedProject.id}.`
        );
      }

      await refreshAllProjects();
    } catch (err: any) {
      setJobCreationError(err.message || "Unknown error during job creation.");
      setJobCreationProgress(null);
    }
  }

  const selectedProject =
    projects.find((project) => project.id === selectedProjectId) || null;

  const selectedTrade =
    trades.find((trade) => trade.id === selectedTradeId) || null;

  const currentMembership =
    projectMembers.find((member) => member.user_id === userId) || null;

  const currentUserRole: ProjectRole = selectedProject
    ? selectedProject.owner_id === userId
      ? "owner"
      : currentMembership?.role ?? "viewer"
    : "viewer";

  const isOwner = currentUserRole === "owner";
  const canEdit = currentUserRole === "owner" || currentUserRole === "editor";

  const currentTradeEstimates = useMemo(() => {
    if (!selectedTradeId) return [];
    return allProjectEstimates.filter((estimate) => estimate.trade_id === selectedTradeId);
  }, [allProjectEstimates, selectedTradeId]);

  const lowestEstimate = useMemo(() => {
    if (currentTradeEstimates.length === 0) return null;

    return currentTradeEstimates.reduce((lowest, current) => {
      return Number(current.estimate_amount) < Number(lowest.estimate_amount)
        ? current
        : lowest;
    }, currentTradeEstimates[0]);
  }, [currentTradeEstimates]);

  const awardedEstimate =
    currentTradeEstimates.find((estimate) => estimate.status === "awarded") || null;

  const tradeAwardMap = useMemo(() => {
    const map: Record<string, VendorEstimate> = {};

    for (const estimate of allProjectEstimates) {
      if (estimate.status === "awarded") {
        map[estimate.trade_id] = estimate;
      }
    }

    return map;
  }, [allProjectEstimates]);

  const tradeLowestMap = useMemo(() => {
    const map: Record<string, VendorEstimate> = {};

    for (const trade of trades) {
      const estimatesForTrade = allProjectEstimates.filter(
        (estimate) => estimate.trade_id === trade.id
      );

      if (estimatesForTrade.length > 0) {
        map[trade.id] = estimatesForTrade.reduce((lowest, current) => {
          return Number(current.estimate_amount) < Number(lowest.estimate_amount)
            ? current
            : lowest;
        }, estimatesForTrade[0]);
      }
    }

    return map;
  }, [allProjectEstimates, trades]);

  const summaryRows = useMemo(() => {
    return trades.map((trade) => {
      const lowest = tradeLowestMap[trade.id];
      const awarded = tradeAwardMap[trade.id];
      const difference =
        lowest && awarded
          ? Number(awarded.estimate_amount) - Number(lowest.estimate_amount)
          : null;

      return {
        tradeName: trade.name,
        lowest,
        awarded,
        difference,
      };
    });
  }, [trades, tradeLowestMap, tradeAwardMap]);

  const projectAwardedSubtotal = useMemo(() => {
    return Object.values(tradeAwardMap).reduce((sum, estimate) => {
      return sum + Number(estimate.estimate_amount);
    }, 0);
  }, [tradeAwardMap]);

  const projectLowestSubtotal = useMemo(() => {
    return Object.values(tradeLowestMap).reduce((sum, estimate) => {
      return sum + Number(estimate.estimate_amount);
    }, 0);
  }, [tradeLowestMap]);

  const projectDifferenceFromLowest = projectAwardedSubtotal - projectLowestSubtotal;
  const projectManagementFee = projectAwardedSubtotal * 0.05;
  const projectFinalTotal = projectAwardedSubtotal + projectManagementFee;

  const currentTradeDifferenceFromLowest =
    awardedEstimate && lowestEstimate
      ? Number(awardedEstimate.estimate_amount) - Number(lowestEstimate.estimate_amount)
      : 0;

  const currentTradeManagementFee = awardedEstimate
    ? Number(awardedEstimate.estimate_amount) * 0.05
    : 0;

  const currentTradeFinalTotal = awardedEstimate
    ? Number(awardedEstimate.estimate_amount) + currentTradeManagementFee
    : 0;

  if (!userEmail) {
    return (
      <div style={{ padding: 40, maxWidth: 420, color: "black", background: "white" }}>
        <h1>BidBoard</h1>
        <p>{authMode === "signin" ? "Sign in to your account" : "Create your account"}</p>

        <div style={{ display: "grid", gap: 12 }}>
          <input
            type="email"
            placeholder="Email"
            value={authEmail}
            onChange={(e) => setAuthEmail(e.target.value)}
            style={{ ...inputStyle, padding: 10 }}
          />

          <input
            type="password"
            placeholder="Password"
            value={authPassword}
            onChange={(e) => setAuthPassword(e.target.value)}
            style={{ ...inputStyle, padding: 10 }}
          />

          <button onClick={handleAuthSubmit} disabled={authLoading}>
            {authLoading
              ? "Please wait..."
              : authMode === "signin"
              ? "Sign In"
              : "Create Account"}
          </button>

          <button
            onClick={() => setAuthMode(authMode === "signin" ? "signup" : "signin")}
            type="button"
          >
            {authMode === "signin"
              ? "Need an account? Switch to Sign Up"
              : "Already have an account? Switch to Sign In"}
          </button>
        </div>

        <p style={{ marginTop: 20 }}>{message}</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 40, maxWidth: 1200, color: "black", background: "white" }}>
      <style>{`
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      <h1>BidBoard</h1>
      <p>Signed in as {userEmail}</p>
      <button className="no-print" onClick={handleSignOut}>Sign out</button>

      <hr style={{ margin: "24px 0" }} className="no-print" />

      <div className="no-print">
        <h2>Create Project</h2>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          <input
            type="text"
            placeholder="Project name"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            style={{ ...inputStyle, padding: 10, width: 220 }}
          />
          <input
            type="date"
            value={projectStartDate}
            onChange={(e) => setProjectStartDate(e.target.value)}
            style={{ ...inputStyle, padding: 10 }}
          />
          <input
            type="date"
            value={projectEndDate}
            onChange={(e) => setProjectEndDate(e.target.value)}
            style={{ ...inputStyle, padding: 10 }}
          />
          <button onClick={handleCreateProject}>Create Project</button>
        </div>

        <p style={{ marginTop: -10, marginBottom: 24 }}>
          New projects auto-create {COMMON_TRADES.length} common construction trades.
        </p>

        <h2>Your Projects</h2>
        {projects.length === 0 ? (
          <p>No projects yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 12, marginBottom: 24 }}>
            {projects.map((project) => {
              const isSelected = project.id === selectedProjectId;

              return (
                <div
                  key={project.id}
                  style={{
                    border: isSelected ? "2px solid black" : "1px solid #ccc",
                    borderRadius: 8,
                    padding: 12,
                    background: isSelected ? "#f5f5f5" : "white",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong>{project.name}</strong>
                    <span
                      style={{
                        fontSize: 11,
                        padding: "2px 8px",
                        borderRadius: 4,
                        color: "white",
                        backgroundColor:
                          BID_STATUS_COLORS[
                            (project.bid_status as BidStatus) || "New Lead"
                          ],
                      }}
                    >
                      {project.bid_status || "New Lead"}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, marginTop: 6 }}>
                    Start: {project.start_date || "N/A"}
                  </div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    End: {project.end_date || "N/A"}
                  </div>
                  {project.address && (
                    <div style={{ fontSize: 12, marginTop: 4 }}>
                      Address: {project.address}
                    </div>
                  )}
                  {project.jobtread_job_number && (
                    <div style={{ fontSize: 12, marginTop: 4, color: "#198754" }}>
                      JobTread #{project.jobtread_job_number}
                    </div>
                  )}
                  {project.procore_project_id && (
                    <div style={{ fontSize: 12, marginTop: 4, color: "#0d6efd" }}>
                      Procore Project #{project.procore_project_id}
                    </div>
                  )}
                  <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <button onClick={() => setSelectedProjectId(project.id)}>
                      {isSelected ? "Current Project" : "Open Project"}
                    </button>
                    <select
                      value={project.bid_status || "New Lead"}
                      onChange={(e) =>
                        handleBidStatusChange(
                          project.id,
                          e.target.value as BidStatus
                        )
                      }
                      style={{ ...inputStyle, padding: 4, fontSize: 12 }}
                    >
                      {BID_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <hr style={{ margin: "24px 0" }} />
      </div>

      <h2>Current Project</h2>
      {selectedProject ? (
        <>
          <p>
            <strong>{selectedProject.name}</strong>
          </p>
          <p>
            {selectedProject.start_date || "No start date"} → {selectedProject.end_date || "No end date"}
          </p>
          <p className="no-print">
            Your access: <strong>{currentUserRole}</strong>
          </p>
          <p>
            Status:{" "}
            <span
              style={{
                display: "inline-block",
                fontSize: 12,
                padding: "2px 10px",
                borderRadius: 4,
                color: "white",
                backgroundColor:
                  BID_STATUS_COLORS[
                    (selectedProject.bid_status as BidStatus) || "New Lead"
                  ],
              }}
            >
              {selectedProject.bid_status || "New Lead"}
            </span>
          </p>
          {selectedProject.jobtread_job_number && (
            <p style={{ fontSize: 13 }}>
              JobTread Job #{selectedProject.jobtread_job_number}
              {selectedProject.procore_project_id &&
                ` · Procore Project #${selectedProject.procore_project_id}`}
            </p>
          )}

          <div className="no-print" style={{ marginBottom: 20 }}>
            <button onClick={handlePrintSummary}>Print Summary</button>
          </div>

          <div
            style={{
              border: "2px solid #222",
              borderRadius: 8,
              padding: 16,
              marginBottom: 24,
              background: "#fafafa",
            }}
          >
            <h3 style={{ marginTop: 0 }}>Project Award Summary</h3>
            <p>Lowest possible subtotal: ${projectLowestSubtotal.toFixed(2)}</p>
            <p>Awarded subtotal: ${projectAwardedSubtotal.toFixed(2)}</p>
            <p>
              Difference from lowest:{" "}
              <strong>
                {projectDifferenceFromLowest >= 0 ? "+" : "-"}$
                {Math.abs(projectDifferenceFromLowest).toFixed(2)}
              </strong>
            </p>
            <p>Management fee (5%): ${projectManagementFee.toFixed(2)}</p>
            <p>
              <strong>Final project total: ${projectFinalTotal.toFixed(2)}</strong>
            </p>
          </div>

          <h3>Owner Summary</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
            <thead>
              <tr>
                <th style={tableHeaderStyle}>Trade</th>
                <th style={tableHeaderStyle}>Lowest Bid</th>
                <th style={tableHeaderStyle}>Awarded Bid</th>
                <th style={tableHeaderStyle}>Difference</th>
              </tr>
            </thead>
            <tbody>
              {summaryRows.map((row) => (
                <tr key={row.tradeName}>
                  <td style={tableCellStyle}>{row.tradeName}</td>
                  <td style={tableCellStyle}>
                    {row.lowest
                      ? `${row.lowest.vendor_name} - $${Number(row.lowest.estimate_amount).toFixed(2)}`
                      : "None"}
                  </td>
                  <td style={tableCellStyle}>
                    {row.awarded
                      ? `${row.awarded.vendor_name} - $${Number(row.awarded.estimate_amount).toFixed(2)}`
                      : "None"}
                  </td>
                  <td style={tableCellStyle}>
                    {row.difference !== null
                      ? `${row.difference >= 0 ? "+" : "-"}$${Math.abs(row.difference).toFixed(2)}`
                      : "N/A"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="no-print">
            {isOwner && (
              <>
                <h3>Share Project</h3>
                <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                  <input
                    type="email"
                    placeholder="User email"
                    value={shareEmail}
                    onChange={(e) => setShareEmail(e.target.value)}
                    style={{ ...inputStyle, padding: 10, width: 240 }}
                  />

                  <select
                    value={shareRole}
                    onChange={(e) => setShareRole(e.target.value as ShareRole)}
                    style={{ ...inputStyle, padding: 10 }}
                  >
                    <option value="viewer">viewer</option>
                    <option value="editor">editor</option>
                  </select>

                  <button onClick={handleShareProject}>Share</button>
                </div>
              </>
            )}

            <h3>Project Members</h3>
            {projectMembers.length === 0 ? (
              <p>No members found.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
                <thead>
                  <tr>
                    <th style={tableHeaderStyle}>Email</th>
                    <th style={tableHeaderStyle}>Role</th>
                    <th style={tableHeaderStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {projectMembers.map((member) => {
                    const isSelf = member.user_id === userId;
                    const memberEmail = member.profiles?.email || "Unknown";
                    const isOwnerRow = member.role === "owner";

                    return (
                      <tr key={`${member.project_id}-${member.user_id}`}>
                        <td style={tableCellStyle}>{memberEmail}</td>
                        <td style={tableCellStyle}>
                          {isOwnerRow ? (
                            "owner"
                          ) : (
                            <select
                              value={memberRoleDrafts[member.user_id] || "viewer"}
                              onChange={(e) =>
                                setMemberRoleDrafts((prev) => ({
                                  ...prev,
                                  [member.user_id]: e.target.value as ShareRole,
                                }))
                              }
                              disabled={!isOwner}
                              style={{ ...inputStyle, padding: 6 }}
                            >
                              <option value="viewer">viewer</option>
                              <option value="editor">editor</option>
                            </select>
                          )}
                        </td>
                        <td style={tableCellStyle}>
                          {isOwner && !isSelf && !isOwnerRow ? (
                            <>
                              <button
                                onClick={() =>
                                  handleUpdateMemberRole(
                                    member.user_id,
                                    memberRoleDrafts[member.user_id] || "viewer"
                                  )
                                }
                              >
                                Update Role
                              </button>
                              <button
                                onClick={() => handleRemoveMember(member.user_id)}
                                style={{ marginLeft: 8 }}
                              >
                                Remove Access
                              </button>
                            </>
                          ) : isSelf ? (
                            <span>You</span>
                          ) : (
                            <span>-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {!canEdit && (
              <div
                style={{
                  border: "1px solid #999",
                  padding: 12,
                  borderRadius: 8,
                  background: "#f8f8f8",
                  marginBottom: 20,
                }}
              >
                You have viewer access. You can review this project, but you cannot make changes.
              </div>
            )}

            <h3>Trade Summary</h3>
            {trades.length === 0 ? (
              <p>No trades yet.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
                <thead>
                  <tr>
                    <th style={tableHeaderStyle}>Trade</th>
                    <th style={tableHeaderStyle}>Lowest</th>
                    <th style={tableHeaderStyle}>Awarded</th>
                    <th style={tableHeaderStyle}>Difference</th>
                    <th style={tableHeaderStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((trade) => {
                    const lowest = tradeLowestMap[trade.id];
                    const awarded = tradeAwardMap[trade.id];
                    const tradeDifference =
                      awarded && lowest
                        ? Number(awarded.estimate_amount) - Number(lowest.estimate_amount)
                        : 0;
                    const isSelected = trade.id === selectedTradeId;
                    const hasEstimates = allProjectEstimates.some(
                      (estimate) => estimate.trade_id === trade.id
                    );

                    return (
                      <tr key={trade.id} style={{ background: isSelected ? "#f5f5f5" : "white" }}>
                        <td style={tableCellStyle}>{trade.name}</td>
                        <td style={tableCellStyle}>
                          {lowest
                            ? `${lowest.vendor_name} - $${Number(lowest.estimate_amount).toFixed(2)}`
                            : "None"}
                        </td>
                        <td style={tableCellStyle}>
                          {awarded
                            ? `${awarded.vendor_name} - $${Number(awarded.estimate_amount).toFixed(2)}`
                            : "None"}
                        </td>
                        <td style={tableCellStyle}>
                          {awarded && lowest
                            ? `${tradeDifference >= 0 ? "+" : "-"}$${Math.abs(tradeDifference).toFixed(2)}`
                            : "N/A"}
                        </td>
                        <td style={tableCellStyle}>
                          <button onClick={() => setSelectedTradeId(trade.id)}>
                            {isSelected ? "Current Trade" : "Open Trade"}
                          </button>
                          {canEdit && (
                            <button
                              onClick={() => awardLowestForTrade(trade.id)}
                              disabled={!hasEstimates}
                              style={{ marginLeft: 8 }}
                            >
                              Award Lowest
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            <h3>Current Trade</h3>
            {selectedTrade ? (
              <>
                <p>
                  <strong>{selectedTrade.name}</strong>
                </p>

                {canEdit && (
                  <>
                    <div style={{ marginBottom: 16 }}>
                      <button
                        onClick={() => awardLowestForTrade(selectedTrade.id)}
                        disabled={currentTradeEstimates.length === 0}
                      >
                        Award Lowest for This Trade
                      </button>
                    </div>

                    <h4>Add Vendor Estimate</h4>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
                      <input
                        type="text"
                        placeholder="Vendor name"
                        value={vendorName}
                        onChange={(e) => setVendorName(e.target.value)}
                        style={{ ...inputStyle, padding: 10, width: 180 }}
                      />
                      <input
                        type="number"
                        placeholder="Estimate amount"
                        value={estimateAmount}
                        onChange={(e) => setEstimateAmount(e.target.value)}
                        style={{ ...inputStyle, padding: 10, width: 160 }}
                      />
                      <input
                        type="date"
                        value={receivedAt}
                        onChange={(e) => setReceivedAt(e.target.value)}
                        style={{ ...inputStyle, padding: 10 }}
                      />
                      <input
                        type="text"
                        placeholder="Notes"
                        value={estimateNotes}
                        onChange={(e) => setEstimateNotes(e.target.value)}
                        style={{ ...inputStyle, padding: 10, width: 220 }}
                      />
                      <button onClick={handleCreateEstimate}>Add Estimate</button>
                    </div>
                  </>
                )}

                <h4>Editable Bid Board</h4>
                {currentTradeEstimates.length === 0 ? (
                  <p>No estimates yet.</p>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
                    <thead>
                      <tr>
                        <th style={tableHeaderStyle}>Trade</th>
                        <th style={tableHeaderStyle}>Vendor</th>
                        <th style={tableHeaderStyle}>Estimate</th>
                        <th style={tableHeaderStyle}>Received</th>
                        <th style={tableHeaderStyle}>Notes</th>
                        <th style={tableHeaderStyle}>Status</th>
                        <th style={tableHeaderStyle}>Quote</th>
                        <th style={tableHeaderStyle}>Save</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentTradeEstimates.map((estimate) => {
                        const draft = editingEstimates[estimate.id];
                        const isLowest = lowestEstimate?.id === estimate.id;
                        const isAwarded = estimate.status === "awarded";
                        const quoteUrl = getQuoteUrl(estimate.file_path);

                        return (
                          <tr
                            key={estimate.id}
                            style={{
                              background: isAwarded
                                ? "#dff7df"
                                : isLowest
                                ? "#fff8d9"
                                : "white",
                            }}
                          >
                            <td style={tableCellStyle}>{selectedTrade.name}</td>

                            <td style={tableCellStyle}>
                              <input
                                value={draft?.vendor_name ?? ""}
                                onChange={(e) =>
                                  updateEstimateDraft(estimate.id, "vendor_name", e.target.value)
                                }
                                disabled={!canEdit}
                                style={{
                                  ...inputStyle,
                                  width: "100%",
                                  padding: 6,
                                  opacity: canEdit ? 1 : 0.75,
                                }}
                              />
                            </td>

                            <td style={tableCellStyle}>
                              <input
                                type="number"
                                value={draft?.estimate_amount ?? ""}
                                onChange={(e) =>
                                  updateEstimateDraft(
                                    estimate.id,
                                    "estimate_amount",
                                    e.target.value
                                  )
                                }
                                disabled={!canEdit}
                                style={{
                                  ...inputStyle,
                                  width: 120,
                                  padding: 6,
                                  opacity: canEdit ? 1 : 0.75,
                                }}
                              />
                            </td>

                            <td style={tableCellStyle}>
                              <input
                                type="date"
                                value={draft?.received_at ?? ""}
                                onChange={(e) =>
                                  updateEstimateDraft(estimate.id, "received_at", e.target.value)
                                }
                                disabled={!canEdit}
                                style={{
                                  ...inputStyle,
                                  padding: 6,
                                  opacity: canEdit ? 1 : 0.75,
                                }}
                              />
                            </td>

                            <td style={tableCellStyle}>
                              <input
                                value={draft?.notes ?? ""}
                                onChange={(e) =>
                                  updateEstimateDraft(estimate.id, "notes", e.target.value)
                                }
                                disabled={!canEdit}
                                style={{
                                  ...inputStyle,
                                  width: "100%",
                                  padding: 6,
                                  opacity: canEdit ? 1 : 0.75,
                                }}
                              />
                            </td>

                            <td style={tableCellStyle}>
                              <select
                                value={draft?.status ?? "pending"}
                                onChange={(e) =>
                                  updateEstimateDraft(
                                    estimate.id,
                                    "status",
                                    e.target.value as "pending" | "awarded" | "denied"
                                  )
                                }
                                disabled={!canEdit}
                                style={{
                                  ...inputStyle,
                                  padding: 6,
                                  opacity: canEdit ? 1 : 0.75,
                                }}
                              >
                                <option value="pending">pending</option>
                                <option value="awarded">awarded</option>
                                <option value="denied">denied</option>
                              </select>
                              <div style={{ fontSize: 12, marginTop: 4, color: "black" }}>
                                {isLowest ? "Lowest" : ""}
                              </div>
                            </td>

                            <td style={tableCellStyle}>
                              {quoteUrl ? (
                                <div style={{ marginBottom: 6 }}>
                                  <a href={quoteUrl} target="_blank" rel="noreferrer">
                                    View Quote
                                  </a>
                                </div>
                              ) : (
                                <div style={{ marginBottom: 6 }}>No file</div>
                              )}

                              {canEdit && (
                                <input
                                  type="file"
                                  accept=".pdf,.doc,.docx,.xlsx,.xls,.png,.jpg,.jpeg"
                                  onChange={(e) =>
                                    handleUploadQuote(estimate.id, e.target.files?.[0] ?? null)
                                  }
                                  style={{ maxWidth: 180 }}
                                />
                              )}
                            </td>

                            <td style={tableCellStyle}>
                              {canEdit ? (
                                <>
                                  <button
                                    onClick={() => saveEstimateRow(estimate.id, estimate.trade_id)}
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => deleteEstimateRow(estimate.id)}
                                    style={{ marginLeft: 8 }}
                                  >
                                    Delete
                                  </button>
                                </>
                              ) : (
                                <span>Read only</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}

                <h4>Current Trade Summary</h4>
                <p>
                  Lowest estimate:{" "}
                  {lowestEstimate
                    ? `${lowestEstimate.vendor_name} - $${Number(
                        lowestEstimate.estimate_amount
                      ).toFixed(2)}`
                    : "None"}
                </p>
                <p>
                  Awarded estimate:{" "}
                  {awardedEstimate
                    ? `${awardedEstimate.vendor_name} - $${Number(
                        awardedEstimate.estimate_amount
                      ).toFixed(2)}`
                    : "None"}
                </p>
                <p>
                  Difference from lowest:{" "}
                  <strong>
                    {awardedEstimate && lowestEstimate
                      ? `${currentTradeDifferenceFromLowest >= 0 ? "+" : "-"}$${Math.abs(
                          currentTradeDifferenceFromLowest
                        ).toFixed(2)}`
                      : "N/A"}
                  </strong>
                </p>
                <p>
                  5% management fee on awarded estimate: $
                  {currentTradeManagementFee.toFixed(2)}
                </p>
                <p>
                  <strong>
                    Final awarded total for this trade: ${currentTradeFinalTotal.toFixed(2)}
                  </strong>
                </p>
              </>
            ) : (
              <p>Select a trade first.</p>
            )}
          </div>
        </>
      ) : (
        <p>Select a project first.</p>
      )}

      <p style={{ marginTop: 20 }} className="no-print">{message}</p>

      {/* ── Confirmation dialog for "Accepted / Needs Takeoff" ─────────── */}
      {showAcceptConfirm && (
        <div
          className="no-print"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: 12,
              padding: 28,
              maxWidth: 460,
              width: "90%",
              boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
            }}
          >
            <h3 style={{ marginTop: 0 }}>Accept Bid &amp; Create Job</h3>
            <p style={{ fontSize: 14, color: "#555" }}>
              Moving to <strong>"Accepted / Needs Takeoff"</strong> will
              automatically create a customer account, location, and job in
              JobTread, then clone and configure a Procore project.
            </p>

            <label style={{ display: "block", marginTop: 12, fontSize: 13 }}>
              Project address (required for location parsing):
            </label>
            <input
              type="text"
              value={projectAddress}
              onChange={(e) => setProjectAddress(e.target.value)}
              placeholder="123 Main St, City, ST 12345"
              style={{ ...inputStyle, padding: 10, width: "100%", marginTop: 4, boxSizing: "border-box" }}
            />

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                onClick={handleAcceptAndCreateJob}
                style={{
                  background: "#198754",
                  color: "white",
                  border: "none",
                  padding: "8px 20px",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                Confirm &amp; Create Job
              </button>
              <button
                onClick={() => setShowAcceptConfirm(null)}
                style={{
                  background: "#6c757d",
                  color: "white",
                  border: "none",
                  padding: "8px 20px",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Job-creation progress overlay ─────────────────────────────── */}
      {jobCreationProgress && (
        <div
          className="no-print"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1001,
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: 12,
              padding: 28,
              maxWidth: 460,
              width: "90%",
              textAlign: "center",
              boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
            }}
          >
            <h3 style={{ marginTop: 0 }}>Creating Job…</h3>
            <p style={{ fontSize: 14, color: "#555" }}>
              {jobCreationProgress.message}
            </p>
            <div
              style={{
                height: 4,
                background: "#e9ecef",
                borderRadius: 2,
                marginTop: 16,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  background: "#198754",
                  borderRadius: 2,
                  transition: "width 0.3s",
                  width:
                    jobCreationProgress.step === "creating_customer"
                      ? "20%"
                      : jobCreationProgress.step === "creating_location"
                      ? "40%"
                      : jobCreationProgress.step === "creating_job"
                      ? "60%"
                      : jobCreationProgress.step === "cloning_procore_project"
                      ? "80%"
                      : jobCreationProgress.step === "patching_procore_project"
                      ? "90%"
                      : "100%",
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Job-creation result ────────────────────────────────────── */}
      {jobCreationResult && (
        <div
          className="no-print"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1001,
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: 12,
              padding: 28,
              maxWidth: 500,
              width: "90%",
              boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
            }}
          >
            <h3 style={{ marginTop: 0, color: "#198754" }}>Job Created Successfully</h3>
            <table style={{ width: "100%", fontSize: 13 }}>
              <tbody>
                <tr>
                  <td style={{ padding: 4, fontWeight: "bold" }}>JobTread Customer</td>
                  <td style={{ padding: 4 }}>{jobCreationResult.account.name} ({jobCreationResult.account.id})</td>
                </tr>
                <tr>
                  <td style={{ padding: 4, fontWeight: "bold" }}>JobTread Location</td>
                  <td style={{ padding: 4 }}>{jobCreationResult.location.name}</td>
                </tr>
                <tr>
                  <td style={{ padding: 4, fontWeight: "bold" }}>JobTread Job #</td>
                  <td style={{ padding: 4 }}>{jobCreationResult.job.number} — {jobCreationResult.job.name}</td>
                </tr>
                <tr>
                  <td style={{ padding: 4, fontWeight: "bold" }}>Procore Project</td>
                  <td style={{ padding: 4 }}>#{jobCreationResult.patchedProject.id} — {jobCreationResult.patchedProject.name}</td>
                </tr>
              </tbody>
            </table>
            <button
              onClick={() => setJobCreationResult(null)}
              style={{
                marginTop: 16,
                background: "#198754",
                color: "white",
                border: "none",
                padding: "8px 20px",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* ── Job-creation error ─────────────────────────────────────── */}
      {jobCreationError && (
        <div
          className="no-print"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1001,
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: 12,
              padding: 28,
              maxWidth: 460,
              width: "90%",
              boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
            }}
          >
            <h3 style={{ marginTop: 0, color: "#dc3545" }}>Job Creation Failed</h3>
            <p style={{ fontSize: 14, color: "#555", wordBreak: "break-word" }}>
              {jobCreationError}
            </p>
            <button
              onClick={() => setJobCreationError(null)}
              style={{
                marginTop: 12,
                background: "#dc3545",
                color: "white",
                border: "none",
                padding: "8px 20px",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}