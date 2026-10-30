export type AgentEntryState = "loading" | "onboarding" | "session";
export function agentTaskEntryState({ loading, completed, hasHistory, historyUnavailable = false }: { loading:boolean; completed:boolean; hasHistory:boolean; historyUnavailable?:boolean }):AgentEntryState {
  if (completed || hasHistory) return "session";
  if (loading) return "loading";
  return historyUnavailable ? "session" : "onboarding";
}
export function hasAgentConversation(sessions:readonly { persisted?:boolean; summaryOnly?:boolean; messages:readonly {role:string}[] }[]):boolean {
  return sessions.some(s=>s.persisted||s.summaryOnly||s.messages.some(m=>m.role==="user"));
}
export function profileOnboardingComplete(record:unknown, legacy:unknown):boolean {
  if(record&&typeof record==="object"&&"completed" in record&&record.completed===true)return true;
  if(!legacy||typeof legacy!=="object"||!("profileFlowVersion" in legacy)||legacy.profileFlowVersion!==2||!("profile" in legacy))return false;
  const profile=legacy.profile;
  return !!profile&&typeof profile==="object"&&"stage" in profile&&typeof profile.stage==="string"&&!!profile.stage;
}
export const agentOnboardingStorageKey=(accountId:string)=>`agent-profile-onboarding-v1:${accountId}`;
