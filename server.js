const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// ========== ПОДКЛЮЧЕНИЕ К POSTGRESQL ==========
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Render требует SSL
  }
});

// Проверка подключения при старте
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Ошибка подключения к базе:', err.stack);
  } else {
    console.log('✅ Подключено к PostgreSQL');
    release();
  }
});

// ========== ИНИЦИАЛИЗАЦИЯ ТАБЛИЦ ==========
async function initTables() {
  try {
    // Таблица пользователей
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица чатов
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chats (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        type VARCHAR(20) NOT NULL CHECK (type IN ('channel', 'group', 'private')),
        created_by VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица сообщений
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        chat_id VARCHAR(100) REFERENCES chats(id) ON DELETE CASCADE,
        sender VARCHAR(50) NOT NULL,
        text TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Таблицы созданы/проверены');
  } catch (err) {
    console.error('❌ Ошибка создания таблиц:', err);
  }
}
initTables();

// ========== API ЭНДПОИНТЫ ==========

// ---------- Регистрация ----------
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  
  try {
    // Проверяем, есть ли уже
    const existing = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Пользователь уже существует' });
    }
    
    // Создаём нового
    const result = await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username',
      [username, password]
    );
    
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ---------- Вход ----------
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  try {
    const result = await pool.query(
      'SELECT id, username FROM users WHERE username = $1 AND password = $2',
      [username, password]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Неверные данные' });
    }
    
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ---------- Получить всех пользователей (кроме текущего) ----------
app.get('/api/users', async (req, res) => {
  const { exclude } = req.query;
  
  try {
    let query = 'SELECT username FROM users';
    let params = [];
    
    if (exclude) {
      query += ' WHERE username != $1';
      params = [exclude];
    }
    
    const result = await pool.query(query, params);
    res.json({ users: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ---------- Создать чат ----------
app.post('/api/chats', async (req, res) => {
  const { id, name, type, createdBy } = req.body;
  
  try {
    await pool.query(
      'INSERT INTO chats (id, name, type, created_by) VALUES ($1, $2, $3, $4)',
      [id, name, type, createdBy]
    );
    
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ---------- Получить все чаты ----------
app.get('/api/chats', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM chats ORDER BY created_at DESC'
    );
    res.json({ chats: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ---------- Отправить сообщение ----------
app.post('/api/messages', async (req, res) => {
  const { chatId, sender, text } = req.body;
  
  try {
    await pool.query(
      'INSERT INTO messages (chat_id, sender, text) VALUES ($1, $2, $3)',
      [chatId, sender, text]
    );
    
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ---------- Получить сообщения чата ----------
app.get('/api/messages/:chatId', async (req, res) => {
  const { chatId } = req.params;
  
  try {
    const result = await pool.query(
      'SELECT * FROM messages WHERE chat_id = $1 ORDER BY created_at ASC',
      [chatId]
    );
    res.json({ messages: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ---------- Последнее сообщение в чате (для списка) ----------
app.get('/api/lastmessage/:chatId', async (req, res) => {
  const { chatId } = req.params;
  
  try {
    const result = await pool.query(
      'SELECT * FROM messages WHERE chat_id = $1 ORDER BY created_at DESC LIMIT 1',
      [chatId]
    );
    res.json({ message: result.rows[0] || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});