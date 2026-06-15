import React, { useRef, useCallback, useState, useEffect } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
  SelectionMode,
  Panel
} from '@xyflow/react';
import { Hand, MousePointer, Search, X, Box, Wand } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import CustomNode from './CustomNode';
import ContainerNode from './ContainerNode';

const nodeTypes = {
  vibeNode: CustomNode,
  container: ContainerNode
};

const FindNodePanel = ({ nodes, onNodeSelect }) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const { setCenter } = useReactFlow();

  const matchingNodes = query.trim() ? nodes.filter(n => 
    n.id.toLowerCase().includes(query.toLowerCase()) || 
    (n.data?.label || '').toLowerCase().includes(query.toLowerCase())
  ) : [];

  const handleSelect = (node) => {
    // Pan to node
    setCenter(node.position.x + 50, node.position.y + 50, { zoom: 1.2, duration: 800 });
    // Select node
    onNodeSelect(node);
    // Close search
    setIsOpen(false);
    setQuery('');
  };

  return (
    <Panel position="top-right" className="find-node-panel">
      {!isOpen ? (
        <button className="mode-btn" onClick={() => setIsOpen(true)} title="Find Tool on Canvas" style={{ background: 'var(--bg-elevated)', padding: '8px', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.4)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
          <Search size={16} />
          <span style={{ fontSize: '12px', fontWeight: 600 }}>Find...</span>
        </button>
      ) : (
        <div style={{ background: 'var(--bg-elevated)', borderRadius: '8px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', border: '1px solid var(--border-color)', width: '250px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--border-color)' }}>
            <Search size={14} style={{ color: 'var(--text-muted)', marginRight: '8px', flexShrink: 0 }} />
            <input 
              autoFocus
              type="text" 
              placeholder="Find by ID or Name..." 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ border: 'none', outline: 'none', width: '100%', fontSize: '12px', background: 'transparent', color: 'var(--text-primary)' }}
            />
            <button onClick={() => { setIsOpen(false); setQuery(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}>
              <X size={14} />
            </button>
          </div>
          {query.trim() && (
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {matchingNodes.length === 0 ? (
                <div style={{ padding: '12px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>No tools found</div>
              ) : (
                matchingNodes.map(node => (
                  <div 
                    key={node.id}
                    onClick={() => handleSelect(node)}
                    style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', borderBottom: '1px solid var(--border-color)' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{node.data?.label || 'Node'}</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>ID: {node.id}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
};

const CanvasContent = ({
  nodes,
  nodeTypes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeSelect,
  onEdgeSelect,
  onAddNode,
  onNodesDelete,
  onEdgesDelete,
  onNodeDragStop,
}) => {
  const reactFlowWrapper = useRef(null);
  const { screenToFlowPosition, fitView } = useReactFlow();

  useEffect(() => {
    const handleFitView = () => {
      fitView({ padding: 0.2, duration: 800 });
    };
    window.addEventListener('vibe-fit-view', handleFitView);
    return () => window.removeEventListener('vibe-fit-view', handleFitView);
  }, [fitView]);

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow');

      // Check if dropped element is valid
      if (!type) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      onAddNode(type, position);
    },
    [screenToFlowPosition, onAddNode]
  );

  const onNodeClick = useCallback((event, node) => {
    onNodeSelect(node);
    if (onEdgeSelect) onEdgeSelect(null);
  }, [onNodeSelect, onEdgeSelect]);

  const onEdgeClick = useCallback((event, edge) => {
    if (onEdgeSelect) onEdgeSelect(edge ? edge.id : null);
    onNodeSelect(null);
  }, [onEdgeSelect, onNodeSelect]);

  const [lastClickedPosition, setLastClickedPosition] = useState(null);

  const onPaneClick = useCallback((event) => {
    onNodeSelect(null);
    if (onEdgeSelect) onEdgeSelect(null);
    
    if (reactFlowWrapper.current && event) {
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      setLastClickedPosition(position);
    }
  }, [onNodeSelect, onEdgeSelect, screenToFlowPosition]);

  const [isPanMode, setIsPanMode] = useState(true);

  // Listen for add node events from ToolPalette
  useEffect(() => {
    const handleAddNodeEvent = (e) => {
      const type = e.detail.type;
      if (reactFlowWrapper.current) {
        let position;
        
        const selectedNodes = nodes.filter(n => n.selected);
        if (selectedNodes.length > 0) {
          // If a node is explicitly selected, place it to the right of that node
          const refNode = selectedNodes[selectedNodes.length - 1];
          position = {
            x: refNode.position.x + 250,
            y: refNode.position.y
          };
        } else if (lastClickedPosition) {
          // If no node is selected, use the exact coordinates of their last canvas click
          position = { ...lastClickedPosition };
        } else {
          // Fallback for empty canvas or no prior clicks: center it relative to the viewport
          const bounds = reactFlowWrapper.current.getBoundingClientRect();
          position = screenToFlowPosition({
            x: bounds.x + bounds.width / 2 - 100,
            y: bounds.y + bounds.height / 2 - 50,
          });
        }
        
        // Prevent stacking
        let conflict = true;
        let offsetMultiplier = 0;
        
        while (conflict && offsetMultiplier < 20) {
          // eslint-disable-next-line no-loop-func
          conflict = nodes.some(n => 
            Math.abs(n.position.x - position.x) < 30 && 
            Math.abs(n.position.y - position.y) < 30
          );
          
          if (conflict) {
            offsetMultiplier++;
            position = {
              x: position.x + 30,
              y: position.y + 30
            };
          }
        }

        onAddNode(type, position);
      }
    };
    window.addEventListener('vibe-add-node', handleAddNodeEvent);
    return () => window.removeEventListener('vibe-add-node', handleAddNodeEvent);
  }, [screenToFlowPosition, onAddNode, nodes]);

  return (
    <div
      ref={reactFlowWrapper}
      className="canvas-container"
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{ width: '100%', height: '100%' }}
    >
      {/* Canvas Interaction Modes */}
      <div className="canvas-mode-controls">
        <button
          className={`mode-btn ${isPanMode ? 'active' : ''}`}
          onClick={() => setIsPanMode(true)}
          title="Pan Mode (Drag to move canvas)"
        >
          <Hand size={14} />
          <span>Pan</span>
        </button>
        <button
          className={`mode-btn ${!isPanMode ? 'active' : ''}`}
          onClick={() => setIsPanMode(false)}
          title="Select Mode (Drag to draw selection box)"
        >
          <MousePointer size={14} />
          <span>Select Box</span>
        </button>

        {nodes.filter(n => n.selected && n.type !== 'container').length > 0 && (
          <div style={{ width: '1px', height: '24px', background: 'var(--border-color)', margin: '0 4px' }} />
        )}
        {nodes.filter(n => n.selected && n.type !== 'container').length > 0 && (
          <button
            className="mode-btn"
            onClick={() => {
              const selectedNodes = nodes.filter(n => n.selected && n.type !== 'container');
              if (selectedNodes.length === 0) return;
              
              // Calculate bounding box
              let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
              selectedNodes.forEach(n => {
                if (n.position.x < minX) minX = n.position.x;
                if (n.position.y < minY) minY = n.position.y;
                if (n.position.x + (n.width || 150) > maxX) maxX = n.position.x + (n.width || 150);
                if (n.position.y + (n.height || 60) > maxY) maxY = n.position.y + (n.height || 60);
              });

              // Add padding
              minX -= 40;
              minY -= 60; // Extra for header
              maxX += 40;
              maxY += 40;

              // Fire custom event to create container and group nodes
              window.dispatchEvent(new CustomEvent('vibe-create-container', {
                detail: {
                  x: minX,
                  y: minY,
                  width: maxX - minX,
                  height: maxY - minY,
                  childIds: selectedNodes.map(n => n.id)
                }
              }));
            }}
            title="Group selected nodes into a Container"
            style={{ color: '#a5b4fc', fontWeight: 600, background: 'rgba(99, 102, 241, 0.15)' }}
          >
            <Box size={14} />
            <span>Put in Container</span>
          </button>
        )}
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onNodeDragStop={onNodeDragStop}
        onNodesDelete={(nodes) => {
          const activeTag = document.activeElement?.tagName;
          if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') {
            return;
          }
          if (onNodesDelete) onNodesDelete(nodes);
        }}
        onEdgesDelete={onEdgesDelete}
        snapToGrid={true}
        snapGrid={[16, 16]}
        panOnDrag={isPanMode}
        selectionOnDrag={!isPanMode}
        selectionMode={SelectionMode.Full}
        connectionRadius={50}
        fitView
        fitViewOptions={{ maxZoom: 1.1, padding: 0.2 }}
        defaultViewport={{ x: 50, y: 50, zoom: 1.1 }}
      >
        <Controls showInteractive={false} style={{ bottom: 15, left: 15 }} />
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="rgba(255, 255, 255, 0.055)" />
        <FindNodePanel nodes={nodes} onNodeSelect={onNodeSelect} />
      </ReactFlow>
    </div>
  );
};

// Wrap in ReactFlowProvider to enable screenToFlowPosition hook
const Canvas = (props) => (
  <ReactFlowProvider>
    <CanvasContent {...props} />
  </ReactFlowProvider>
);

export default Canvas;
