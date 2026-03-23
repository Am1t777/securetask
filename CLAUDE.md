# SecureTask — CLAUDE.md

## Project Purpose
Full-stack task manager with JWT auth, AES-256 audit encryption, and real-time WebSocket updates.
Portfolio project showcasing security-first full-stack development.

## Tech Stack
- Backend: Python 3.x, Flask, Flask-SocketIO (eventlet), Flask-JWT-Extended, SQLAlchemy
- Database: SQLite (dev) / PostgreSQL (prod)
- Encryption: bcrypt (passwords), Fernet/AES-256 (audit data), JWT HS256 (auth tokens)
- Frontend: HTML5, Vanilla JS, Chart.js, socket.io-client

## Commands
- Install deps: `pip install flask flask-socketio flask-jwt-extended flask-sqlalchemy bcrypt cryptography python-dotenv eventlet`
- Run dev server: `python app.py`
- Init DB: `python -c "from app import create_app, db; app=create_app(); app.app_context().__enter__(); db.create_all()"`
- Run tests: `pytest tests/ -v`

## Architecture Rules
1. ALL passwords hashed via bcrypt (rounds=12) — never store plaintext anywhere
2. JWT must be validated on every HTTP route AND every WebSocket connect event
3. AuditLog is append-only — enforced via SQLAlchemy event listeners (before_update/before_delete raise RuntimeError)
4. Fernet key loaded from env var FERNET_KEY — never hardcoded
5. SECRET_KEY and JWT_SECRET_KEY must be different values, both from .env
6. All PATCH routes use field whitelisting — never accept arbitrary kwargs from request body
7. WebSocket broadcasts are room-scoped to `project_{project_id}` — never broadcast globally

## File Map
- `app.py`              → Application factory: `create_app()`, extension init, blueprint registration
- `config.py`           → All settings, reads from .env via python-dotenv
- `models/user.py`      → User with `set_password`/`check_password` bcrypt helpers, `to_dict()` omits password_hash
- `models/project.py`   → Project + `project_members` M2M table, `is_member(user_id)` helper
- `models/task.py`      → Task with `TaskStatus`/`TaskPriority` enums, `to_dict()` serializes enums as `.value`
- `models/audit_log.py` → AuditLog with `AuditLog.create()` class method that handles encryption internally
- `routes/auth.py`      → `/auth/register`, `/auth/login` — generic error messages to prevent user enumeration
- `routes/tasks.py`     → `/api/tasks` CRUD — each mutation emits SocketIO event + writes AuditLog
- `routes/projects.py`  → `/api/projects` GET/POST
- `sockets/events.py`   → `connect` (JWT validation, return False = reject), `join_project`, `user_typing`, `disconnect`
- `utils/crypto.py`     → `encrypt_data(dict)->str`, `decrypt_data(str)->dict` using Fernet
- `frontend/login.html` → JWT stored in sessionStorage (not localStorage), JSON POST to `/auth/login`
- `frontend/index.html` → Kanban board (4 cols), project selector, Chart.js panel, task modal
- `frontend/static/app.js` → API client wrapper, SocketIO client with auth token, board render/update functions

## Security Checklist (before any commit)
- [ ] No secrets in source code
- [ ] All new HTTP routes decorated with `@jwt_required()`
- [ ] All state-changing operations write an AuditLog entry via `AuditLog.create()`
- [ ] WebSocket handlers validate JWT before joining rooms
- [ ] PATCH routes use field whitelists
