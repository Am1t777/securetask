from extensions import db

project_members = db.Table(
    'project_members',
    db.Column('project_id', db.Integer, db.ForeignKey('projects.id'), primary_key=True),
    db.Column('user_id', db.Integer, db.ForeignKey('users.id'), primary_key=True),
)


class Project(db.Model):
    __tablename__ = 'projects'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(256), nullable=False)
    owner_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    members = db.relationship('User', secondary=project_members, backref='projects')

    def is_member(self, user_id: int) -> bool:
        return any(m.id == user_id for m in self.members)

    def to_dict(self) -> dict:
        return {'id': self.id, 'name': self.name, 'owner_id': self.owner_id}
