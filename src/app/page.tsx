'use client';

import React, { useState, useEffect } from 'react';
import {
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Plus,
  Trash2,
  Edit3,
  Building2,
  ShieldCheck,
  Zap,
  Activity,
  Bot,
  Globe,
  GitFork,
  CheckSquare,
  Database,
  Bell,
  AlertTriangle,
  RefreshCw,
  Sliders,
  ChevronRight,
  Layers,
  BarChart3,
  UserCheck,
  Lock,
} from 'lucide-react';
import { StepType, OrgRole } from '@/lib/workflow/types';

// Mock Organizations & User Roles
interface OrgContext {
  id: string;
  name: string;
  calls_used: number;
  calls_allowed: number;
}

interface UserContext {
  id: string;
  name: string;
  role: OrgRole;
}

const DEMO_ORGS: OrgContext[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Acme Corp (Org A)',
    calls_used: 42,
    calls_allowed: 1000,
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    name: 'Beta Global (Org B)',
    calls_used: 12,
    calls_allowed: 500,
  },
];

const DEMO_USERS: Record<string, UserContext[]> = {
  '11111111-1111-1111-1111-111111111111': [
    { id: '10101010-1010-1010-1010-101010101010', name: 'Alice (Owner)', role: 'owner' },
    { id: '10201020-1020-1020-1020-102010201020', name: 'Bob (Editor)', role: 'editor' },
    { id: '10301030-1030-1030-1030-103010301030', name: 'Charlie (Viewer)', role: 'viewer' },
  ],
  '22222222-2222-2222-2222-222222222222': [
    { id: '20102010-2010-2010-2010-201020102010', name: 'Diana (Owner)', role: 'owner' },
  ],
};

interface StepConfig {
  id: string;
  position: number;
  name: string;
  type: StepType;
  config: Record<string, any>;
}

interface DemoWorkflow {
  id: string;
  org_id: string;
  name: string;
  description: string;
  steps: StepConfig[];
}

const INITIAL_WORKFLOWS: DemoWorkflow[] = [
  {
    id: '10010010-1001-1001-1001-100100100100',
    org_id: '11111111-1111-1111-1111-111111111111',
    name: 'AI Support Ticket Triage & Approval',
    description: 'LLM sentiment analysis, conditional routing, human approval gate, and DB sync.',
    steps: [
      {
        id: 's-1',
        position: 1,
        name: 'LLM Sentiment & Priority Classifier',
        type: 'llm_call',
        config: {
          model: 'llama-3.3-70b-versatile',
          prompt: 'Classify sentiment and urgency for customer ticket: {{input.ticketText}}',
          temperature: 0.7,
        },
      },
      {
        id: 's-2',
        position: 2,
        name: 'Check High Urgency Condition',
        type: 'conditional_branch',
        config: {
          field: 'text',
          operator: 'contains',
          value: 'URGENT',
          true_step_position: 3,
          false_step_position: 4,
        },
      },
      {
        id: 's-3',
        position: 3,
        name: 'Manager Escalation Approval Gate',
        type: 'approval_gate',
        config: {
          approver_role: 'editor',
          approval_message: 'High priority support ticket requires manager sign-off before notifying VP.',
        },
      },
      {
        id: 's-4',
        position: 4,
        name: 'Dispatch HTTP CRM Webhook',
        type: 'http_request',
        config: {
          method: 'POST',
          url: 'https://httpbin.org/post',
          headers: { 'X-Source': 'AI-Workflow' },
          body: { status: 'triaged', priority: 'high' },
        },
      },
      {
        id: 's-5',
        position: 5,
        name: 'Save Execution Record to DB',
        type: 'db_write',
        config: {
          table_name: 'step_runs',
          data: { status: 'processed', system: 'support-v2' },
        },
      },
      {
        id: 's-6',
        position: 6,
        name: 'Send Slack Notification',
        type: 'notify',
        config: {
          channel: 'slack',
          recipient: '#support-alerts',
          message: 'Support ticket successfully triaged and processed.',
        },
      },
    ],
  },
];

export default function WorkflowBuilderPage() {
  const [activeOrg, setActiveOrg] = useState<OrgContext>(DEMO_ORGS[0]);
  const [activeUser, setActiveUser] = useState<UserContext>(DEMO_USERS[DEMO_ORGS[0].id][0]);
  const [activeTab, setActiveTab] = useState<'builder' | 'runs' | 'usage'>('builder');

  const [workflows, setWorkflows] = useState<DemoWorkflow[]>(INITIAL_WORKFLOWS);
  const [selectedWorkflow, setSelectedWorkflow] = useState<DemoWorkflow>(INITIAL_WORKFLOWS[0]);

  // Execution State
  const [isRunning, setIsRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<string>('idle');
  const [stepLogs, setStepLogs] = useState<any[]>([]);
  const [pausedStepInfo, setPausedStepInfo] = useState<any>(null);
  const [executionMessage, setExecutionMessage] = useState<string | null>(null);

  // Modal / Drawer state for adding/editing steps
  const [isAddStepOpen, setIsAddStepOpen] = useState(false);
  const [newStepType, setNewStepType] = useState<StepType>('llm_call');
  const [newStepName, setNewStepName] = useState('');

  // Handle Org Switching
  const handleOrgChange = (orgId: string) => {
    const org = DEMO_ORGS.find((o) => o.id === orgId) || DEMO_ORGS[0];
    setActiveOrg(org);
    const users = DEMO_USERS[org.id] || [];
    setActiveUser(users[0]);

    const orgWfs = workflows.filter((w) => w.org_id === org.id);
    if (orgWfs.length > 0) {
      setSelectedWorkflow(orgWfs[0]);
    } else {
      const newWf: DemoWorkflow = {
        id: `wf-${Date.now()}`,
        org_id: org.id,
        name: `${org.name} Starter Workflow`,
        description: 'New workflow created for organization.',
        steps: [
          {
            id: `s-${Date.now()}`,
            position: 1,
            name: 'Initial LLM Analysis',
            type: 'llm_call',
            config: { model: 'llama-3.3-70b-versatile', prompt: 'Process data for org' },
          },
        ],
      };
      setWorkflows((prev) => [...prev, newWf]);
      setSelectedWorkflow(newWf);
    }
  };

  // Add Step to Selected Workflow
  const handleAddStep = () => {
    if (!newStepName.trim()) return;

    const newPos = selectedWorkflow.steps.length + 1;
    const newStep: StepConfig = {
      id: `s-${Date.now()}`,
      position: newPos,
      name: newStepName,
      type: newStepType,
      config:
        newStepType === 'llm_call'
          ? { model: 'llama-3.3-70b-versatile', prompt: 'Analyze input: {{input}}' }
          : newStepType === 'http_request'
          ? { method: 'POST', url: 'https://httpbin.org/post' }
          : newStepType === 'conditional_branch'
          ? { field: 'status', operator: 'equals', value: 'approved' }
          : newStepType === 'approval_gate'
          ? { approver_role: 'editor', approval_message: 'Requires approval' }
          : newStepType === 'db_write'
          ? { table_name: 'step_runs', data: { key: 'val' } }
          : { channel: 'email', recipient: 'admin@org.com', message: 'Notification' },
    };

    const updated = {
      ...selectedWorkflow,
      steps: [...selectedWorkflow.steps, newStep],
    };

    setSelectedWorkflow(updated);
    setWorkflows((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
    setNewStepName('');
    setIsAddStepOpen(false);
  };

  // Delete Step
  const handleDeleteStep = (stepId: string) => {
    if (activeUser.role === 'viewer') return;
    const filteredSteps = selectedWorkflow.steps
      .filter((s) => s.id !== stepId)
      .map((s, idx) => ({ ...s, position: idx + 1 }));

    const updated = { ...selectedWorkflow, steps: filteredSteps };
    setSelectedWorkflow(updated);
    setWorkflows((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
  };

  // Execute Workflow via Server API
  const handleTriggerRun = async () => {
    if (activeUser.role === 'viewer') {
      setExecutionMessage('❌ Unauthorized: Viewer role cannot trigger workflow execution.');
      return;
    }

    setIsRunning(true);
    setRunStatus('running');
    setStepLogs([]);
    setPausedStepInfo(null);
    setExecutionMessage('⚡ Executing workflow steps sequentially...');
    setActiveTab('runs');

    try {
      const response = await fetch('/api/workflow/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_id: selectedWorkflow.id,
          user_id: activeUser.id,
          input: { ticketText: 'URGENT: Database connection pool high latency warning!' },
        }),
      });

      const resData = await response.json();

      if (!response.ok) {
        setRunStatus('failed');
        setExecutionMessage(`❌ Execution Error (${response.status}): ${resData.message}`);
        setIsRunning(false);
        return;
      }

      setRunId(resData.workflow_run_id);
      setRunStatus(resData.status);

      if (resData.status === 'paused') {
        setPausedStepInfo({
          stepName: 'Manager Escalation Approval Gate',
          approverRole: 'editor',
          message: 'Approval Gate reached. Awaiting manual sign-off to proceed.',
        });
        setExecutionMessage('⏸️ Workflow execution PAUSED at Approval Gate. Awaiting sign-off.');
      } else if (resData.status === 'completed') {
        setExecutionMessage('✅ Workflow completed successfully! All steps executed and quota updated.');
        // Increment quota locally for display
        setActiveOrg((prev) => ({ ...prev, calls_used: prev.calls_used + 1 }));
      }
    } catch (err: any) {
      setRunStatus('failed');
      setExecutionMessage(`❌ Network error: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  // Resume Approval Gate via approveStep Hasura Action
  const handleApproveResume = async () => {
    if (activeUser.role === 'viewer') {
      setExecutionMessage('❌ Unauthorized: Viewer role cannot approve workflow gates.');
      return;
    }

    if (!runId) return;

    setIsRunning(true);
    setExecutionMessage('⚡ Resuming workflow execution via approveStep Hasura Action...');

    try {
      const response = await fetch('/api/actions/approve-step', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hasura-user-id': activeUser.id,
        },
        body: JSON.stringify({
          input: {
            step_run_id: pausedStepInfo?.stepRunId || '00000000-0000-0000-0000-000000000000',
          },
          session_variables: {
            'x-hasura-user-id': activeUser.id,
            'x-hasura-role': activeUser.role,
          },
          workflow_run_id: runId,
        }),
      });

      const resData = await response.json();

      if (!response.ok) {
        setExecutionMessage(`❌ Action Error (${response.status}): ${resData.message}`);
        setIsRunning(false);
        return;
      }

      setRunStatus(resData.status);
      setPausedStepInfo(null);
      setExecutionMessage('✅ approveStep Action successful! Remaining workflow steps executed.');
      setActiveOrg((prev) => ({ ...prev, calls_used: prev.calls_used + 1 }));
    } catch (err: any) {
      setExecutionMessage(`❌ Error resuming approval: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const getStepIcon = (type: StepType) => {
    switch (type) {
      case 'llm_call':
        return <Bot className="w-5 h-5 text-cyan-400" />;
      case 'http_request':
        return <Globe className="w-5 h-5 text-indigo-400" />;
      case 'conditional_branch':
        return <GitFork className="w-5 h-5 text-amber-400" />;
      case 'approval_gate':
        return <CheckSquare className="w-5 h-5 text-rose-400" />;
      case 'db_write':
        return <Database className="w-5 h-5 text-emerald-400" />;
      case 'notify':
        return <Bell className="w-5 h-5 text-purple-400" />;
      default:
        return <Zap className="w-5 h-5 text-cyan-400" />;
    }
  };

  const callsPercentage = Math.round((activeOrg.calls_used / activeOrg.calls_allowed) * 100);

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="border-b border-slate-800/80 bg-[#0d1322]/80 backdrop-blur-md sticky top-0 z-30 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight gradient-text">
              AI Agent Workflow Builder
            </h1>
            <p className="text-xs text-slate-400">Next.js 16 • Nhost • Hasura GraphQL</p>
          </div>
        </div>

        {/* Org & Role Switcher */}
        <div className="flex items-center gap-4">
          {/* Org Selector */}
          <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-1.5 text-xs">
            <Building2 className="w-4 h-4 text-cyan-400" />
            <span className="text-slate-400">Org:</span>
            <select
              value={activeOrg.id}
              onChange={(e) => handleOrgChange(e.target.value)}
              className="bg-transparent text-slate-200 font-semibold focus:outline-none cursor-pointer"
            >
              {DEMO_ORGS.map((org) => (
                <option key={org.id} value={org.id} className="bg-slate-900 text-slate-200">
                  {org.name}
                </option>
              ))}
            </select>
          </div>

          {/* User & Role Switcher */}
          <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-1.5 text-xs">
            <UserCheck className="w-4 h-4 text-indigo-400" />
            <span className="text-slate-400">User:</span>
            <select
              value={activeUser.id}
              onChange={(e) => {
                const u = (DEMO_USERS[activeOrg.id] || []).find((usr) => usr.id === e.target.value);
                if (u) setActiveUser(u);
              }}
              className="bg-transparent text-slate-200 font-semibold focus:outline-none cursor-pointer"
            >
              {(DEMO_USERS[activeOrg.id] || []).map((u) => (
                <option key={u.id} value={u.id} className="bg-slate-900 text-slate-200">
                  {u.name} ({u.role.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          {/* Role Badge */}
          <div
            className={`px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 border ${
              activeUser.role === 'owner'
                ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                : activeUser.role === 'editor'
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                : 'bg-slate-500/10 text-slate-400 border-slate-500/30'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            {activeUser.role}
          </div>
        </div>
      </header>

      {/* Main Workspace Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-72 border-r border-slate-800/80 bg-[#0c1220]/60 p-4 flex flex-col justify-between">
          <div>
            <div className="mb-6">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                Workflows ({workflows.length})
              </h3>
              <div className="space-y-1">
                {workflows.map((wf) => (
                  <button
                    key={wf.id}
                    onClick={() => setSelectedWorkflow(wf)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all flex items-center justify-between ${
                      selectedWorkflow.id === wf.id
                        ? 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-medium'
                        : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                    }`}
                  >
                    <span className="truncate">{wf.name}</span>
                    <ChevronRight className="w-4 h-4 text-slate-500" />
                  </button>
                ))}
              </div>
            </div>

            {/* Quota Progress Card */}
            <div className="glass-panel rounded-xl p-4 border border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-400">Monthly Call Quota</span>
                <span className="text-xs font-bold text-cyan-400">{callsPercentage}%</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden mb-2">
                <div
                  className="bg-gradient-to-r from-cyan-500 to-indigo-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${callsPercentage}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400 flex justify-between">
                <span>{activeOrg.calls_used} calls used</span>
                <span>{activeOrg.calls_allowed} limit</span>
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800/60 text-xs text-slate-500">
            <p>Layer 1 Security Enabled</p>
            <p className="mt-0.5 font-mono text-[10px]">org_id = {activeOrg.id.slice(0, 8)}...</p>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 flex flex-col bg-[#080c15] overflow-y-auto">
          {/* Tab Controls Bar */}
          <div className="border-b border-slate-800/80 px-6 py-3 bg-[#0d1322]/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('builder')}
                className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${
                  activeTab === 'builder'
                    ? 'bg-slate-800 text-cyan-400 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-4 h-4" />
                Workflow Builder Canvas
              </button>
              <button
                onClick={() => setActiveTab('runs')}
                className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${
                  activeTab === 'runs'
                    ? 'bg-slate-800 text-cyan-400 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Activity className="w-4 h-4" />
                Execution Monitor & Logs
              </button>
              <button
                onClick={() => setActiveTab('usage')}
                className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${
                  activeTab === 'usage'
                    ? 'bg-slate-800 text-cyan-400 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <BarChart3 className="w-4 h-4" />
                Org Usage Analytics
              </button>
            </div>

            {/* Run Action Trigger Button */}
            <button
              onClick={handleTriggerRun}
              disabled={isRunning || activeUser.role === 'viewer'}
              className={`gradient-btn text-white px-5 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 shadow-lg ${
                activeUser.role === 'viewer' ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {isRunning ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4 fill-current" />
              )}
              {activeUser.role === 'viewer' ? 'Trigger Disabled (Viewer)' : '▶ Trigger Workflow Run'}
            </button>
          </div>

          {/* Execution Message Alert */}
          {executionMessage && (
            <div className="mx-6 mt-4 p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs font-mono text-cyan-300 flex items-center justify-between">
              <span>{executionMessage}</span>
              <button
                onClick={() => setExecutionMessage(null)}
                className="text-slate-500 hover:text-slate-300"
              >
                ✕
              </button>
            </div>
          )}

          {/* TAB 1: WORKFLOW BUILDER CANVAS */}
          {activeTab === 'builder' && (
            <div className="p-6 flex-1 flex flex-col">
              {/* Workflow Header */}
              <div className="glass-panel p-5 rounded-2xl border border-slate-800 mb-6 flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-100 mb-1">{selectedWorkflow.name}</h2>
                  <p className="text-xs text-slate-400">{selectedWorkflow.description}</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsAddStepOpen(true)}
                    disabled={activeUser.role === 'viewer'}
                    className={`px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-cyan-300 border border-slate-700 flex items-center gap-1.5 transition-all ${
                      activeUser.role === 'viewer' ? 'opacity-40 cursor-not-allowed' : ''
                    }`}
                  >
                    <Plus className="w-4 h-4" /> Add Workflow Step
                  </button>
                </div>
              </div>

              {/* Step Graph Canvas */}
              <div className="space-y-4">
                {selectedWorkflow.steps.map((step, idx) => (
                  <div key={step.id} className="relative group">
                    {/* Connector Line */}
                    {idx < selectedWorkflow.steps.length - 1 && (
                      <div className="absolute left-6 top-16 w-0.5 h-6 bg-slate-800 z-0" />
                    )}

                    <div className="glass-panel glass-panel-hover p-4 rounded-xl border border-slate-800/80 flex items-center justify-between relative z-10 transition-all">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center shadow-inner">
                          {getStepIcon(step.type)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-500 font-mono">
                              #{step.position}
                            </span>
                            <h4 className="text-sm font-semibold text-slate-200">{step.name}</h4>
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 uppercase font-mono">
                              {step.type.replace('_', ' ')}
                            </span>
                          </div>

                          {/* Step Config Summary */}
                          <div className="mt-1 text-xs text-slate-400 font-mono bg-slate-950/40 px-2.5 py-1 rounded-md border border-slate-800/50 inline-block">
                            {step.type === 'llm_call' && `Model: ${step.config.model}`}
                            {step.type === 'http_request' &&
                              `Method: ${step.config.method || 'GET'} | ${step.config.url}`}
                            {step.type === 'conditional_branch' &&
                              `Rule: ${step.config.field} ${step.config.operator} "${step.config.value}"`}
                            {step.type === 'approval_gate' &&
                              `Approver Role: ${step.config.approver_role}`}
                            {step.type === 'db_write' && `Table: ${step.config.table_name}`}
                            {step.type === 'notify' &&
                              `Channel: ${step.config.channel} -> ${step.config.recipient}`}
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 opacity-80 group-hover:opacity-100 transition-opacity">
                        {activeUser.role !== 'viewer' && (
                          <button
                            onClick={() => handleDeleteStep(step.id)}
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-all"
                            title="Delete Step"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: EXECUTION MONITOR & APPROVAL CARD */}
          {activeTab === 'runs' && (
            <div className="p-6 flex-1 space-y-6">
              {/* Approval Gate Banner Card if Paused */}
              {pausedStepInfo && (
                <div className="glass-panel p-5 rounded-2xl border border-rose-500/40 bg-gradient-to-r from-rose-950/30 to-slate-900 animate-glow flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
                      <AlertTriangle className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-rose-300">
                        {pausedStepInfo.stepName} (Approval Gate Paused)
                      </h3>
                      <p className="text-xs text-slate-300 mt-0.5">{pausedStepInfo.message}</p>
                      <span className="text-[11px] text-slate-400 font-mono mt-1 block">
                        Requires Role: {pausedStepInfo.approverRole.toUpperCase()} | Run ID: {runId}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {activeUser.role === 'viewer' ? (
                      <div className="px-4 py-2 rounded-xl bg-slate-800 text-slate-400 text-xs flex items-center gap-2 border border-slate-700">
                        <Lock className="w-4 h-4" />
                        Viewer Cannot Approve
                      </div>
                    ) : (
                      <button
                        onClick={handleApproveResume}
                        className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Approve & Resume Execution
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Execution Run Logs Timeline */}
              <div className="glass-panel p-5 rounded-2xl border border-slate-800">
                <h3 className="text-sm font-bold text-slate-200 mb-4 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  Live Workflow Execution Timeline (Run ID: {runId || 'Not Triggered'})
                </h3>

                <div className="space-y-3 font-mono text-xs">
                  {selectedWorkflow.steps.map((step) => {
                    const isStepPaused = pausedStepInfo && step.type === 'approval_gate';
                    const isCompleted = runStatus === 'completed' || (runStatus === 'paused' && step.position < 3);

                    return (
                      <div
                        key={step.id}
                        className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-slate-500 font-bold">#{step.position}</span>
                          <span className="text-slate-200 font-medium">{step.name}</span>
                        </div>

                        <div className="flex items-center gap-3">
                          {isStepPaused ? (
                            <span className="px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 animate-spin" /> PAUSED
                            </span>
                          ) : isCompleted ? (
                            <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] flex items-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5" /> COMPLETED
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 text-[11px]">
                              PENDING
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ORG USAGE ANALYTICS VIEW */}
          {activeTab === 'usage' && (
            <div className="p-6 flex-1 space-y-6">
              <div className="glass-panel p-6 rounded-2xl border border-slate-800">
                <h3 className="text-lg font-bold text-slate-100 mb-2 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-cyan-400" />
                  PostgreSQL Monthly Usage View (`public.org_usage_monthly`)
                </h3>
                <p className="text-xs text-slate-400 mb-6">
                  Exposes tenant API call metrics directly aggregated from the database view.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-xs text-slate-400">Organization Name</span>
                    <h4 className="text-base font-bold text-slate-100 mt-1">{activeOrg.name}</h4>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-xs text-slate-400">Calls Used</span>
                    <h4 className="text-xl font-extrabold text-cyan-400 mt-1">{activeOrg.calls_used}</h4>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-xs text-slate-400">Calls Allowed</span>
                    <h4 className="text-xl font-extrabold text-indigo-400 mt-1">{activeOrg.calls_allowed}</h4>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-xs text-slate-400">Usage Percentage</span>
                    <h4 className="text-xl font-extrabold text-emerald-400 mt-1">{callsPercentage}%</h4>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Add Step Modal */}
      {isAddStepOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel p-6 rounded-2xl border border-slate-700 w-full max-w-md bg-[#0d1322] shadow-2xl">
            <h3 className="text-lg font-bold text-slate-100 mb-4">Add Workflow Step</h3>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Step Name</label>
                <input
                  type="text"
                  value={newStepName}
                  onChange={(e) => setNewStepName(e.target.value)}
                  placeholder="e.g. Generate AI Email Summary"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Step Type</label>
                <select
                  value={newStepType}
                  onChange={(e) => setNewStepType(e.target.value as StepType)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="llm_call">🤖 LLM Call (Groq Llama 3.3)</option>
                  <option value="http_request">🌐 HTTP Request (REST API)</option>
                  <option value="conditional_branch">🔀 Conditional Branch</option>
                  <option value="approval_gate">⏸️ Approval Gate</option>
                  <option value="db_write">💾 DB Write</option>
                  <option value="notify">🔔 Notify (Slack/Email)</option>
                </select>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setIsAddStepOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleAddStep}
                className="gradient-btn text-white px-4 py-2 rounded-xl text-xs font-bold"
              >
                Add Step
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
