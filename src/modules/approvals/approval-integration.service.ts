export interface ApprovalIntegrationResult {
  target_update_applied: boolean;
  target_update_note: string;
}

export const applyApprovedTargetChange = async (
  _env: Env,
  _request: { module: string; entity_type: string; entity_id: string },
): Promise<ApprovalIntegrationResult> => {
  // Keep this intentionally conservative. Business modules own their own
  // payroll locks, balance mutations, and side effects.
  return {
    target_update_applied: false,
    target_update_note: "The approval was recorded. The target module must apply the approved change.",
  };
};

export const applyRejectedTargetChange = async (
  _env: Env,
  _request: { module: string; entity_type: string; entity_id: string },
): Promise<ApprovalIntegrationResult> => ({
  target_update_applied: false,
  target_update_note: "The approval decision was recorded. The target module can keep or update its own status safely.",
});
