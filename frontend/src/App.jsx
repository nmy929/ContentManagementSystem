import React, { useEffect, useState } from 'react';
import { Routes, Route, Link, useNavigate } from 'react-router-dom';
import { setToken } from './api';
import Login from './pages/Login.jsx';
import Feed from './pages/Feed.jsx';
import Article from './pages/Article.jsx';
import Editor from './pages/Editor.jsx';
import Admin from './pages/Admin.jsx';

export default function App() {
  const [token, setAuthToken] = useState(localStorage.getItem('token'));
  const [role, setRole] = useState(localStorage.getItem('role'));
  const [userId, setUserId] = useState(localStorage.getItem('user_id'));
  const navigate = useNavigate();

  useEffect(() => {
    setToken(token);
  }, [token]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('user_id');
    setToken(null);
    setAuthToken(null);
    setRole(null);
    setUserId(null);
    navigate('/login');
  };

  const handleLogin = (newToken, newRole, newUserId) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('role', newRole);
    localStorage.setItem('user_id', String(newUserId));
    setToken(newToken);
    setAuthToken(newToken);
    setRole(newRole);
    setUserId(String(newUserId));
    navigate('/');
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">Postgres CMS</div>
        <nav>
          <Link to="/">Feed</Link>
          <Link to="/editor">Editor</Link>
          {role === 'admin' && <Link to="/admin">Admin</Link>}
        </nav>
        <div className="auth">
          {token ? (
            <button onClick={handleLogout}>Logout ({role})</button>
          ) : (
            <Link to="/login">Login</Link>
          )}
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/login" element={<Login onLogin={handleLogin} />} />
          <Route path="/" element={<Feed role={role} />} />
          <Route path="/articles/:id" element={<Article role={role} userId={userId} />} />
          <Route path="/editor" element={<Editor role={role} userId={userId} />} />
          <Route path="/editor/:id" element={<Editor role={role} userId={userId} />} />
          <Route path="/admin" element={<Admin role={role} />} />
        </Routes>
      </main>
      <footer className="footer">Artifacts are stored in /data/artifacts</footer>
    </div>
  );
}
