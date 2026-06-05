import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNodesState, useEdgesState, addEdge } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import ToolPalette from './components/ToolPalette';
import Canvas from './components/Canvas';
import ConfigWindow from './components/ConfigWindow';
import ResultsWindow from './components/ResultsWindow';
import ErrorBoundary from './components/ErrorBoundary';
import CustomNode from './components/CustomNode';
import CommentNode from './components/CommentNode';
import ContainerNode from './components/ContainerNode';
import { transpileToX1zz } from './transpiler/x1zzTranspiler.js';
import './App.css';

// ── 백엔드 API Base URL ───────────────────────────────────────────────────────
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

// ── 초기 캔버스 데모 노드 ─────────────────────────────────────────────────────
const initialNodes = [
  {
    id: 'node_1',
    type: 'fileInput',
    position: { x: 100, y: 180 },
    data: {
      label: 'File Input',
      category: 'inout',
      status: 'idle',
      icon: 'Database',
      parameters: {
        filePath: 'employees.csv',
        fileType: 'csv',
        detectedSchema: [
          { name: 'Name',       type: 'String' },
          { name: 'Age',        type: 'Int64'  },
          { name: 'Department', type: 'String' },
          { name: 'Salary',     type: 'Int64'  },
          { name: 'JoinDate',   type: 'String' }
        ]
      }
    }
  },
  {
    id: 'node_2',
    type: 'filter',
    position: { x: 380, y: 180 },
    data: {
      label: 'Filter',
      category: 'prep',
      status: 'idle',
      icon: 'Filter',
      parameters: { column: 'Age', operator: '>', value: '30' }
    }
  }
];

const initialEdges = [
  {
    id: 'edge_1',
    source: 'node_1',
    target: 'node_2',
    sourceHandle: 'output',
    targetHandle: 'input',
    style: { stroke: '#9ca3af', strokeWidth: 1 }
  }
];

// ── 탭 초기 상태 로드 ─────────────────────────────────────────────────────────
const getInitialTabs = () => {
  try {
    const savedTabs = localStorage.getItem('vibeetl_autosave_workflow_tabs');
    if (savedTabs) {
      const parsed = JSON.parse(savedTabs);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
    const savedSingle = localStorage.getItem('vibeetl_autosave_workflow');
    if (savedSingle) {
      const parsed = JSON.parse(savedSingle);
      return [{
        id: 'tab-1',
        name: 'Untitled Workflow',
        nodes: parsed.nodes || initialNodes,
        edges: parsed.edges || initialEdges,
        globalLogs: [],
        isDirty: false
      }];
    }
  } catch (_) {}
  return [{
    id: 'tab-1',
    name: 'Untitled Workflow',
    nodes: initialNodes,
    edges: initialEdges,
    globalLogs: [],
    isDirty: false
  }];
};

// ── 업스트림 스키마 단순 해석 (fileInput detectedSchema 만 참조) ───────────────
function resolveUpstreamSchema(nodeId, nodes, edges) {
  const visited = new Set();

  function walk(id) {
    if (visited.has(id)) return [];
    visited.add(id);

    const node = nodes.find(n => n.id === id);
    if (!node) return [];

    if (node.type === 'fileInput') {
      return node.data?.parameters?.detectedSchema || [];
    }

    const incoming = edges.filter(e => e.target === id);
    for (const edge of incoming) {
      const schema = walk(edge.source);
      if (schema.length > 0) return schema;
    }
    return [];
  }

  const incoming = edges.filter(e => e.target === nodeId);
  for (const edge of incoming) {
    const schema = walk(edge.source);
    if (schema.length > 0) return schema;
  }
  return [];
}

// ── 지원 도구 목록 (SUPPORTED_OPS 전용) ──────────────────────────────────────
const BUILTIN_TOOLS = [
  { id: 'fileInput', name: 'File Input', category: 'inout',     icon: 'Database',      description: 'Load data from a CSV/Excel file' },
  { id: 'filter',    name: 'Filter',     category: 'prep',      icon: 'Filter',        description: 'Filter rows by condition' },
  { id: 'select',    name: 'Select',     category: 'prep',      icon: 'Columns',       description: 'Select columns' },
  { id: 'groupBy',   name: 'Group By',   category: 'transform', icon: 'Group',         description: 'Group by column and aggregate (count/sum/mean/min/max)' },
  { id: 'count',     name: 'Count',      category: 'transform', icon: 'Hash',          description: 'Count rows' },
  { id: 'sort',      name: 'Sort',       category: 'prep',      icon: 'ArrowUpDown',   description: 'Sort rows by column (orderBy)' },
  { id: 'take',      name: 'Take',       category: 'prep',      icon: 'Scissors',      description: 'Take first N rows' },
  { id: 'dropNull',  name: 'Drop Null',  category: 'prep',      icon: 'Trash2',        description: 'Drop rows with null values' },
  { id: 'fillNull',  name: 'Fill Null',  category: 'prep',      icon: 'PenLine',       description: 'Fill null values with a literal' },
];

// ── App ───────────────────────────────────────────────────────────────────────
function App() {
  const { t } = useTranslation();
  const [tabs, setTabs]             = useState(getInitialTabs);
  const [activeTabId, setActiveTabId] = useState(() => getInitialTabs()[0]?.id || 'tab-1');

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

  const [nodes, setNodes, onNodesChangeCore] = useNodesState(activeTab.nodes || []);
  const [edges, setEdges, onEdgesChange]      = useEdgesState(activeTab.edges || []);
  const [isRunning, setIsRunning]       = useState(false);
  const [executeResult, setExecuteResult] = useState(null); // { rows, schema, logs }
  const [globalLogs, setGlobalLogs]     = useState(activeTab.globalLogs || []);
  const [isDirty, setIsDirty]           = useState(activeTab.isDirty || false);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [selectedHandle, setSelectedHandle] = useState(null);
  const [x1zzCode, setX1zzCode]         = useState('');
  const [autoRun, setAutoRun]           = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [resultsHeight, setResultsHeight] = useState(280);

  // ── 탭-캔버스 동기화 ────────────────────────────────────────────────────────
  useEffect(() => {
    const tab = tabs.find(t => t.id === activeTabId);
    if (tab) {
      setNodes(tab.nodes || []);
      setEdges(tab.edges || []);
      setGlobalLogs(tab.globalLogs || []);
      setIsDirty(tab.isDirty || false);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setExecuteResult(null);
    }
  }, [activeTabId, setNodes, setEdges]); // tabs 의존성 의도적 제외 (재귀 방지)

  // ── 드래그 추적 ─────────────────────────────────────────────────────────────
  const isDraggingNode = React.useRef(false);
  const onNodesChange = useCallback((changes) => {
    onNodesChangeCore(changes);
    if (changes.some(c => c.type === 'position' || c.type === 'dimensions')) {
      isDraggingNode.current = true;
    }
  }, [onNodesChangeCore]);

  // ── Undo / Redo ─────────────────────────────────────────────────────────────
  const [past, setPast]     = useState([]);
  const [future, setFuture] = useState([]);
  const lastSavedState = React.useRef({ nodes: [], edges: [] });
  const isRestoring    = React.useRef(false);

  useEffect(() => {
    setPast([]);
    setFuture([]);
    lastSavedState.current = { nodes, edges };
  }, [activeTabId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isRestoring.current) { isRestoring.current = false; return; }
    const timer = setTimeout(() => {
      const strip = (nds, eds) => ({
        nodes: nds.map(n => ({ ...n, selected: false, dragging: false, positionAbsolute: undefined })),
        edges: eds.map(e => ({ ...e, selected: false }))
      });
      const curr = JSON.stringify(strip(nodes, edges));
      const last = JSON.stringify(strip(lastSavedState.current.nodes || [], lastSavedState.current.edges || []));
      if (curr !== last) {
        setPast(p => {
          setFuture([]);
          const copy = { nodes: (lastSavedState.current.nodes || []).map(n => ({...n})), edges: (lastSavedState.current.edges || []).map(e => ({...e})) };
          return [...p.slice(-49), copy];
        });
        lastSavedState.current = { nodes: nodes.map(n => ({...n})), edges: edges.map(e => ({...e})) };
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [nodes, edges]);

  useEffect(() => {
    const handleUndo = () => {
      setPast(p => {
        if (p.length === 0) return p;
        isRestoring.current = true;
        const previous = p[p.length - 1];
        setFuture(f => [{ nodes: lastSavedState.current.nodes.map(n=>({...n})), edges: lastSavedState.current.edges.map(e=>({...e})) }, ...f]);
        const rn = previous.nodes.map(n => ({...n}));
        const re = previous.edges.map(e => ({...e}));
        setNodes(rn); setEdges(re);
        lastSavedState.current = { nodes: rn, edges: re };
        setSelectedNodeId(null); setSelectedEdgeId(null);
        return p.slice(0, -1);
      });
    };
    const handleRedo = () => {
      setFuture(f => {
        if (f.length === 0) return f;
        isRestoring.current = true;
        const next = f[0];
        setPast(p => [...p, { nodes: lastSavedState.current.nodes.map(n=>({...n})), edges: lastSavedState.current.edges.map(e=>({...e})) }]);
        const rn = next.nodes.map(n => ({...n}));
        const re = next.edges.map(e => ({...e}));
        setNodes(rn); setEdges(re);
        lastSavedState.current = { nodes: rn, edges: re };
        setSelectedNodeId(null); setSelectedEdgeId(null);
        return f.slice(1);
      });
    };
    window.addEventListener('vibe-undo', handleUndo);
    window.addEventListener('vibe-redo', handleRedo);
    window.dispatchEvent(new CustomEvent('vibe-history-update', { detail: { canUndo: past.length > 0, canRedo: future.length > 0 } }));
    return () => { window.removeEventListener('vibe-undo', handleUndo); window.removeEventListener('vibe-redo', handleRedo); };
  }, [setNodes, setEdges, past.length, future.length]);

  // ── Handle Click / Container / Comment イベント ──────────────────────────────
  useEffect(() => {
    const onHandleClick = (e) => { setSelectedHandle(e.detail); setSelectedNodeId(e.detail.nodeId); };
    window.addEventListener('vibe-handle-click', onHandleClick);
    return () => window.removeEventListener('vibe-handle-click', onHandleClick);
  }, []);

  useEffect(() => {
    const handleCreateContainer = (e) => {
      const { x, y, width, height, childIds } = e.detail;
      const maxId = nodes.reduce((max, n) => {
        const m = n.id.match(/^node_(\d+)$/);
        return m && parseInt(m[1]) < 1000000 ? Math.max(max, parseInt(m[1])) : max;
      }, 0);
      const containerId = `node_${maxId + 1}`;
      const containerNode = { id: containerId, type: 'container', position: { x, y }, style: { width, height }, data: { label: 'Tool Container', enabled: true } };
      setNodes(nds => {
        let rest = []; let children = [];
        nds.forEach(n => {
          if (childIds.includes(n.id)) {
            const { positionAbsolute: _, ...r } = n;
            children.push({ ...r, parentId: containerId, position: { x: (n.positionAbsolute?.x || n.position.x) - x, y: (n.positionAbsolute?.y || n.position.y) - y } });
          } else { rest.push(n); }
        });
        return [...rest, containerNode, ...children];
      });
      setSelectedNodeId(containerId);
    };

    const handleToggleContainer = (e) => {
      const { nodeId, enabled } = e.detail;
      setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, enabled } } : n));
    };

    const handleToggleMinimizeContainer = (e) => {
      const { nodeId, minimized } = e.detail;
      setNodes(nds => {
        let newNodes = [...nds];
        const idx = newNodes.findIndex(n => n.id === nodeId);
        if (idx === -1) return newNodes;
        const c = newNodes[idx];
        let newStyle = { ...c.style };
        let newData  = { ...c.data, minimized };
        if (minimized) {
          newData.previousWidth  = c.style?.width  || 300;
          newData.previousHeight = c.style?.height || 200;
          const label = c.data?.parameters?.label || c.data?.label || 'Tool Container';
          newStyle.width  = Math.max(250, label.length * 8 + 80);
          newStyle.height = 60;
          newNodes = newNodes.map(n => n.parentId === nodeId ? { ...n, hidden: true }  : n);
        } else {
          newStyle.width  = newData.previousWidth  || 300;
          newStyle.height = newData.previousHeight || 200;
          newNodes = newNodes.map(n => n.parentId === nodeId ? { ...n, hidden: false } : n);
        }
        newNodes[idx] = { ...c, style: newStyle, data: newData };
        return newNodes;
      });
      const childIds = nodes.filter(n => n.parentId === nodeId).map(n => n.id);
      if (childIds.length > 0) {
        setEdges(eds => eds.map(edge => {
          const srcChild = childIds.includes(edge.source);
          const tgtChild = childIds.includes(edge.target);
          if (minimized) {
            if (srcChild && tgtChild) return { ...edge, hidden: true };
            if (srcChild && !tgtChild) return { ...edge, originalSource: edge.source, originalSourceHandle: edge.sourceHandle, source: nodeId, sourceHandle: 'output' };
            if (tgtChild && !srcChild) return { ...edge, originalTarget: edge.target, originalTargetHandle: edge.targetHandle, target: nodeId, targetHandle: 'input' };
          } else {
            let ne = { ...edge };
            if (edge.source === nodeId && edge.originalSource) { ne.source = edge.originalSource; ne.sourceHandle = edge.originalSourceHandle; delete ne.originalSource; delete ne.originalSourceHandle; }
            if (edge.target === nodeId && edge.originalTarget) { ne.target = edge.originalTarget; ne.targetHandle = edge.originalTargetHandle; delete ne.originalTarget; delete ne.originalTargetHandle; }
            if (srcChild && tgtChild) ne.hidden = false;
            return ne;
          }
          return edge;
        }));
      }
    };

    const handleUngroupContainer = (e) => {
      const { nodeId } = e.detail;
      setNodes(nds => {
        const c = nds.find(n => n.id === nodeId);
        if (!c) return nds;
        const cx = c.positionAbsolute?.x || c.position.x;
        const cy = c.positionAbsolute?.y || c.position.y;
        let result = [];
        nds.forEach(n => {
          if (n.id === nodeId) return;
          if (n.parentId === nodeId) result.push({ ...n, parentId: undefined, extent: undefined, hidden: false, position: { x: cx + n.position.x, y: cy + n.position.y } });
          else result.push(n);
        });
        return result;
      });
      setEdges(eds => eds.map(edge => {
        let ne = { ...edge };
        if (edge.source === nodeId && edge.originalSource) { ne.source = edge.originalSource; ne.sourceHandle = edge.originalSourceHandle; delete ne.originalSource; delete ne.originalSourceHandle; }
        if (edge.target === nodeId && edge.originalTarget) { ne.target = edge.originalTarget; ne.targetHandle = edge.originalTargetHandle; delete ne.originalTarget; delete ne.originalTargetHandle; }
        if (ne.hidden) ne.hidden = false;
        return ne;
      }));
      setSelectedNodeId(null);
    };

    const handleNodeDragStop = (e) => {
      const { nodeId, containerId, positionAbsolute, width, height } = e.detail;
      setNodes(nds => {
        const node = nds.find(n => n.id === nodeId);
        if (!node) return nds;
        if (node.type === 'container') {
          const cX = positionAbsolute.x, cY = positionAbsolute.y;
          const toAbsorb = nds.filter(n => {
            if (n.type === 'container' || n.parentId === nodeId) return false;
            const nX = n.positionAbsolute?.x || n.position.x, nY = n.positionAbsolute?.y || n.position.y;
            const nW = n.measured?.width || 150, nH = n.measured?.height || 60;
            return (nX + nW/2) >= cX && (nY + nH/2) >= cY && (nX + nW/2) <= cX+width && (nY + nH/2) <= cY+height;
          });
          if (toAbsorb.length === 0) return nds;
          const childIds2 = toAbsorb.map(n => n.id);
          let res = nds.map(n => childIds2.includes(n.id) ? { ...n, parentId: nodeId, position: { x: (n.positionAbsolute?.x || n.position.x) - cX, y: (n.positionAbsolute?.y || n.position.y) - cY } } : n);
          const co = res.find(n => n.id === nodeId);
          res = res.filter(n => n.id !== nodeId);
          res.unshift(co);
          return res;
        }
        if (containerId) {
          const container = nds.find(n => n.id === containerId);
          if (container && node.parentId !== containerId) {
            let res = nds.map(n => n.id === nodeId ? { ...n, parentId: containerId, position: { x: positionAbsolute.x - (container.positionAbsolute?.x || container.position.x), y: positionAbsolute.y - (container.positionAbsolute?.y || container.position.y) } } : n);
            const cIdx = res.findIndex(n => n.id === containerId);
            const nIdx = res.findIndex(n => n.id === nodeId);
            if (nIdx < cIdx) { const no = res[nIdx]; res.splice(nIdx, 1); const newCI = res.findIndex(n => n.id === containerId); res.splice(newCI + 1, 0, no); }
            return res;
          }
        } else if (node.parentId) {
          return nds.map(n => n.id === nodeId ? { ...n, parentId: undefined, extent: undefined, position: positionAbsolute } : n);
        }
        return nds;
      });
    };

    const handleCreateComment = (e) => {
      const { x, y } = e.detail;
      const maxId = nodes.reduce((max, n) => { const m = n.id.match(/^node_(\d+)$/); return m && parseInt(m[1]) < 1000000 ? Math.max(max, parseInt(m[1])) : max; }, 0);
      const id = `node_${maxId + 1}`;
      setNodes(nds => [...nds, { id, type: 'comment', position: { x, y }, style: { width: 250, height: 150 }, data: { label: 'Comment', parameters: {} }, zIndex: -1 }]);
      setSelectedNodeId(id);
    };

    const handleUpdateComment = (e) => {
      const { nodeId, text } = e.detail;
      setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, parameters: { ...(n.data.parameters || {}), text } } } : n));
    };

    window.addEventListener('vibe-create-container', handleCreateContainer);
    window.addEventListener('vibe-toggle-container', handleToggleContainer);
    window.addEventListener('vibe-toggle-minimize-container', handleToggleMinimizeContainer);
    window.addEventListener('vibe-ungroup-container', handleUngroupContainer);
    window.addEventListener('vibe-node-drag-stop', handleNodeDragStop);
    window.addEventListener('vibe-create-comment', handleCreateComment);
    window.addEventListener('vibe-update-comment', handleUpdateComment);
    return () => {
      window.removeEventListener('vibe-create-container', handleCreateContainer);
      window.removeEventListener('vibe-toggle-container', handleToggleContainer);
      window.removeEventListener('vibe-toggle-minimize-container', handleToggleMinimizeContainer);
      window.removeEventListener('vibe-ungroup-container', handleUngroupContainer);
      window.removeEventListener('vibe-node-drag-stop', handleNodeDragStop);
      window.removeEventListener('vibe-create-comment', handleCreateComment);
      window.removeEventListener('vibe-update-comment', handleUpdateComment);
    };
  }, [nodes, setNodes, setEdges]);

  // ── 탭 관리 ─────────────────────────────────────────────────────────────────
  const handleTabChange = useCallback((newTabId) => {
    if (newTabId === activeTabId) return;
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, nodes, edges, globalLogs, isDirty } : t));
    setActiveTabId(newTabId);
  }, [activeTabId, nodes, edges, globalLogs, isDirty]);

  const handleAddTab = useCallback(() => {
    setTabs(prev => {
      const saved = prev.map(t => t.id === activeTabId ? { ...t, nodes, edges, globalLogs, isDirty } : t);
      const newId = `tab-${Date.now()}`;
      setActiveTabId(newId);
      return [...saved, { id: newId, name: `Workflow ${saved.length + 1}`, nodes: [], edges: [], globalLogs: [], isDirty: false }];
    });
  }, [activeTabId, nodes, edges, globalLogs, isDirty]);

  const handleCloseTab = useCallback((idToClose) => {
    setTabs(prev => {
      const next = prev.filter(t => t.id !== idToClose);
      if (next.length === 0) return prev;
      if (idToClose === activeTabId) setActiveTabId(next[next.length - 1].id);
      return next;
    });
  }, [activeTabId]);

  // ── 키보드 단축키 (Delete / Copy / Paste) ─────────────────────────────────
  React.useEffect(() => {
    const onKeyDown = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (selectedNodeId) {
          e.preventDefault();
          setNodes(nds => nds.filter(n => n.id !== selectedNodeId));
          setEdges(eds => eds.filter(e2 => e2.source !== selectedNodeId && e2.target !== selectedNodeId));
          setSelectedNodeId(null);
        } else if (selectedEdgeId) {
          e.preventDefault();
          setEdges(eds => eds.filter(e2 => e2.id !== selectedEdgeId));
          setSelectedEdgeId(null);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        const sel = nodes.filter(n => n.selected || n.id === selectedNodeId);
        const children = nodes.filter(n => sel.some(s => s.id === n.parentId) && !sel.includes(n));
        const all = [...sel, ...children];
        const ids = all.map(n => n.id);
        const selEdges = edges.filter(e2 => ids.includes(e2.source) && ids.includes(e2.target));
        if (all.length > 0) localStorage.setItem('vibeetl_clipboard', JSON.stringify({ nodes: all, edges: selEdges }));
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        const cb = localStorage.getItem('vibeetl_clipboard');
        if (!cb) return;
        try {
          const parsed = JSON.parse(cb);
          const maxId = nodes.reduce((max, n) => { const m = n.id.match(/^node_(\d+)$/); return m && parseInt(m[1]) < 1000000 ? Math.max(max, parseInt(m[1])) : max; }, 0);
          let counter = maxId + 1;
          const idMap = {};
          const newNodes = (parsed.nodes || []).map(n => {
            const newId = `node_${counter++}`;
            idMap[n.id] = newId;
            return { ...n, id: newId, position: { x: n.position.x + 50, y: n.position.y + 50 }, selected: true };
          });
          newNodes.forEach(n => { if (n.parentId && idMap[n.parentId]) n.parentId = idMap[n.parentId]; });
          const newEdges = (parsed.edges || []).map(e2 => ({ ...e2, id: `edge_${Date.now()}_${Math.floor(Math.random()*1000)}`, source: idMap[e2.source]||e2.source, target: idMap[e2.target]||e2.target, selected: true }));
          setNodes(nds => nds.map(n => ({...n, selected:false})).concat(newNodes));
          setEdges(eds => eds.map(e2 => ({...e2, selected:false})).concat(newEdges));
        } catch (err) { console.error('Paste failed', err); }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [nodes, edges, selectedNodeId, selectedEdgeId, setNodes, setEdges]);

  // ── 자동 저장 ────────────────────────────────────────────────────────────────
  const isFirstRender = React.useRef(true);
  React.useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    if (isDraggingNode.current) return;
    setIsDirty(true);
    localStorage.setItem('vibeetl_autosave_workflow', JSON.stringify({ nodes, edges }));
    const synced = tabs.map(t => t.id === activeTabId ? { ...t, nodes, edges, isDirty: true } : t);
    localStorage.setItem('vibeetl_autosave_workflow_tabs', JSON.stringify(synced));
  }, [nodes, edges, tabs, activeTabId]);

  React.useEffect(() => {
    const onBeforeUnload = (e) => { if (isDirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  // ── x1zzLang 코드 실시간 생성 ────────────────────────────────────────────────
  const generatedX1zzCode = useMemo(() => {
    try {
      return transpileToX1zz(nodes, edges);
    } catch (err) {
      console.error('x1zz transpilation error:', err);
      return `// Transpilation error: ${err.message}`;
    }
  }, [nodes, edges]);

  React.useEffect(() => { setX1zzCode(generatedX1zzCode); }, [generatedX1zzCode]);

  // ── .xzz 파일 내보내기 ────────────────────────────────────────────────────────
  const handleExportXzz = useCallback(() => {
    if (!x1zzCode) return;
    const a = document.createElement('a');
    a.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(x1zzCode));
    a.setAttribute('download', `${tabs.find(t => t.id === activeTabId)?.name || 'pipeline'}.xzz`);
    document.body.appendChild(a); a.click(); a.remove();
  }, [x1zzCode, tabs, activeTabId]);

  // ── 파이프라인 실행: generate → POST /execute → 결과 표시 ─────────────────────
  const handleRunPipeline = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setExecuteResult(null);

    // 1. x1zzLang 코드 생성
    let xCode = '';
    try {
      xCode = transpileToX1zz(nodes, edges);
      setX1zzCode(xCode);
      console.log('--- Generated x1zzLang Code ---\n', xCode);
    } catch (err) {
      setGlobalLogs([`❌ Transpilation error: ${err.message}`]);
      setIsRunning(false);
      return;
    }

    const nodeCount = nodes.filter(n => n.type !== 'comment' && n.type !== 'container').length;

    if (nodeCount === 0) {
      setGlobalLogs(['⚠️  No nodes on the canvas. Add nodes to build a pipeline.']);
      setIsRunning(false);
      return;
    }

    // 2. POST /execute
    setGlobalLogs([
      '🔄 Transpiling DAG to x1zzLang...',
      `📊 Processing ${nodeCount} node(s)...`,
      '📡 Sending to x1zzLang backend (/execute)...',
    ]);

    try {
      const response = await fetch(`${API_BASE}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: xCode })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errText}`);
      }

      const data = await response.json();

      if (data.success) {
        setExecuteResult({ rows: data.rows || [], schema: data.schema || {}, logs: data.logs || [] });
        setGlobalLogs([
          '✅ Execution complete.',
          ...(data.logs || []),
          `📦 ${(data.rows || []).length} row(s) returned.`,
        ]);
        // 성공 시 노드 상태 업데이트
        setNodes(nds => nds.map(n => ({
          ...n,
          data: { ...n.data, status: (n.type === 'comment' || n.type === 'container') ? 'idle' : 'success' }
        })));
      } else {
        const errMsg = data.error || 'Unknown execution error';
        setGlobalLogs([`❌ Execution failed: ${errMsg}`, ...(data.logs || [])]);
        setNodes(nds => nds.map(n => ({
          ...n,
          data: { ...n.data, status: (n.type === 'comment' || n.type === 'container') ? 'idle' : 'error' }
        })));
      }
    } catch (err) {
      setGlobalLogs([
        `❌ Backend error: ${err.message}`,
        '💡 Is the x1zzLang backend running?',
        `💡 Expected endpoint: POST ${API_BASE}/execute`,
        '💡 You can still export the .xzz code below.',
      ]);
      setNodes(nds => nds.map(n => ({
        ...n,
        data: { ...n.data, status: (n.type === 'comment' || n.type === 'container') ? 'idle' : 'idle' }
      })));
    }

    setIsRunning(false);
  };

  // ── Auto-Run (DAG 변경 시 자동 transpile + execute) ──────────────────────────
  const dagConfigStr = useMemo(() => {
    const mn = nodes.map(n => ({ id: n.id, type: n.type, parameters: n.data?.parameters }));
    const me = edges.map(e => ({ id: e.id, source: e.source, target: e.target }));
    return JSON.stringify({ nodes: mn, edges: me });
  }, [nodes, edges]);

  const runPipelineRef = React.useRef(handleRunPipeline);
  React.useEffect(() => { runPipelineRef.current = handleRunPipeline; }, [handleRunPipeline]);

  React.useEffect(() => {
    if (!autoRun) return;
    const t = setTimeout(() => runPipelineRef.current(), 400);
    return () => clearTimeout(t);
  }, [dagConfigStr, autoRun]);

  // ── 엣지 스타일 동기화 ───────────────────────────────────────────────────────
  React.useEffect(() => {
    setEdges(eds => {
      let changed = false;
      const next = eds.map(edge => {
        const src = nodes.find(n => n.id === edge.source);
        const status = src?.data?.status || 'idle';
        let stroke = '#9ca3af'; let strokeWidth = 1; let animated = false;
        if (status === 'running')  { stroke = '#3b82f6'; animated = true; }
        else if (status === 'success') { stroke = '#10b981'; strokeWidth = 1.5; }
        else if (status === 'error')   { stroke = '#ef4444'; strokeWidth = 1.5; }
        if (edge.style?.stroke !== stroke || edge.style?.strokeWidth !== strokeWidth || edge.animated !== animated) {
          changed = true;
          const { type: _t, ...rest } = edge;
          return { ...rest, type: 'default', animated, style: { ...edge.style, stroke, strokeWidth } };
        }
        return edge;
      });
      return changed ? next : eds;
    });
  }, [nodes, setEdges]);

  // ── 노드 추가 ────────────────────────────────────────────────────────────────
  const onConnect = useCallback((params) => {
    setEdges(eds => addEdge({ ...params, id: `e-${params.source}-${params.target}`, style: { stroke: '#9ca3af', strokeWidth: 1 } }, eds));
  }, [setEdges]);

  const handleUpdateParams = useCallback((nodeId, newParams) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, status: 'idle', parameters: newParams } } : n));
  }, [setNodes]);

  const handleAddNode = useCallback((type, position) => {
    const toolDef = BUILTIN_TOOLS.find(t => t.id === type);
    const label = toolDef?.name || type;
    const category = toolDef?.category || 'misc';
    const icon = toolDef?.icon || 'Square';

    // 기본 파라미터 (SUPPORTED_OPS 전용)
    const DEFAULT_PARAMS = {
      fileInput: { filePath: '', fileType: 'csv', detectedSchema: [] },
      filter:    { column: '', operator: '==', value: '' },
      select:    { columns: [] },
      groupBy:   { column: '', agg: 'count' },
      count:     {},
      sort:      { column: '', descending: false },
      take:      { n: 100 },
      dropNull:  { columns: [] },
      fillNull:  { column: '', value: '' },
    };

    const maxId = nodes.reduce((max, n) => { const m = n.id.match(/^node_(\d+)$/); return m && parseInt(m[1]) < 1000000 ? Math.max(max, parseInt(m[1])) : max; }, 0);
    const newNodeId = `node_${maxId + 1}`;

    setNodes(nds => nds.concat({
      id: newNodeId,
      type,
      position,
      data: { label, category, icon, parameters: DEFAULT_PARAMS[type] || {}, status: 'idle', error: null }
    }));
    setSelectedNodeId(newNodeId);
  }, [setNodes, nodes]);

  const onNodesDelete = useCallback((deleted) => {
    if (deleted.some(n => n.id === selectedNodeId)) setSelectedNodeId(null);
  }, [selectedNodeId]);

  const selectedNode = useMemo(() => nodes.find(n => n.id === selectedNodeId) || null, [nodes, selectedNodeId]);

  // 업스트림 스키마 (ConfigWindow의 컬럼 선택 UI용)
  const upstreamSchema = useMemo(() => {
    if (!selectedNodeId) return [];
    const node = nodes.find(n => n.id === selectedNodeId);
    if (!node || node.type === 'fileInput') return [];
    return resolveUpstreamSchema(selectedNodeId, nodes, edges);
  }, [selectedNodeId, nodes, edges]);

  // ── 리사이즈 핸들러 ──────────────────────────────────────────────────────────
  const isResizing = React.useRef(false);
  const startResizing = useCallback((e) => {
    isResizing.current = true;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    const onMove = (ev) => { if (!isResizing.current) return; const w = ev.clientX; if (w > 220 && w < 700) setSidebarWidth(w); };
    const onUp   = ()   => { isResizing.current = false; document.body.style.userSelect = ''; document.body.style.cursor = ''; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  const isResizingResults = React.useRef(false);
  const startResizingResults = useCallback((e) => {
    isResizingResults.current = true;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'row-resize';
    const onMove = (ev) => { if (!isResizingResults.current) return; const h = window.innerHeight - ev.clientY; if (h > 120 && h < 600) setResultsHeight(h); };
    const onUp   = ()   => { isResizingResults.current = false; document.body.style.userSelect = ''; document.body.style.cursor = ''; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  // ── 저장 / 불러오기 / 내보내기 ───────────────────────────────────────────────
  const handleSaveWorkflow = () => {
    setIsDirty(false);
    const a = document.createElement('a');
    a.setAttribute('href', 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify({ nodes, edges })));
    a.setAttribute('download', `${tabs.find(t => t.id === activeTabId)?.name || 'workflow'}.json`);
    document.body.appendChild(a); a.click(); a.remove();
  };

  const handleLoadWorkflow = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const loaded = JSON.parse(ev.target.result);
        if (loaded.nodes && loaded.edges) {
          setTabs(prev => {
            const saved = prev.map(t => t.id === activeTabId ? { ...t, nodes, edges, globalLogs, isDirty } : t);
            const newId = `tab-${Date.now()}`;
            setActiveTabId(newId);
            return [...saved, { id: newId, name: file.name.replace('.json', ''), nodes: loaded.nodes, edges: loaded.edges, globalLogs: ['Workflow loaded.'], isDirty: false }];
          });
        } else { alert('Invalid workflow file format.'); }
      } catch (_) { alert('Failed to parse workflow file.'); }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  // ── nodeTypes ─────────────────────────────────────────────────────────────────
  const nodeTypes = useMemo(() => {
    const types = { custom: CustomNode, comment: CommentNode, container: ContainerNode };
    BUILTIN_TOOLS.forEach(t => { types[t.id] = CustomNode; });
    return types;
  }, []);

  // 검사 노드 (handle click 로직)
  const getInspectedNode = () => {
    const sn = nodes.find(n => n.id === selectedNodeId);
    if (!sn) return null;
    if (selectedHandle?.nodeId === sn.id && selectedHandle?.handleType === 'target') {
      const edge = edges.find(e => e.target === sn.id && (e.targetHandle === selectedHandle.handleId || !e.targetHandle));
      if (edge) return nodes.find(n => n.id === edge.source) || sn;
    }
    return sn;
  };
  const inspectedNode = getInspectedNode();

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="app-container">
      <ToolPalette
        onRunPipeline={handleRunPipeline}
        onSaveWorkflow={handleSaveWorkflow}
        onLoadWorkflow={handleLoadWorkflow}
        onExportXzz={handleExportXzz}
        isRunning={isRunning}
        autoRun={autoRun}
        setAutoRun={setAutoRun}
        availableTools={BUILTIN_TOOLS}
      />

      <div className="workspace-container">
        <ErrorBoundary>
          <ConfigWindow
            selectedNode={selectedNode}
            upstreamSchema={upstreamSchema}
            onUpdateParams={handleUpdateParams}
            availableTools={BUILTIN_TOOLS}
            nodes={nodes}
            edges={edges}
            setNodes={setNodes}
            style={{ width: `${sidebarWidth}px` }}
          />
        </ErrorBoundary>

        <div className="sidebar-resizer" onMouseDown={startResizing} />

        <div className="main-content">
          {/* 탭 바 */}
          <div className="tab-bar">
            {tabs.map(tab => (
              <div key={tab.id} className={`tab-item ${tab.id === activeTabId ? 'active' : ''}`} onClick={() => handleTabChange(tab.id)}>
                <span className="tab-title" onDoubleClick={() => { const n = prompt(t('tabs.renamePrompt'), tab.name); if (n) setTabs(p => p.map(t => t.id === tab.id ? { ...t, name: n } : t)); }}>{tab.name}</span>
                {tabs.length > 1 && (
                  <button className="tab-close-btn" onClick={(e) => { e.stopPropagation(); handleCloseTab(tab.id); }}>×</button>
                )}
              </div>
            ))}
            <button className="tab-add-btn" onClick={handleAddTab}>+</button>
          </div>

          {/* 캔버스 */}
          <div style={{ flex: 1, position: 'relative' }}>
            <ErrorBoundary>
              <Canvas
                key={activeTabId}
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeSelect={(node) => { setSelectedNodeId(node?.id || null); setSelectedHandle(null); }}
                onEdgeSelect={setSelectedEdgeId}
                onAddNode={handleAddNode}
                onNodesDelete={onNodesDelete}
                onNodeDragStop={() => {
                  isDraggingNode.current = false;
                  setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, nodes, edges, isDirty: true } : t));
                }}
              />
            </ErrorBoundary>
          </div>

          {/* 결과 패널 */}
          <div className="results-resizer" onMouseDown={startResizingResults} />
          <ErrorBoundary>
            <ResultsWindow
              selectedNode={inspectedNode}
              originalNode={nodes.find(n => n.id === selectedNodeId)}
              executeResult={executeResult}
              globalLogs={globalLogs}
              x1zzCode={x1zzCode}
              style={{ height: `${resultsHeight}px` }}
            />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}

export default App;
