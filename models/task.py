import enum
from extensions import db


class TaskStatus(enum.Enum):
    backlog = 'backlog'
    todo = 'todo'
    progress = 'progress'
    done = 'done'


class TaskPriority(enum.Enum):
    low = 'low'
    medium = 'medium'
    high = 'high'


class Task(db.Model):
    __tablename__ = 'tasks'

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(256), nullable=False)
    description = db.Column(db.Text, default='')
    status = db.Column(db.Enum(TaskStatus), default=TaskStatus.backlog, nullable=False)
    priority = db.Column(db.Enum(TaskPriority), default=TaskPriority.medium, nullable=False)
    due_date = db.Column(db.Date, nullable=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=False)
    assignee_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

    assignee = db.relationship('User', backref='tasks')

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'title': self.title,
            'description': self.description,
            'status': self.status.value,
            'priority': self.priority.value,
            'due_date': self.due_date.isoformat() if self.due_date else None,
            'project_id': self.project_id,
            'assignee_id': self.assignee_id,
            'assignee': self.assignee.to_dict() if self.assignee else None,
        }
