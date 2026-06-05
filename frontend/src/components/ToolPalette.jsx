import React, { useMemo, useRef, useState, useEffect } from 'react';
import * as Icons from 'lucide-react';
import { Play, RefreshCw, Save, FolderOpen, Search, Plus, X, Star, Maximize, Minimize, FileCode, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n.js';

/**
 * ToolPalette
 *
 * Props (SUPPORTED_OPS 전용으로 단순화):
 *   onRunPipeline   - () => void
 *   onSaveWorkflow  - () => void
 *   onLoadWorkflow  - (event) => void
 *   onExportXzz     - () => void
 *   isRunning       - boolean
 *   autoRun         - boolean
 *   setAutoRun      - (val) => void
 *   availableTools  - Tool[]
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

  // ── HistoryUpdate イベント ───────────────────────────────────────────────────
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

  // ── 언어 전환 ────────────────────────────────────────────────────────────────
  const toggleLanguage = () => {
    const next = currentLang === 'en' ? 'ko' : 'en';
    i18n.changeLanguage(next);
    setCurrentLang(next);
    localStorage.setItem('vibeetl_lang', next);
  };

  // ── Favorites ───────────────────────────────────────────────────────────────
  const [favoriteToolIds, setFavoriteToolIds] = useState(() => {
    try {
      const saved = localStorage.getItem('vibeetl_favorites');
      if (saved) return JSON.parse(saved);
    } catch (_) {}
    return ['fileInput', 'filter', 'select', 'groupBy'];
  });

  const toggleFavorite = (toolId, e) => {
    e.stopPropagation();
    setFavoriteToolIds(prev => {
      const next = prev.includes(toolId) ? prev.filter(id => id !== toolId) : [...prev, toolId];
      localStorage.setItem('vibeetl_favorites', JSON.stringify(next));
      return next;
    });
  };

  const resetFavorites = () => {
    const defaults = ['fileInput', 'filter', 'select', 'groupBy'];
    setFavoriteToolIds(defaults);
    localStorage.removeItem('vibeetl_favorites');
  };

  // ── Dropdown 외부 클릭 닫기 ─────────────────────────────────────────────────
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

  // ── 드래그 시작 ─────────────────────────────────────────────────────────────
  const onDragStart = (e, nodeType) => {
    e.dataTransfer.setData('application/reactflow', nodeType);
    e.dataTransfer.effectAllowed = 'move';
  };

  // ── 번역된 카테고리 타이틀 ──────────────────────────────────────────────────
  const getCategoryTitle = (catKey) => {
    const key = `categories.${catKey}`;
    const translated = t(key);
    // 번역 키가 없으면 catKey를 단어 형태로 변환
    if (translated === key) {
      return catKey.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
    return translated;
  };

  // ── 번역된 도구 이름/설명 ────────────────────────────────────────────────────
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

  // ── 카테고리별 그룹화 ────────────────────────────────────────────────────────
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

  return (
    <div className="tool-palette">
      {/* ── 로고 ─────────────────────────────────────────────────────────────── */}
      <div className="palette-logo">
        <div className="logo-icon">ETL</div>
        <div className="logo-text">x1zzETL</div>
      </div>

      {/* ── Add Tool 드롭다운 ──────────────────────────────────────────────────── */}
      <div
        className="tool-dropdown-container"
        style={{ margin: '0 16px', display: 'flex', alignItems: 'center', position: 'relative' }}
        ref={dropdownRef}
      >
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'white', color: 'var(--text-primary)', fontSize: '0.8rem', fontFamily: 'var(--font-primary)', fontWeight: 600, cursor: 'pointer', minWidth: '160px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
          title={t('toolbar.addToolTitle')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={14} />
            <span>{t('toolbar.addTool')}</span>
          </div>
        </button>

        {isDropdownOpen && (
          <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '4px', background: 'white', border: '1px solid var(--border-color)', borderRadius: '6px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', width: '220px', zIndex: 1000, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #e2e8f0' }}>
              <Search size={14} style={{ color: '#94a3b8', marginRight: '8px' }} />
              <input
                autoFocus
                type="text"
                placeholder={t('toolbar.searchTools')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ border: 'none', outline: 'none', width: '100%', fontSize: '12px' }}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#94a3b8' }}>
                  <X size={14} />
                </button>
              )}
            </div>
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
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
                      <div style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', backgroundColor: '#f8fafc' }}>
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
                          style={{ padding: '8px 12px', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #f1f5f9' }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          {React.createElement(Icons[tool.icon] || Icons.Square, { size: 14, style: { color: '#64748b' } })}
                          <span style={{ fontWeight: 600, color: '#334155' }}>{getToolName(tool)}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>

      {/* ── 카테고리 팔레트 ──────────────────────────────────────────────────────── */}
      <div className="tool-categories" style={{ overflowX: 'auto', overflowY: 'hidden', paddingTop: '10px', paddingBottom: '6px' }}>
        {Object.entries(categories).map(([catKey, tools]) => {
          if (tools.length === 0) return null;
          return (
            <div key={catKey} className="category-group">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px', marginBottom: '4px' }}>
                <span className={`category-title ${catKey}`} style={{ margin: 0 }}>
                  {getCategoryTitle(catKey)}
                </span>
                {catKey === 'favorites' && (
                  <button
                    onClick={resetFavorites}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center', padding: '2px' }}
                    title={t('toolbar.resetFavorites')}
                  >
                    <Icons.RotateCcw size={12} />
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
                      style={{ cursor: 'pointer', position: 'relative' }}
                    >
                      <IconComponent size={18} strokeWidth={1.5} style={{ flexShrink: 0 }} />
                      <span>{getToolName(tool)}</span>
                      <div
                        onClick={e => toggleFavorite(tool.id, e)}
                        style={{ position: 'absolute', top: '-6px', right: '-6px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', padding: '3px', background: '#fff', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', zIndex: 10, cursor: 'pointer' }}
                        title={favoriteToolIds.includes(tool.id) ? t('toolbar.resetFavorites') : t('toolbar.addTool')}
                        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                      >
                        <Star size={10} fill={favoriteToolIds.includes(tool.id) ? '#fbbf24' : 'none'} color={favoriteToolIds.includes(tool.id) ? '#fbbf24' : '#cbd5e1'} strokeWidth={favoriteToolIds.includes(tool.id) ? 1 : 2.5} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── 액션 버튼 영역 ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: 'auto' }}>

        {/* Undo / Redo */}
        <button className="run-button" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', opacity: canUndo ? 1 : 0.5, cursor: canUndo ? 'pointer' : 'not-allowed', padding: '6px 10px' }} onClick={() => canUndo && window.dispatchEvent(new CustomEvent('vibe-undo'))} title={t('toolbar.undo')}>
          <Icons.Undo size={16} />
        </button>
        <button className="run-button" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', opacity: canRedo ? 1 : 0.5, cursor: canRedo ? 'pointer' : 'not-allowed', padding: '6px 10px' }} onClick={() => canRedo && window.dispatchEvent(new CustomEvent('vibe-redo'))} title={t('toolbar.redo')}>
          <Icons.Redo size={16} />
        </button>

        <div style={{ width: '1px', height: '24px', background: 'var(--border-color)' }} />

        {/* Load / Save */}
        <input type="file" accept=".json" style={{ display: 'none' }} ref={fileInputRef} onChange={onLoadWorkflow} />
        <button className="run-button" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }} onClick={() => fileInputRef.current?.click()} title={t('toolbar.loadWorkflow')}>
          <FolderOpen size={16} />
        </button>
        <button className="run-button" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }} onClick={onSaveWorkflow} title={t('toolbar.saveWorkflow')}>
          <Save size={16} />
        </button>

        {/* Export .xzz */}
        <button
          className="run-button"
          style={{ background: '#f5f0ff', color: '#7c3aed', border: '1px solid #ddd6fe' }}
          onClick={onExportXzz}
          title={t('toolbar.exportXzzTitle')}
        >
          <FileCode size={16} />
          <span>{t('toolbar.exportXzz')}</span>
        </button>

        <div style={{ width: '1px', height: '24px', background: 'var(--border-color)' }} />

        {/* Auto-Run */}
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }} title={t('toolbar.autoRunTitle')}>
          <input type="checkbox" checked={autoRun} onChange={e => setAutoRun(e.target.checked)} style={{ accentColor: 'var(--color-accent)' }} />
          <span>{t('toolbar.autoRun')}</span>
        </label>

        {/* Run */}
        <button className="run-button" onClick={onRunPipeline} disabled={isRunning} title="Generate x1zzLang code and execute via /execute API">
          {isRunning ? (
            <>
              <RefreshCw className="animate-spin" size={16} />
              <span>{t('toolbar.running')}</span>
            </>
          ) : (
            <>
              <Play size={16} fill="white" />
              <span>{t('toolbar.run')}</span>
            </>
          )}
        </button>

        {/* Language Toggle */}
        <button
          className="run-button"
          style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', minWidth: 'unset', padding: '6px 10px', gap: '4px' }}
          onClick={toggleLanguage}
          title={currentLang === 'en' ? '한국어로 전환' : 'Switch to English'}
        >
          <Globe size={14} />
          <span style={{ fontSize: '0.7rem', fontWeight: 700 }}>{currentLang === 'en' ? 'KO' : 'EN'}</span>
        </button>

        {/* Fullscreen */}
        <button
          className="run-button"
          style={{ background: 'var(--panel-bg)', color: 'var(--text-color)', border: '1px solid var(--border-color)' }}
          onClick={toggleFullscreen}
          title={isFullscreen ? t('toolbar.exitFullscreen') : t('toolbar.enterFullscreen')}
        >
          {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
        </button>
      </div>
    </div>
  );
};

export default ToolPalette;
