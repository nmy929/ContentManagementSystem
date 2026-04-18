import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useParams } from 'react-router-dom';
import api from '../api';

export default function Editor({ role }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState('draft');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    const load = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/api/articles/${id}`);
        setTitle(res.data.title || '');
        setContent(res.data.content || '');
        setCategoryId(res.data.category_id ? String(res.data.category_id) : '');
        setStatus(res.data.status || 'draft');
      } catch (err) {
        setMessage('Failed to load article for edit.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, isEdit]);

  const create = async () => {
    setMessage('');
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    const categoryNum = Number(categoryId);

    if (!trimmedTitle) {
      setMessage('Title is required.');
      return;
    }

    if (!Number.isInteger(categoryNum) || categoryNum <= 0) {
      setMessage('Category ID must be a positive integer.');
      return;
    }

    try {
      const res = await api.post('/api/articles', {
        title: trimmedTitle,
        content: trimmedContent,
        category_id: categoryNum,
        tags: [],
        status
      });
      setMessage(`Created article ${res.data.article_id}`);
      navigate(`/articles/${res.data.article_id}`);
    } catch (err) {
      setMessage(err.response?.data?.detail || 'Create failed.');
    }
  };

  const update = async () => {
    setMessage('');
    try {
      await api.put(`/api/articles/${id}`, {
        title,
        content
      });
      setMessage('Updated article.');
      navigate(`/articles/${id}`);
    } catch (err) {
      setMessage('Update failed.');
    }
  };

  if (!role) {
    return <div className="card">Please login first.</div>;
  }

  if (isEdit) {
    return (
      <div className="card">
        <h2>Edit Article</h2>
        <p>Article ID: {id}</p>
        <label>Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
        <label>Content</label>
        <textarea rows="8" value={content} onChange={(e) => setContent(e.target.value)} />
        <button onClick={update} disabled={loading}>
          Save Revision
        </button>
        <button className="secondary" onClick={() => navigate(`/articles/${id}`)} disabled={loading}>
          Back to Article
        </button>
        {message && <p>{message}</p>}
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Create Article</h2>
      <label>Title</label>
      <input value={title} onChange={(e) => setTitle(e.target.value)} />
      <label>Category ID</label>
      <input value={categoryId} onChange={(e) => setCategoryId(e.target.value)} />
      <label>Status</label>
      <select value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="draft">draft</option>
        <option value="published">published</option>
      </select>
      <label>Content</label>
      <textarea rows="8" value={content} onChange={(e) => setContent(e.target.value)} />
      <button onClick={create}>Create</button>
      {message && <p>{message}</p>}
    </div>
  );
}
