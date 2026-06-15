import React, { useMemo, useRef, useState, useEffect } from 'react';
import * as Icons from 'lucide-react';
import { Play, RefreshCw, Save, FolderOpen, Search, Plus, X, Star, Maximize, Minimize, FileCode, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n.js';

/**
 * ToolPalette — x1zzLang Visual IDE
 *
 * Props:
 *   onRunPipeline   - () => void
 *   onSaveWorkflow  - () => void
 *   onLoadWorkflow  - (event) => void
 *   onExportXzz     - () => void
 *   isRunning       - boolean
 *   autoRun         - boolean
 *   setAutoRun      - (val) => void
 *   availableTools  - Tool[]
 *   viewMode        - 'workflow' | 'split' | 'code'
 *   setViewMode     - (mode) => void
 *   x1zzCode        - string
 *   hasResult       - boolean
 */
const ToolPalette = ({
  onRunPipeline,
  onSaveWorkflow,
  onLoadWorkflow,
  onExportXzz,
  isRunning,
  autoRun,
  setAutoRun,
  availableTools = [],
  viewMode = 'workflow',
  setViewMode,
  x1zzCode = '',
  hasResult = false,
}) => {
  const { t } = useTranslation();
  const fileInputRef  = useRef(null);
  const dropdownRef   = useRef(null);

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery]       = useState('');
  const [isFullscreen, setIsFullscreen]     = useState(false);
  const [canUndo, setCanUndo]               = useState(false);
  const [canRedo, setCanRedo]               = useState(false);
  const [currentLang, setCurrentLang]       = useState(i18n.language || 'en');

  // ── HistoryUpdate event ──────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => { setCanUndo(e.detail.canUndo); setCanRedo(e.detail.canRedo); };
    window.addEventListener('vibe-history-update', handler);
    return () => window.removeEventListener('vibe-history-update', handler);
  }, []);

  // ── Fullscreen ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => console.error(err.message));
    } else {
      document.exitFullscreen();
    }
  };

  // ── Language toggle ──────────────────────────────────────────────────────────
  const toggleLanguage = () => {
    const next = currentLang === 'en' ? 'ko' : 'en';
    i18n.changeLanguage(next);
    setCurrentLang(next);
    localStorage.setItem('x1zzlang_lang', next);
  };

  // ── Favorites ───────────────────────────────────────────────────────────────
  const [favoriteToolIds, setFavoriteToolIds] = useState(() => {
    try {
      const saved = localStorage.getItem('x1zzlang_favorites');
      if (saved) return JSON.parse(saved);
    } catch (_) {}
    return ['fileInput', 'filter', 'select', 'groupBy'];
  });

  const toggleFavorite = (toolId, e) => {
    e.stopPropagation();
    setFavoriteToolIds(prev => {
      const next = prev.includes(toolId) ? prev.filter(id => id !== toolId) : [...prev, toolId];
      localStorage.setItem('x1zzlang_favorites', JSON.stringify(next));
      return next;
    });
  };

  const resetFavorites = () => {
    const defaults = ['fileInput', 'filter', 'select', 'groupBy'];
    setFavoriteToolIds(defaults);
    localStorage.removeItem('x1zzlang_favorites');
  };

  // ── Dropdown outside click ───────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsDropdownOpen(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Drag start ──────────────────────────────────────────────────────────────
  const onDragStart = (e, nodeType) => {
    e.dataTransfer.setData('application/reactflow', nodeType);
    e.dataTransfer.effectAllowed = 'move';
  };

  // ── Category title ───────────────────────────────────────────────────────────
  const getCategoryTitle = (catKey) => {
    const key = `categories.${catKey}`;
    const translated = t(key);
    if (translated === key) {
      return catKey.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
    return translated;
  };

  const getToolName = (tool) => {
    const key = `tools.${tool.id}.name`;
    const translated = t(key);
    return translated === key ? tool.name : translated;
  };

  const getToolDescription = (tool) => {
    const key = `tools.${tool.id}.description`;
    const translated = t(key);
    return translated === key ? tool.description : translated;
  };

  // ── Category grouping ────────────────────────────────────────────────────────
  const categories = useMemo(() => {
    const grouped = { favorites: [] };
    availableTools.forEach(tool => {
      const cat = tool.category || 'misc';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(tool);
      if (favoriteToolIds.includes(tool.id)) grouped.favorites.push(tool);
    });
    return grouped;
  }, [availableTools, favoriteToolIds]);

  // ── DSL step: determine current step ─────────────────────────────────────────
  const dslStep = hasResult ? 3 : (isRunning ? 2 : (x1zzCode ? 1 : 0));

  const dslSteps = [
    { label: 'Workflow', step: 0 },
    { label: 'DSL',      step: 1 },
    { label: 'Compiler', step: 2 },
    { label: 'Execute',  step: 3 },
  ];

  return (
    <div className="tool-palette">
      {/* ── Logo: x1zzLang Visual IDE ─────────────────────────────────────── */}
      <div className="palette-logo">
        <div className="logo-text">
          x1zz<span>Lang</span> Visual IDE
        </div>
      </div>

      <div className="toolbar-divider" />

      {/* ── Add Tool Dropdown ──────────────────────────────────────────────── */}
      <div
        className="tool-dropdown-container"
        style={{ position: 'relative', flexShrink: 0 }}
        ref={dropdownRef}
      >
        <button
          className="toolbar-btn-action"
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          title={t('toolbar.addToolTitle')}
        >
          <Plus size={13} />
          <span>{t('toolbar.addTool')}</span>
        </button>

        {isDropdownOpen && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0,
            background: 'var(--bg-elevated)', border: '1px solid var(--border-color)',
            borderRadius: '7px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            width: '210px', zIndex: 1000, overflow: 'hidden'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '8px 10px', borderBottom: '1px solid var(--border-color)' }}>
              <Search size={13} style={{ color: 'var(--text-muted)', marginRight: 7, flexShrink: 0 }} />
              <input
                autoFocus
                type="text"
                placeholder={t('toolbar.searchTools')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ border: 'none', outline: 'none', width: '100%', fontSize: '0.8rem', background: 'transparent', color: 'var(--text-primary)' }}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-muted)', padding: 0 }}>
                  <X size={12} />
                </button>
              )}
            </div>
            <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
              {Object.entries(categories)
                .filter(([k]) => k !== 'favorites')
                .map(([catKey, tools]) => {
                  const filtered = tools.filter(tool => {
                    const name = getToolName(tool).toLowerCase();
                    const desc = getToolDescription(tool).toLowerCase();
                    const q = searchQuery.toLowerCase();
                    return name.includes(q) || tool.id.toLowerCase().includes(q) || desc.includes(q);
                  });
                  if (filtered.length === 0) return null;
                  return (
                    <div key={catKey}>
                      <div style={{ padding: '5px 10px', fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px', background: 'var(--bg-secondary)' }}>
                        {getCategoryTitle(catKey)}
                      </div>
                      {filtered.map(tool => (
                        <div
                          key={tool.id}
                          onClick={() => {
                            window.dispatchEvent(new CustomEvent('vibe-add-node', { detail: { type: tool.id } }));
                            setIsDropdownOpen(false);
                            setSearchQuery('');
                          }}
                          style={{ padding: '7px 10px', fontSize: '0.78rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          {React.createElement(Icons[tool.icon] || Icons.Square, { size: 13, style: { color: 'var(--text-muted)', flexShrink: 0 } })}
                          <span style={{ fontWeight: 600 }}>{getToolName(tool)}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>

      {/* ── Category Palette ───────────────────────────────────────────────── */}
      <div className="tool-categories">
        {Object.entries(categories).map(([catKey, tools]) => {
          if (tools.length === 0) return null;
          return (
            <div key={catKey} className="category-group">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 4 }}>
                <span className={`category-title ${catKey}`}>
                  {getCategoryTitle(catKey)}
                </span>
                {catKey === 'favorites' && (
                  <button
                    onClick={resetFavorites}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '1px', marginLeft: 2 }}
                    title={t('toolbar.resetFavorites')}
                  >
                    <Icons.RotateCcw size={9} />
                  </button>
                )}
              </div>
              <div className="category-items">
                {tools.map(tool => {
                  const IconComponent = Icons[tool.icon] || Icons.Square;
                  return (
                    <div
                      key={tool.id}
                      className={`tool-item ${catKey}`}
                      draggable
                      onDragStart={e => onDragStart(e, tool.id)}
                      onClick={() => window.dispatchEvent(new CustomEvent('vibe-add-node', { detail: { type: tool.id } }))}
                      title={getToolDescription(tool) || `${t('toolbar.addTool')} ${getToolName(tool)}`}
                    >
                      <IconComponent size={13} strokeWidth={1.6} />
                      <span>{getToolName(tool)}</span>
                      {/* Favorite star */}
                      <div
                        onClick={e => toggleFavorite(tool.id, e)}
                        style={{ position: 'absolute', top: -5, right: -5, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', padding: '2px', background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', zIndex: 10, cursor: 'pointer', opacity: 0, transition: 'opacity 0.12s' }}
                        className="tool-star-btn"
                        title={favoriteToolIds.includes(tool.id) ? 'Remove favorite' : 'Add to favorites'}
                      >
                        <Star size={8} fill={favoriteToolIds.includes(tool.id) ? '#fbbf24' : 'none'} color={favoriteToolIds.includes(tool.id) ? '#fbbf24' : 'var(--text-muted)'} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Right Side Actions ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 'auto' }}>

        {/* DSL Step Indicator */}
        <div className="dsl-step-indicator">
          {dslSteps.map((step, i) => (
            <React.Fragment key={step.label}>
              <span className={`dsl-step ${dslStep === step.step ? 'active' : dslStep > step.step ? 'done' : ''}`}>
                <span className="dsl-step-dot">●</span>
                {step.label}
              </span>
              {i < dslSteps.length - 1 && <span className="dsl-step-line">──</span>}
            </React.Fragment>
          ))}
        </div>

        <div className="toolbar-divider" />

        {/* View mode toggle */}
        {setViewMode && (
          <div className="view-toggle">
            {[
              { mode: 'workflow', label: 'Workflow' },
              { mode: 'split',    label: 'Split' },
              { mode: 'code',     label: 'Code' },
            ].map(({ mode, label }) => (
              <button
                key={mode}
                className={`view-toggle-btn ${viewMode === mode ? 'active' : ''}`}
                onClick={() => setViewMode(mode)}
                title={`${label} view`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="toolbar-divider" />

        {/* Undo / Redo */}
        <button
          className="toolbar-btn"
          style={{ opacity: canUndo ? 1 : 0.35 }}
          onClick={() => canUndo && window.dispatchEvent(new CustomEvent('vibe-undo'))}
          title={t('toolbar.undo')}
          disabled={!canUndo}
        >
          <Icons.Undo size={15} />
        </button>
        <button
          className="toolbar-btn"
          style={{ opacity: canRedo ? 1 : 0.35 }}
          onClick={() => canRedo && window.dispatchEvent(new CustomEvent('vibe-redo'))}
          title={t('toolbar.redo')}
          disabled={!canRedo}
        >
          <Icons.Redo size={15} />
        </button>

        <div className="toolbar-divider" />

        {/* Load / Save */}
        <input type="file" accept=".json" style={{ display: 'none' }} ref={fileInputRef} onChange={onLoadWorkflow} />
        <button className="toolbar-btn" onClick={() => fileInputRef.current?.click()} title={t('toolbar.loadWorkflow')}>
          <FolderOpen size={15} />
        </button>
        <button className="toolbar-btn" onClick={onSaveWorkflow} title={t('toolbar.saveWorkflow')}>
          <Save size={15} />
        </button>

        {/* Export .xzz */}
        <button
          className="toolbar-btn-action"
          onClick={onExportXzz}
          title={t('toolbar.exportXzzTitle')}
          style={{ gap: 5 }}
        >
          <FileCode size={13} />
          <span>{t('toolbar.exportXzz')}</span>
        </button>

        <div className="toolbar-divider" />

        {/* Auto-Run */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none', flexShrink: 0 }} title={t('toolbar.autoRunTitle')}>
          <input type="checkbox" checked={autoRun} onChange={e => setAutoRun(e.target.checked)} style={{ accentColor: 'var(--color-primary)', width: 13, height: 13 }} />
          <span>Auto</span>
        </label>

        {/* Run Button (green) */}
        <button className="run-button" onClick={onRunPipeline} disabled={isRunning} title="Generate x1zzLang code and execute via /execute API">
          {isRunning ? (
            <>
              <RefreshCw className="animate-spin" size={14} />
              <span>{t('toolbar.running')}</span>
            </>
          ) : (
            <>
              <Play size={14} fill="currentColor" />
              <span>{t('toolbar.run')}</span>
            </>
          )}
        </button>

        {/* Language Toggle */}
        <button
          className="toolbar-btn"
          onClick={toggleLanguage}
          title={currentLang === 'en' ? '한국어로 전환' : 'Switch to English'}
          style={{ minWidth: 36 }}
        >
          <Globe size={13} />
          <span style={{ fontSize: '0.62rem', fontWeight: 700 }}>{currentLang.toUpperCase()}</span>
        </button>

        {/* Fullscreen */}
        <button
          className="toolbar-btn"
          onClick={toggleFullscreen}
          title={isFullscreen ? t('toolbar.exitFullscreen') : t('toolbar.enterFullscreen')}
        >
          {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
        </button>
      </div>
    </div>
  );
};

export default ToolPalette;
