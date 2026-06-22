"""call_priority and dispatch_status_changed_at on DailyCrewUnit; dispatch_thresholds on UserNotificationPrefs

Revision ID: b503a3d060ac
Revises: 7d034a8737c1
Create Date: 2026-06-22 17:13:47.187525

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b503a3d060ac'
down_revision = '7d034a8737c1'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('daily_crew_unit', schema=None) as batch_op:
        batch_op.add_column(sa.Column('dispatch_status_changed_at', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('call_priority', sa.Text(), nullable=True))

    with op.batch_alter_table('user_notification_prefs', schema=None) as batch_op:
        batch_op.add_column(sa.Column('dispatch_thresholds_json', sa.Text(), nullable=True))


def downgrade():
    with op.batch_alter_table('user_notification_prefs', schema=None) as batch_op:
        batch_op.drop_column('dispatch_thresholds_json')

    with op.batch_alter_table('daily_crew_unit', schema=None) as batch_op:
        batch_op.drop_column('call_priority')
        batch_op.drop_column('dispatch_status_changed_at')
