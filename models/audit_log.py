from datetime import datetime
from sqlalchemy import event
from extensions import db
from utils.crypto import encrypt_data


class AuditLog(db.Model):
    __tablename__ = 'audit_logs'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    action = db.Column(db.String(64), nullable=False)
    resource_type = db.Column(db.String(64), nullable=True)
    resource_id = db.Column(db.Integer, nullable=True)
    encrypted_data = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    @classmethod
    def create(
        cls,
        user_id: int,
        action: str,
        resource_type: str = None,
        resource_id: int = None,
        data: dict = None,
    ) -> 'AuditLog':
        entry = cls(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            encrypted_data=encrypt_data(data) if data else None,
        )
        db.session.add(entry)
        return entry


@event.listens_for(AuditLog, 'before_update')
def _prevent_audit_update(mapper, connection, target):
    raise RuntimeError('AuditLog entries are immutable — updates are not allowed')


@event.listens_for(AuditLog, 'before_delete')
def _prevent_audit_delete(mapper, connection, target):
    raise RuntimeError('AuditLog entries are immutable — deletes are not allowed')
