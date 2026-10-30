import assert from 'node:assert/strict';
import test from 'node:test';
import {agentTaskEntryState,hasAgentConversation,profileOnboardingComplete} from '../lib/agent-task-entry.ts';
test('only a confirmed first task entry collects a profile',()=>{
  assert.equal(agentTaskEntryState({loading:false,completed:false,hasHistory:false}),'onboarding');
  assert.equal(agentTaskEntryState({loading:true,completed:false,hasHistory:false}),'loading');
  assert.equal(agentTaskEntryState({loading:false,completed:false,hasHistory:false,historyUnavailable:true}),'session');
  for(const completed of [true,false])assert.equal(agentTaskEntryState({loading:true,completed,hasHistory:true}),'session');
  assert.equal(agentTaskEntryState({loading:false,completed:true,hasHistory:false}),'session');
});
test('empty drafts do not turn a new user into a returning user',()=>{
  assert.equal(hasAgentConversation([{messages:[]}]),false);
  assert.equal(hasAgentConversation([{messages:[{role:'system'}]}]),false);
  assert.equal(hasAgentConversation([{messages:[{role:'user'}]}]),true);
  assert.equal(hasAgentConversation([{messages:[],summaryOnly:true}]),true);
  assert.equal(hasAgentConversation([{messages:[],persisted:true}]),true);
});
test('completed and skipped onboarding and previous profiles are respected',()=>{
  assert.equal(profileOnboardingComplete({completed:true,profile:null},null),true);
  assert.equal(profileOnboardingComplete(null,{profileFlowVersion:2,profile:{stage:'已经开店'}}),true);
  assert.equal(profileOnboardingComplete(null,{profileFlowVersion:2,draftProfile:{stage:'已经开店'}}),false);
  for(const record of [null,{},'bad',false])assert.equal(profileOnboardingComplete(record,null),false);
});
