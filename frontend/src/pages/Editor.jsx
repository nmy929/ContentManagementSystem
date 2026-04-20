import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useParams } from 'react-router-dom';
import api from '../api';

export default function Editor({ role, userId }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState('draft');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [article, setArticle] = useState(null);
  const [canEdit, setCanEdit] = useState(true);

  useEffect(() => {
    if (!isEdit) return;
    const load = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/api/articles/${id}`);
        const nextArticle = res.data;
        const editable = role === 'editor'
          || role === 'admin'
          || (role === 'author' && String(nextArticle.author_id) === String(userId));
        setArticle(nextArticle);
        setCanEdit(editable);
        if (!editable) {
          setMessage('Authors can only edit their own articles.');
          return;
        }
        setTitle(nextArticle.title || '');
        setContent(nextArticle.content || '');
        setCategoryId(nextArticle.category_id ? String(nextArticle.category_id) : '');
        setStatus(nextArticle.status || 'draft');
      } catch (err) {
        setCanEdit(false);
        setMessage(err.response?.data?.detail || 'Failed to load article for edit.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, isEdit, role, userId]);

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
    if (!canEdit) {
      setMessage('Authors can only edit their own articles.');
      return;
    }
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

  if (isEdit && !loading && !canEdit) {
    return (
      <div className="card">
        <h2>Edit Article</h2>
        <p>{message || 'You do not have permission to edit this article.'}</p>
        {article && (
          <button className="secondary" onClick={() => navigate(`/articles/${article.article_id}`)}>
            Back to Article
          </button>
        )}
      </div>
    );
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
        <div className="button-row">
          <button onClick={update} disabled={loading}>
            Save Revision
          </button>
          <button className="secondary" onClick={() => navigate(`/articles/${id}`)} disabled={loading}>
            Back to Article
          </button>
        </div>
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
