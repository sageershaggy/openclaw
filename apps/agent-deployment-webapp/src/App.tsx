import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  Server,
  Activity,
  Settings,
  PlusCircle,
  Square,
  Cpu,
  Database,
  Zap,
  ChevronRight,
  X,
  Check,
  Shield,
  Globe,
  Save,
  Link2,
  Key,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Wifi,
  WifiOff,
  MessageSquare,
  Send,
} from 'lucide-react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';

// --- Types ---

interface AppSettings {
  vpnEnabled: boolean;
  permanentPort: number;
  gatewayUrl: string;
  gatewayToken: string;
}

interface GatewayAgent {
  id: string;
  workspace?: string;
  agentDir?: string;
  bindings?: number;
  isDefault?: boolean;
  routes?: string[];
  identity?: { name?: string; emoji?: string };
}

interface GatewayHealth {
  ok: boolean;
  version?: string;
  uptime?: number;
  [key: string]: unknown;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  vpnEnabled: false,
  permanentPort: 3001,
  gatewayUrl: 'http://localhost:18789',
  gatewayToken: '',
};

// --- App ---

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  // Gateway state
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [gatewayConnected, setGatewayConnected] = useState(false);
  const [gatewayHealth, setGatewayHealth] = useState<GatewayHealth | null>(null);
  const [agents, setAgents] = useState<GatewayAgent[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Settings form
  const [formGatewayUrl, setFormGatewayUrl] = useState('');
  const [formGatewayToken, setFormGatewayToken] = useState('');
  const [formPort, setFormPort] = useState('3001');
  const [formVpn, setFormVpn] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // Chat state (for testing gateway)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatAgent, setChatAgent] = useState('');
  const [isChatting, setIsChatting] = useState(false);

  // Deploy modal
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formModel, setFormModel] = useState('gpt-4o');
  const [isDeploying, setIsDeploying] = useState(false);

  // --- Data fetching ---

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data: AppSettings = await res.json();
        setSettings(data);
        setFormGatewayUrl(data.gatewayUrl || 'http://localhost:18789');
        setFormGatewayToken(data.gatewayToken || '');
        setFormPort(String(data.permanentPort || 3001));
        setFormVpn(data.vpnEnabled || false);
      }
    } catch (e) {
      console.error('Failed to fetch settings:', e);
    }
  }, []);

  const checkGatewayHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/gateway/health');
      if (res.ok) {
        const data = await res.json();
        setGatewayHealth(data);
        setGatewayConnected(true);
        return true;
      }
      setGatewayConnected(false);
      setGatewayHealth(null);
      return false;
    } catch {
      setGatewayConnected(false);
      setGatewayHealth(null);
      return false;
    }
  }, []);

  const fetchAgents = useCallback(async () => {
    // Use the tools invoke endpoint to call agents.list via gateway
    try {
      const res = await fetch('/api/gateway/tools/invoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'agents_list', args: {}, sessionKey: 'main' }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.result) {
          const agentList = Array.isArray(data.result) ? data.result : data.result.agents || [];
          setAgents(agentList);
        }
      }
    } catch (e) {
      console.error('Failed to fetch agents:', e);
    }
  }, []);

  useEffect(() => {
    fetchSettings().then(() => {
      checkGatewayHealth().then((connected) => {
        if (connected) fetchAgents();
      });
    });
  }, [fetchSettings, checkGatewayHealth, fetchAgents]);

  // --- Handlers ---

  const handleSaveSettings = async () => {
    setIsSaving(true);
    setSaveMsg('');
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vpnEnabled: formVpn,
          permanentPort: Number(formPort),
          gatewayUrl: formGatewayUrl,
          gatewayToken: formGatewayToken,
        }),
      });
      if (res.ok) {
        const data: AppSettings = await res.json();
        setSettings(data);
        setSaveMsg('saved');
        setTimeout(() => setSaveMsg(''), 3000);
        // Re-check gateway with new settings
        await checkGatewayHealth();
      } else {
        const err = await res.json();
        alert('Failed to save: ' + (err.error || 'Unknown error'));
      }
    } catch (e) {
      console.error(e);
      alert('Network error saving settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setIsLoading(true);
    // Save first, then test
    await handleSaveSettings();
    const ok = await checkGatewayHealth();
    if (ok) {
      await fetchAgents();
      setSaveMsg('connected');
    } else {
      setSaveMsg('failed');
    }
    setTimeout(() => setSaveMsg(''), 4000);
    setIsLoading(false);
  };

  const handleChatSend = async () => {
    if (!chatInput.trim()) return;
    const userMsg: ChatMessage = { role: 'user', content: chatInput };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput('');
    setIsChatting(true);

    try {
      const body: Record<string, unknown> = {
        model: chatAgent ? `openclaw:${chatAgent}` : 'openclaw:main',
        messages: [...chatMessages, userMsg].map((m) => ({ role: m.role, content: m.content })),
        stream: false,
      };
      const res = await fetch('/api/gateway/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        const reply = data.choices?.[0]?.message?.content || data.output || JSON.stringify(data);
        setChatMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
      } else {
        const err = await res.text();
        setChatMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${err}` }]);
      }
    } catch (e) {
      setChatMessages((prev) => [...prev, { role: 'assistant', content: `Network error: ${(e as Error).message}` }]);
    } finally {
      setIsChatting(false);
    }
  };

  const handleDeployAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsDeploying(true);
    try {
      // Use chat completions to create agent via gateway
      const res = await fetch('/api/gateway/tools/invoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'agents_create',
          args: { name: formName, model: formModel },
          sessionKey: 'main',
        }),
      });
      if (res.ok) {
        setIsDeployModalOpen(false);
        setFormName('');
        await fetchAgents();
      } else {
        const err = await res.text();
        alert('Failed to deploy agent: ' + err);
      }
    } catch (e) {
      alert('Network error: ' + (e as Error).message);
    } finally {
      setIsDeploying(false);
    }
  };

  // --- Connection status badge ---
  const ConnectionBadge = () => (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${gatewayConnected ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/15 text-red-400 border border-red-500/30'}`}>
      {gatewayConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
      {gatewayConnected ? 'Gateway Connected' : 'Disconnected'}
    </div>
  );

  // --- Tab renderers ---

  const renderDashboard = () => (
    <>
      <header className="flex justify-between items-center mb-10 w-full relative">
        <div>
          <h2 className="text-3xl font-bold text-white mb-1">Overview Dashboard</h2>
          <p className="text-slate-400">Monitor and deploy your autonomous AI agents.</p>
        </div>
        <div className="flex gap-3 items-center">
          <ConnectionBadge />
          <button
            onClick={() => { checkGatewayHealth(); fetchAgents(); }}
            className="p-2.5 rounded-full bg-slate-800/50 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 transition-all"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={() => setIsDeployModalOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-full font-medium transition-all duration-300 flex items-center gap-2 shadow-[0_4px_20px_rgba(99,102,241,0.4)] hover:shadow-[0_4px_25px_rgba(99,102,241,0.6)] hover:-translate-y-1"
          >
            <PlusCircle size={18} />
            Deploy Agent
          </button>
        </div>
      </header>

      {/* Gateway Info */}
      <div className="grid grid-cols-3 gap-6 mb-8 w-full">
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6 relative overflow-hidden group hover:border-slate-600/80 transition-all duration-300">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-500 to-teal-400 opacity-10 rounded-full blur-2xl group-hover:opacity-20 transition-opacity"></div>
          <h3 className="text-slate-400 font-medium mb-1">Active Agents</h3>
          <div className="text-4xl font-bold text-white mb-2">{agents.length}</div>
          <div className="text-sm text-emerald-400">{gatewayConnected ? 'From gateway' : 'Gateway offline'}</div>
        </div>
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6 relative overflow-hidden group hover:border-slate-600/80 transition-all duration-300">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-indigo-500 to-blue-500 opacity-10 rounded-full blur-2xl group-hover:opacity-20 transition-opacity"></div>
          <h3 className="text-slate-400 font-medium mb-1">Gateway</h3>
          <div className="text-4xl font-bold text-white mb-2 truncate text-lg mt-3">{settings.gatewayUrl}</div>
          <div className={`text-sm ${gatewayConnected ? 'text-emerald-400' : 'text-red-400'}`}>
            {gatewayConnected ? 'Connected' : 'Not reachable'}
          </div>
        </div>
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6 relative overflow-hidden group hover:border-slate-600/80 transition-all duration-300">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-500 to-pink-500 opacity-10 rounded-full blur-2xl group-hover:opacity-20 transition-opacity"></div>
          <h3 className="text-slate-400 font-medium mb-1">API Endpoints</h3>
          <div className="text-lg font-bold text-white mb-2 mt-3">
            <div className="text-sm space-y-1">
              <div className="text-slate-300">/v1/chat/completions</div>
              <div className="text-slate-300">/v1/responses</div>
              <div className="text-slate-300">/tools/invoke</div>
            </div>
          </div>
          <div className="text-sm text-purple-400">OpenAI-compatible</div>
        </div>
      </div>

      <div className="flex gap-6 w-full flex-1 min-h-0">
        {/* Agent List */}
        <div className="flex-1 bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6 flex flex-col min-w-0">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold text-white">Agents from Gateway</h3>
            <button onClick={() => setActiveTab('agents')} className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors flex items-center">
              View All <ChevronRight size={16} />
            </button>
          </div>
          <div className="flex flex-col gap-3 flex-1 overflow-y-auto pr-2">
            {agents.map((agent) => (
              <div key={agent.id} className="bg-slate-900/50 border border-slate-700/50 p-4 rounded-xl flex items-center justify-between hover:bg-slate-700/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]"></div>
                  <div>
                    <div className="text-white font-medium text-sm">
                      {agent.identity?.emoji || ''} {agent.identity?.name || agent.id}
                      {agent.isDefault ? <span className="ml-2 text-xs text-indigo-400">(default)</span> : ''}
                    </div>
                    <div className="text-slate-400 text-xs mt-0.5">{agent.workspace?.split(/[/\\]/).pop() || agent.id}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-xs text-indigo-300 font-mono">{agent.routes?.length || 0} routes</div>
                </div>
              </div>
            ))}
            {agents.length === 0 && (
              <div className="text-slate-500 text-sm text-center py-8">
                {gatewayConnected ? 'No agents found on gateway' : 'Connect to gateway to see agents'}
              </div>
            )}
          </div>
        </div>

        {/* Quick Chat Test */}
        <div className="w-[400px] bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6 flex flex-col min-w-0">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <MessageSquare size={18} /> Quick Chat
            </h3>
            {agents.length > 0 && (
              <select
                value={chatAgent}
                onChange={(e) => setChatAgent(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-slate-300 text-xs rounded-lg px-2 py-1 outline-none focus:border-indigo-500"
              >
                <option value="">Default agent</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.identity?.name || a.id}</option>
                ))}
              </select>
            )}
          </div>
          <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1">
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-br-md' : 'bg-slate-700/60 text-slate-200 rounded-bl-md'}`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {isChatting && (
              <div className="flex justify-start">
                <div className="bg-slate-700/60 text-slate-400 px-4 py-2.5 rounded-2xl rounded-bl-md text-sm animate-pulse">Thinking...</div>
              </div>
            )}
            {chatMessages.length === 0 && !isChatting && (
              <div className="text-slate-500 text-sm text-center py-8">
                {gatewayConnected ? 'Send a message to test the API' : 'Connect gateway first'}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleChatSend()}
              placeholder={gatewayConnected ? 'Test a message...' : 'Gateway not connected'}
              disabled={!gatewayConnected || isChatting}
              className="flex-1 bg-slate-900/80 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50"
            />
            <button
              onClick={handleChatSend}
              disabled={!gatewayConnected || isChatting || !chatInput.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 text-white p-2.5 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </>
  );

  const renderAgents = () => (
    <>
      <header className="flex justify-between items-center mb-10 w-full relative">
        <div>
          <h2 className="text-3xl font-bold text-white mb-1">Active Agents</h2>
          <p className="text-slate-400">Agents registered on the OpenClaw gateway.</p>
        </div>
        <div className="flex gap-3 items-center">
          <ConnectionBadge />
          <button onClick={fetchAgents} className="p-2.5 rounded-full bg-slate-800/50 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 transition-all">
            <RefreshCw size={16} />
          </button>
        </div>
      </header>
      <div className="flex flex-col gap-4 flex-1 overflow-y-auto">
        {agents.map((agent) => (
          <div key={agent.id} className="bg-slate-800/40 border border-slate-700/50 p-6 rounded-2xl flex items-center justify-between hover:border-slate-600/80 transition-all">
            <div className="flex items-center gap-4">
              <div className="w-3 h-3 rounded-full bg-emerald-400 shadow-[0_0_10px_#34d399]"></div>
              <div>
                <div className="text-white font-semibold text-lg">
                  {agent.identity?.emoji || ''} {agent.identity?.name || agent.id}
                  {agent.isDefault ? <span className="ml-2 text-sm text-indigo-400">(default)</span> : ''}
                </div>
                <div className="text-slate-400 text-sm flex gap-3 items-center mt-1">
                  <span className="flex items-center gap-1"><Database size={12} /> {agent.workspace?.split(/[/\\]/).pop() || 'N/A'}</span>
                  <span>{agent.routes?.length || 0} routes</span>
                  <span className="text-xs font-mono text-slate-500">id: {agent.id}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-xs text-slate-400">Bindings</div>
                <div className="text-sm font-semibold text-indigo-300">{agent.bindings || agent.routes?.length || 0}</div>
              </div>
              <button className="p-2.5 rounded-xl transition-colors bg-red-500/10 text-red-400 hover:bg-red-500/20">
                <Square size={16} />
              </button>
            </div>
          </div>
        ))}
        {agents.length === 0 && (
          <div className="text-slate-500 text-center py-20">
            {gatewayConnected ? 'No agents found. Deploy one to get started.' : 'Connect to the OpenClaw gateway in Configuration to see agents.'}
          </div>
        )}
      </div>
    </>
  );

  const renderAnalytics = () => {
    const mockChartData = [
      { time: '00:00', requests: 120, compute: 45 },
      { time: '04:00', requests: 300, compute: 68 },
      { time: '08:00', requests: 450, compute: 85 },
      { time: '12:00', requests: 800, compute: 92 },
      { time: '16:00', requests: 620, compute: 75 },
      { time: '20:00', requests: 400, compute: 55 },
      { time: '24:00', requests: 250, compute: 40 },
    ];

    return (
      <>
        <header className="flex justify-between items-center mb-10">
          <div>
            <h2 className="text-3xl font-bold text-white mb-1">System Analytics</h2>
            <p className="text-slate-400">Performance metrics from the OpenClaw gateway.</p>
          </div>
          <ConnectionBadge />
        </header>

        {/* Gateway Health */}
        {gatewayHealth && (
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6 mb-6">
            <h3 className="text-lg font-semibold text-white mb-4">Gateway Health</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700/50">
                <div className="text-slate-400 text-xs mb-1">Status</div>
                <div className="text-emerald-400 font-semibold flex items-center gap-1"><CheckCircle2 size={14} /> Healthy</div>
              </div>
              <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700/50">
                <div className="text-slate-400 text-xs mb-1">Gateway URL</div>
                <div className="text-white font-mono text-sm truncate">{settings.gatewayUrl}</div>
              </div>
              <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700/50">
                <div className="text-slate-400 text-xs mb-1">Agents</div>
                <div className="text-white font-semibold">{agents.length} active</div>
              </div>
            </div>
          </div>
        )}

        {!gatewayConnected && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-6 mb-6 flex items-start gap-3">
            <AlertCircle size={20} className="text-amber-400 mt-0.5 shrink-0" />
            <div>
              <div className="text-amber-200 font-medium">Gateway not connected</div>
              <div className="text-amber-400/80 text-sm mt-1">
                Go to <button onClick={() => setActiveTab('settings')} className="underline hover:text-amber-300">Configuration</button> to set your gateway URL and token, then test the connection.
              </div>
            </div>
          </div>
        )}

        <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6 flex-1">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold text-white">Request Volume</h3>
            <select className="bg-slate-900 border border-slate-700 text-slate-300 text-sm rounded-lg px-3 py-1.5 outline-none focus:border-indigo-500">
              <option>Last 24 Hours</option>
              <option>Last 7 Days</option>
              <option>Last 30 Days</option>
            </select>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mockChartData}>
                <defs>
                  <linearGradient id="colorReqs2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorComp2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="time" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                  itemStyle={{ color: '#e2e8f0' }}
                />
                <Area type="monotone" dataKey="requests" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorReqs2)" name="Requests" />
                <Area type="monotone" dataKey="compute" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#colorComp2)" name="Compute %" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </>
    );
  };

  const renderSettings = () => (
    <>
      <header className="mb-10">
        <h2 className="text-3xl font-bold text-white mb-1">Configuration</h2>
        <p className="text-slate-400">Connect to OpenClaw gateway and configure deployment settings.</p>
      </header>
      <div className="flex flex-col gap-6 flex-1 overflow-y-auto">

        {/* Gateway Connection */}
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center">
              <Link2 size={20} className="text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-white">Gateway Connection</h3>
              <p className="text-sm text-slate-400">Connect to your OpenClaw gateway (default port 18789).</p>
            </div>
            <ConnectionBadge />
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-700/50">
              <div className="flex items-center gap-3 mb-3">
                <Globe size={18} className="text-slate-400" />
                <div>
                  <div className="text-white font-medium">Gateway URL</div>
                  <div className="text-xs text-slate-400">The HTTP address of your OpenClaw gateway</div>
                </div>
              </div>
              <input
                type="text"
                value={formGatewayUrl}
                onChange={(e) => setFormGatewayUrl(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                placeholder="http://localhost:18789"
              />
            </div>

            <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-700/50">
              <div className="flex items-center gap-3 mb-3">
                <Key size={18} className="text-slate-400" />
                <div>
                  <div className="text-white font-medium">Auth Token</div>
                  <div className="text-xs text-slate-400">Bearer token for gateway authentication (leave empty if using mode: none)</div>
                </div>
              </div>
              <input
                type="password"
                value={formGatewayToken}
                onChange={(e) => setFormGatewayToken(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                placeholder="your-gateway-token"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleTestConnection}
                disabled={isLoading}
                className={`bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white px-6 py-2.5 rounded-xl font-medium transition-all shadow-[0_0_20px_rgba(99,102,241,0.3)] flex items-center gap-2 border border-indigo-400/30 ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
                {isLoading ? 'Testing...' : 'Test Connection'}
              </button>
              {saveMsg === 'connected' && (
                <span className="text-emerald-400 text-sm flex items-center gap-1"><CheckCircle2 size={14} /> Gateway connected successfully!</span>
              )}
              {saveMsg === 'failed' && (
                <span className="text-red-400 text-sm flex items-center gap-1"><AlertCircle size={14} /> Cannot reach gateway at {formGatewayUrl}</span>
              )}
            </div>
          </div>
        </div>

        {/* VPN & Port */}
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
              <Shield size={20} className="text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">VPN & Network</h3>
              <p className="text-sm text-slate-400">Configure VPN and assign a permanent port.</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-xl border border-slate-700/50">
              <div className="flex items-center gap-3">
                <Shield size={18} className="text-slate-400" />
                <div>
                  <div className="text-white font-medium">Always-On VPN</div>
                  <div className="text-xs text-slate-400">Keep VPN tunnel active for agent connections</div>
                </div>
              </div>
              <button
                onClick={() => setFormVpn(!formVpn)}
                className={`w-12 h-6 rounded-full transition-all duration-300 relative ${formVpn ? 'bg-indigo-500' : 'bg-slate-600'}`}
              >
                <div className="w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all duration-300" style={{ left: formVpn ? '26px' : '2px' }}></div>
              </button>
            </div>

            <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-700/50">
              <div className="flex items-center gap-3 mb-3">
                <Server size={18} className="text-slate-400" />
                <div>
                  <div className="text-white font-medium">Permanent Port</div>
                  <div className="text-xs text-slate-400">Fixed port for this webapp backend (1-65535)</div>
                </div>
              </div>
              <input
                type="number"
                min={1}
                max={65535}
                value={formPort}
                onChange={(e) => setFormPort(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                placeholder="e.g. 1001"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveSettings}
                disabled={isSaving}
                className={`bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-6 py-2.5 rounded-xl font-medium transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] flex items-center gap-2 border border-emerald-400/30 ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Save size={16} />
                {isSaving ? 'Saving...' : 'Save All Settings'}
              </button>
              {saveMsg === 'saved' && (
                <span className="text-emerald-400 text-sm flex items-center gap-1"><Check size={14} /> Saved! Restart server for port changes.</span>
              )}
            </div>
          </div>
        </div>

        {/* API Reference */}
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
              <Zap size={20} className="text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">API Reference</h3>
              <p className="text-sm text-slate-400">Available OpenClaw gateway endpoints.</p>
            </div>
          </div>
          <div className="space-y-3">
            {[
              { method: 'POST', path: '/v1/chat/completions', desc: 'OpenAI-compatible chat (SSE streaming supported)' },
              { method: 'POST', path: '/v1/responses', desc: 'OpenResponses API (text, files, images, URLs)' },
              { method: 'POST', path: '/tools/invoke', desc: 'Invoke gateway tools (agents, sessions, config)' },
              { method: 'GET', path: '/health', desc: 'Gateway health check' },
              { method: 'GET', path: '/media/:id', desc: 'Media file retrieval (2min TTL)' },
            ].map((ep) => (
              <div key={ep.path} className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-xl border border-slate-700/50">
                <span className={`px-2 py-0.5 rounded text-xs font-bold ${ep.method === 'GET' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                  {ep.method}
                </span>
                <code className="text-indigo-300 text-sm font-mono">{ep.path}</code>
                <span className="text-slate-500 text-xs ml-auto">{ep.desc}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-4">
            All endpoints use Bearer token auth. Set <code className="text-indigo-400">x-openclaw-agent-id</code> header to target a specific agent.
          </p>
        </div>
      </div>
    </>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'agents': return renderAgents();
      case 'analytics': return renderAnalytics();
      case 'settings': return renderSettings();
      default: return renderDashboard();
    }
  };

  return (
    <div className="w-full min-h-screen text-slate-100 font-sans flex relative overflow-hidden">
      <div className="glow-bg"></div>
      <div className="glow-bg-2"></div>

      {/* Sidebar */}
      <aside className="w-64 glass-panel m-4 flex flex-col pt-6 pb-6 px-4 z-10 border-slate-700/50">
        <div className="flex items-center gap-3 px-2 mb-10">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg animate-float">
            <Cpu className="text-white" size={24} />
          </div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
            OpenClaw Deploy
          </h1>
        </div>

        <nav className="flex flex-col gap-2">
          {[
            { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
            { id: 'agents', icon: Server, label: 'Active Agents' },
            { id: 'analytics', icon: Activity, label: 'Analytics' },
            { id: 'settings', icon: Settings, label: 'Configuration' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-300 ${
                activeTab === item.id
                  ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.2)]'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50 border border-transparent'
              }`}
            >
              <item.icon size={20} />
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-auto px-2">
          <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-900/40 to-slate-800/40 border border-indigo-500/20">
            <div className="flex items-center gap-2 mb-2">
              {gatewayConnected ? <Wifi size={14} className="text-emerald-400" /> : <WifiOff size={14} className="text-red-400" />}
              <span className="text-sm font-semibold text-slate-200">Gateway</span>
            </div>
            <p className="text-xs text-slate-400 mb-2 truncate">{settings.gatewayUrl}</p>
            <div className={`text-xs font-medium ${gatewayConnected ? 'text-emerald-400' : 'text-red-400'}`}>
              {gatewayConnected ? `${agents.length} agents connected` : 'Not connected'}
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 right-0 h-screen overflow-y-auto p-4 pl-0 relative z-10 w-full">
        <div className="glass-panel w-full h-full p-8 flex flex-col border-slate-700/50 relative">
          {renderContent()}
        </div>
      </main>

      {/* Deploy Modal */}
      {isDeployModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-2xl bg-slate-800/95 border border-slate-600 p-8 rounded-2xl shadow-2xl relative">
            <button onClick={() => setIsDeployModalOpen(false)} className="absolute top-6 right-6 text-slate-400 hover:text-white transition-colors p-1">
              <X size={24} />
            </button>
            <h2 className="text-2xl font-bold text-white mb-2">Deploy New Agent</h2>
            <p className="text-slate-400 mb-8">Create a new agent via the OpenClaw gateway.</p>

            {!gatewayConnected && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6 flex items-center gap-2 text-amber-300 text-sm">
                <AlertCircle size={16} /> Gateway not connected. Go to Configuration to connect first.
              </div>
            )}

            <form className="space-y-6" onSubmit={handleDeployAgent}>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Agent Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. SalesBot Alpha"
                  className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors shadow-inner"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Model</label>
                <select
                  value={formModel}
                  onChange={(e) => setFormModel(e.target.value)}
                  className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors shadow-inner appearance-none cursor-pointer"
                >
                  <option value="gpt-4o">GPT-4o</option>
                  <option value="claude-3.5-sonnet">Claude 3.5 Sonnet</option>
                  <option value="llama-3-8b-local">Llama 3 (8B, Local)</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-6 border-t border-slate-700/50">
                <button type="button" onClick={() => setIsDeployModalOpen(false)} className="px-6 py-2.5 rounded-xl font-medium text-slate-300 hover:text-white hover:bg-slate-700/50 transition-all border border-transparent hover:border-slate-600">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isDeploying || !gatewayConnected}
                  className={`bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white px-8 py-2.5 rounded-xl font-medium transition-all shadow-[0_0_20px_rgba(99,102,241,0.3)] flex items-center gap-2 border border-indigo-400/30 ${(isDeploying || !gatewayConnected) ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Check size={18} />
                  {isDeploying ? 'Deploying...' : 'Deploy Agent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
