from flask import session
from flask_socketio import join_room, emit, disconnect
from flask_jwt_extended import decode_token
from extensions import db, socketio
from models.user import User
from models.project import Project


def register_socket_events(sio) -> None:

    @sio.on('connect')
    def handle_connect(auth):
        token = (auth or {}).get('token')
        if not token:
            return False
        try:
            decoded = decode_token(token)
            user_id = int(decoded['sub'])
        except Exception:
            return False

        user = db.session.get(User, user_id)
        if not user:
            return False

        session['user_id'] = user_id
        session['user_name'] = user.name

    @sio.on('join_project')
    def handle_join_project(data):
        if 'user_id' not in session:
            disconnect()
            return

        project_id = data.get('project_id')
        if not project_id:
            return

        project = db.session.get(Project, project_id)
        if project and project.is_member(session['user_id']):
            join_room(f'project_{project_id}')
            emit('user_online', {'user_name': session['user_name']},
                 room=f'project_{project_id}', include_self=False)

    @sio.on('user_typing')
    def handle_user_typing(data):
        if 'user_id' not in session:
            return

        project_id = data.get('project_id')
        col = data.get('col')
        if project_id:
            emit(
                'user_typing',
                {'user_name': session.get('user_name', 'Someone'), 'col': col},
                room=f'project_{project_id}',
                include_self=False,
            )

    @sio.on('disconnect')
    def handle_disconnect():
        pass
