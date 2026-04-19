import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import TagMultiSelect from '../components/TagMultiSelect';

export default function Feed({ role }) {
  const [rows, setRows] = useState([]);
  const [category, setCategory] = useState('');
  const [error, setError] = useState(null);
  const [tags, setTags] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);
  const [mode, setMode] = useState('any');
  const [sort, setSort] = useState('published_at');
  const [limit, setLimit] = useState('20');
  const [offset, setOffset] = useState('0');
  const [resultCount, setResultCount] = useState(0);
  const [message, setMessage] = useState('');

  const load = async () => {
    setError(null);
    try {
      const params = {};
      if (category) params.category = Number(category);
      const res = await api.get('/api/articles', { params });
      setRows(res.data.rows || []);
      setResultCount((res.data.rows || []).length);
    } catch (err) {
      setError('Failed to load feed.');
    }
  };

  const loadTags = async () => {
    try {
      const res = await api.get('/api/tags');
      setTags(res.data.rows || []);
    } catch (err) {
      setTags([]);
    }
  };

  const searchByTags = async () => {
    setError(null);
    setMessage('');
    try {
      const ids = selectedTags.map((v) => Number(v)).filter((v) => !Number.isNaN(v));
      if (ids.length === 0) {
        setMessage('Please select at least one tag.');
        return;
      }
      const res = await api.get('/api/articles/by_tags', {
        params: {
          tag_ids: ids.join(','),
          mode,
          sort,
          limit: Number(limit),
          offset: Number(offset)
        }
      });
      setRows(res.data.rows || []);
      setResultCount((res.data.rows || []).length);
    } catch (err) {
      setError('Failed to run tag filter.');
    }
  };

  useEffect(() => {
    if (!role) return;
    load();
    loadTags();
  }, [role]);

  return (
    <div>
      <div className="card">
        <h2>Feed</h2>
        <label>Category ID (optional)</label>
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. 1" />
        <button onClick={load}>Refresh Feed (Collect EXPLAIN)</button>
        {error && <p>{error}</p>}
      </div>

      <div className="card">
        <h2>Advanced Tag Filter</h2>
        <label>Tags (multi-select)</label>
        <TagMultiSelect tags={tags} selectedIds={selectedTags} setSelectedIds={setSelectedTags} />
        <label>Mode</label>
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="any">ANY (overlap)</option>
          <option value="all">ALL (contains)</option>
        </select>
        <label>Sort</label>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="published_at">Newest</option>
          <option value="views_count">Most Viewed</option>
        </select>
        <label>Limit</label>
        <input value={limit} onChange={(e) => setLimit(e.target.value)} />
        <label>Offset</label>
        <input value={offset} onChange={(e) => setOffset(e.target.value)} />
        <button onClick={searchByTags}>Search by Tags</button>
        {message && <p>{message}</p>}
      </div>

      <div className="grid">
        {rows.map((row) => (
          <div className="card" key={row.article_id}>
            <h3>{row.title}</h3>
            <p>Author: {row.author_id}</p>
            <p>Published: {row.published_at || 'N/A'}</p>
            {row.tag_names && row.tag_names.length > 0 && (
              <p>Tags: {row.tag_names.join(', ')}</p>
            )}
            <Link to={`/articles/${row.article_id}`}>Open</Link>
          </div>
        ))}
      </div>

      <div className="card">
        <strong>Results:</strong> {resultCount}
      </div>
    </div>
  );
}
