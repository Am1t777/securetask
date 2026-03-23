from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from extensions import db
from models.user import User
from models.project import Project
from models.audit_log import AuditLog

projects_bp = Blueprint('projects', __name__)


@projects_bp.route('', methods=['GET'])
@jwt_required()
def list_projects():
    user_id = int(get_jwt_identity())
    projects = Project.query.filter(Project.members.any(id=user_id)).all()
    return jsonify([p.to_dict() for p in projects])


@projects_bp.route('', methods=['POST'])
@jwt_required()
def create_project():
    user_id = int(get_jwt_identity())
    data = request.get_json() or {}
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'error': 'Name required'}), 400

    user = db.session.get(User, user_id)
    project = Project(name=name, owner_id=user_id)
    project.members.append(user)
    db.session.add(project)
    db.session.flush()

    AuditLog.create(user_id, 'create_project', 'project', project.id, {'name': name})
    db.session.commit()

    return jsonify(project.to_dict()), 201
