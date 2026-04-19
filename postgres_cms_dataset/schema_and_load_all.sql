
-- schema_and_load_all.sql (generated)
DROP TABLE IF EXISTS admin_actions;
DROP TABLE IF EXISTS article_views;
DROP TABLE IF EXISTS comments;
DROP TABLE IF EXISTS article_tags;
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS revisions;
DROP TABLE IF EXISTS articles;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  user_id BIGINT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE
);

CREATE TABLE categories (
  category_id INT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE tags (
  tag_id INT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE articles (
  article_id BIGSERIAL PRIMARY KEY,
  author_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  category_id INT REFERENCES categories(category_id),
  status TEXT NOT NULL,
  title TEXT NOT NULL,
  slug TEXT,
  published_at TIMESTAMP,
  views_count BIGINT DEFAULT 0,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  current_rev BIGINT
);

CREATE TABLE revisions (
  revision_id BIGSERIAL PRIMARY KEY,
  article_id BIGINT NOT NULL REFERENCES articles(article_id) ON DELETE CASCADE,
  editor_id BIGINT REFERENCES users(user_id),
  title TEXT NOT NULL,
  content TEXT,
  created_at TIMESTAMP
);

CREATE TABLE article_tags (
  article_id BIGINT NOT NULL REFERENCES articles(article_id) ON DELETE CASCADE,
  tag_id INT NOT NULL REFERENCES tags(tag_id) ON DELETE CASCADE,
  PRIMARY KEY (article_id, tag_id)
);

CREATE TABLE comments (
  comment_id BIGSERIAL PRIMARY KEY,
  article_id BIGINT NOT NULL REFERENCES articles(article_id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(user_id),
  content TEXT NOT NULL,
  created_at TIMESTAMP,
  is_flagged BOOLEAN DEFAULT false
);

CREATE TABLE article_views (
  view_id BIGSERIAL PRIMARY KEY,
  article_id BIGINT NOT NULL REFERENCES articles(article_id) ON DELETE CASCADE,
  viewer_id BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  viewed_at TIMESTAMP
);

CREATE TABLE admin_actions (
  action_id BIGSERIAL PRIMARY KEY,
  admin_id BIGINT REFERENCES users(user_id),
  action TEXT NOT NULL,
  target_sql TEXT,
  created_at TIMESTAMP
);

-- Indexes
CREATE INDEX idx_articles_category_published ON articles (category_id, published_at DESC);
CREATE INDEX idx_articles_published_at ON articles (published_at DESC);
CREATE INDEX idx_revisions_article_created ON revisions (article_id, created_at DESC);
CREATE INDEX idx_article_views_article_viewed_at ON article_views (article_id, viewed_at DESC);
CREATE INDEX idx_articles_author ON articles (author_id);

-- Loading CSV files (run in psql client where CSVs are accessible)
\copy users(user_id, username, email, role, created_at) FROM 'users.csv' WITH (FORMAT csv, HEADER true);
UPDATE users SET password = username WHERE password = '';
\copy categories(category_id, name) FROM 'categories.csv' WITH (FORMAT csv, HEADER true);
\copy tags(tag_id, name) FROM 'tags.csv' WITH (FORMAT csv, HEADER true);
\copy articles(article_id, author_id, category_id, status, title, slug, published_at, views_count, created_at, updated_at, current_rev) FROM 'articles.csv' WITH (FORMAT csv, HEADER true);
\copy revisions(revision_id, article_id, editor_id, title, content, created_at) FROM 'revisions.csv' WITH (FORMAT csv, HEADER true);
\copy article_tags(article_id, tag_id) FROM 'article_tags.csv' WITH (FORMAT csv, HEADER true);
\copy comments(comment_id, article_id, user_id, content, created_at, is_flagged) FROM 'comments.csv' WITH (FORMAT csv, HEADER true);
\copy article_views(view_id, article_id, viewer_id, viewed_at) FROM 'article_views.csv' WITH (FORMAT csv, HEADER true);
\copy admin_actions(action_id, admin_id, action, target_sql, created_at) FROM 'admin_actions.csv' WITH (FORMAT csv, HEADER true);

SELECT setval('articles_article_id_seq', COALESCE((SELECT MAX(article_id) FROM articles), 1));
SELECT setval('revisions_revision_id_seq', COALESCE((SELECT MAX(revision_id) FROM revisions), 1));
SELECT setval('comments_comment_id_seq', COALESCE((SELECT MAX(comment_id) FROM comments), 1));
SELECT setval('article_views_view_id_seq', COALESCE((SELECT MAX(view_id) FROM article_views), 1));
SELECT setval('admin_actions_action_id_seq', COALESCE((SELECT MAX(action_id) FROM admin_actions), 1));

DROP MATERIALIZED VIEW IF EXISTS articles_tag_index;
CREATE MATERIALIZED VIEW articles_tag_index AS
SELECT at.article_id, ARRAY_AGG(at.tag_id ORDER BY at.tag_id) AS tag_ids
FROM article_tags at
GROUP BY at.article_id;

CREATE INDEX IF NOT EXISTS idx_articles_tagids_gin ON articles_tag_index USING GIN(tag_ids);

ANALYZE;
