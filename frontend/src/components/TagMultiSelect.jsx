import React, { useEffect, useMemo, useRef, useState } from 'react';

export default function TagMultiSelect({
  tags,
  selectedIds,
  setSelectedIds,
  placeholder = 'Search tags...'
}) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const filteredTags = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return tags;
    return tags.filter((tag) => tag.name.toLowerCase().includes(q));
  }, [tags, keyword]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const toggleId = (idStr) => {
    if (selectedIds.includes(idStr)) {
      setSelectedIds(selectedIds.filter((v) => v !== idStr));
    } else {
      setSelectedIds([...selectedIds, idStr]);
    }
  };

  const removeId = (event, idStr) => {
    event.stopPropagation();
    setSelectedIds(selectedIds.filter((v) => v !== idStr));
  };

  return (
    <div className="tag-picker" ref={rootRef}>
      <div
        className={`tag-picker-control ${open ? 'is-open' : ''}`}
        onClick={() => {
          setOpen(true);
          if (inputRef.current) inputRef.current.focus();
        }}
      >
        <div className="tag-picker-chips">
          {selectedIds.map((idStr) => {
            const tag = tags.find((t) => String(t.tag_id) === idStr);
            const name = tag ? tag.name : idStr;
            return (
              <span className="tag-chip" key={idStr}>
                {name}
                <button
                  type="button"
                  className="tag-chip-remove"
                  onClick={(event) => removeId(event, idStr)}
                  aria-label={`Remove ${name}`}
                >
                  ×
                </button>
              </span>
            );
          })}
          <input
            ref={inputRef}
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            className="tag-picker-input"
            placeholder={selectedIds.length === 0 ? placeholder : ''}
          />
        </div>
        <span className="tag-picker-icon">⌕</span>
      </div>

      {open && (
        <div className="tag-picker-dropdown">
          <div className="tag-picker-options">
            {filteredTags.map((tag) => {
              const idStr = String(tag.tag_id);
              const checked = selectedIds.includes(idStr);
              return (
                <label className={`tag-option ${checked ? 'selected' : ''}`} key={idStr}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleId(idStr)}
                  />
                  <span className="tag-option-label">{tag.name}</span>
                  <span className="tag-option-check">{checked ? '✓' : ''}</span>
                </label>
              );
            })}
            {filteredTags.length === 0 && <div className="tag-option-empty">No tags found.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
