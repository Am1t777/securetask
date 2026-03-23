from flask import Flask, send_from_directory
from config import Config
from extensions import db, jwt, socketio


def create_app(config_class=Config) -> Flask:
    app = Flask(
        __name__,
        static_folder='frontend/static',
        static_url_path='/static',
    )
    app.config.from_object(config_class)

    # Initialize extensions
    db.init_app(app)
    jwt.init_app(app)
    socketio.init_app(app, async_mode='eventlet', cors_allowed_origins='*')

    # Register blueprints
    from routes.auth import auth_bp
    from routes.projects import projects_bp
    from routes.tasks import tasks_bp

    app.register_blueprint(auth_bp, url_prefix='/auth')
    app.register_blueprint(projects_bp, url_prefix='/api/projects')
    app.register_blueprint(tasks_bp, url_prefix='/api/tasks')

    # Register WebSocket events
    from sockets.events import register_socket_events
    register_socket_events(socketio)

    # Serve frontend pages
    @app.route('/')
    def index():
        return send_from_directory('frontend', 'index.html')

    @app.route('/login')
    def login_page():
        return send_from_directory('frontend', 'login.html')

    return app


if __name__ == '__main__':
    app = create_app()
    with app.app_context():
        # Import all models so SQLAlchemy knows about them before create_all
        import models.user      # noqa: F401
        import models.project   # noqa: F401
        import models.task      # noqa: F401
        import models.audit_log # noqa: F401
        db.create_all()
    socketio.run(app, debug=True, use_reloader=False, host='0.0.0.0', port=5001)
