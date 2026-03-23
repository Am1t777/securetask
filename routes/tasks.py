from datetime import date
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from extensions import db, socketio
from models.task import Task, TaskStatus, TaskPriority
from models.project import Project
from models.audit_log import AuditLog

tasks_bp = Blueprint('tasks', __name__)

# Field whitelist for PATCH — prevents arbitrary kwargs from request body
_PATCH_FIELDS = {'title', 'description', 'status', 'priority', 'due_date', 'assignee_id'}


def _get_project_or_403(project_id: int, user_id: int):
    project = db.session.get(Project, project_id)
    if project is None:
        return None, (jsonify({'error': 'Project not found'}), 404)
    if not project.is_member(user_id):
        return None, (jsonify({'error': 'Forbidden'}), 403)
    return project, None


@tasks_bp.route('', methods=['GET'])
@jwt_required()
def list_tasks():
    user_id = int(get_jwt_identity())
    project_id = request.args.get('project_id', type=int)
    if not project_id:
        return jsonify({'error': 'project_id required'}), 400

    _, err = _get_project_or_403(project_id, user_id)
    if err:
        return err

    tasks = Task.query.filter_by(project_id=project_id).all()
    return jsonify([t.to_dict() for t in tasks])


@tasks_bp.route('', methods=['POST'])
@jwt_required()
def create_task():
    user_id = int(get_jwt_identity())
    data = request.get_json() or {}

    project_id = data.get('project_id')
    if not project_id:
        return jsonify({'error': 'project_id required'}), 400

    _, err = _get_project_or_403(project_id, user_id)
    if err:
        return err

    title = data.get('title', '').strip()
    if not title:
        return jsonify({'error': 'title required'}), 400

    task = Task(
        title=title,
        description=data.get('description', ''),
        project_id=project_id,
        assignee_id=data.get('assignee_id'),
    )
    if data.get('status'):
        task.status = TaskStatus(data['status'])
    if data.get('priority'):
        task.priority = TaskPriority(data['priority'])
    if data.get('due_date'):
        task.due_date = date.fromisoformat(data['due_date'])

    db.session.add(task)
    db.session.flush()

    AuditLog.create(user_id, 'create_task', 'task', task.id, {'title': task.title})
    db.session.commit()

    task_dict = task.to_dict()
    socketio.emit('task_created', task_dict, room=f'project_{project_id}')
    return jsonify(task_dict), 201


@tasks_bp.route('/<int:task_id>', methods=['PATCH'])
@jwt_required()
def update_task(task_id: int):
    user_id = int(get_jwt_identity())
    task = db.session.get(Task, task_id)
    if task is None:
        return jsonify({'error': 'Task not found'}), 404

    _, err = _get_project_or_403(task.project_id, user_id)
    if err:
        return err

    allowed = {k: v for k, v in (request.get_json() or {}).items() if k in _PATCH_FIELDS}

    if 'title' in allowed:
        task.title = allowed['title']
    if 'description' in allowed:
        task.description = allowed['description']
    if 'status' in allowed:
        task.status = TaskStatus(allowed['status'])
    if 'priority' in allowed:
        task.priority = TaskPriority(allowed['priority'])
    if 'due_date' in allowed:
        task.due_date = date.fromisoformat(allowed['due_date']) if allowed['due_date'] else None
    if 'assignee_id' in allowed:
        task.assignee_id = allowed['assignee_id']

    AuditLog.create(user_id, 'update_task', 'task', task_id, allowed)
    db.session.commit()

    task_dict = task.to_dict()
    socketio.emit('task_updated', task_dict, room=f'project_{task.project_id}')
    return jsonify(task_dict)


@tasks_bp.route('/<int:task_id>', methods=['DELETE'])
@jwt_required()
def delete_task(task_id: int):
    user_id = int(get_jwt_identity())
    task = db.session.get(Task, task_id)
    if task is None:
        return jsonify({'error': 'Task not found'}), 404

    project_id = task.project_id
    _, err = _get_project_or_403(project_id, user_id)
    if err:
        return err

    AuditLog.create(user_id, 'delete_task', 'task', task_id, {'title': task.title})
    db.session.delete(task)
    db.session.commit()

    socketio.emit('task_deleted', {'id': task_id}, room=f'project_{project_id}')
    return jsonify({'deleted': task_id})
