import { type FormEvent, useState } from 'react';
import { membersApi } from '../../api';
import { errorMessage } from '../../api/client';
import type { Member, Role } from '../../api/types';
import { ROLE_LABELS } from '../../utils/format';
import { Avatar, Button, ErrorMessage, Input, Modal } from '../ui';

type MemberRole = Exclude<Role, 'owner'>;

interface Props {
  boardId: number;
  members: Member[];
  currentUserId: number;
  isOwner: boolean;
  onMembersChange: (members: Member[]) => void;
  /** Участник удалён с доски (его задачи остались без исполнителя) */
  onMemberRemoved: (userId: number) => void;
  onLeave: () => void;
  onClose: () => void;
}

const SELECT_CLASS =
  'rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20';

export function MembersModal({ boardId, members, currentUserId, isOwner, onMembersChange, onMemberRemoved, onLeave, onClose }: Props) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>('editor');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function handleInvite(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      const member = await membersApi.add(boardId, email.trim(), role);
      onMembersChange([...members, member]);
      setEmail('');
    });
  }

  function handleRoleChange(member: Member, nextRole: MemberRole) {
    void run(async () => {
      const updated = await membersApi.changeRole(boardId, member.userId, nextRole);
      onMembersChange(members.map((m) => (m.userId === updated.userId ? updated : m)));
    });
  }

  function handleRemove(member: Member) {
    const isSelf = member.userId === currentUserId;
    const question = isSelf ? 'Покинуть доску? Вернуться можно будет только по приглашению владельца.' : `Удалить ${member.name} из доски?`;
    if (!confirm(question)) return;
    void run(async () => {
      await membersApi.remove(boardId, member.userId);
      if (isSelf) {
        onLeave();
        return;
      }
      onMembersChange(members.filter((m) => m.userId !== member.userId));
      onMemberRemoved(member.userId);
    });
  }

  return (
    <Modal title="Участники доски" onClose={onClose}>
      {isOwner && (
        <form onSubmit={handleInvite} className="mb-5 flex flex-wrap gap-2">
          <Input
            type="email"
            required
            placeholder="Email зарегистрированного пользователя"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-w-48 flex-1"
          />
          <select value={role} onChange={(e) => setRole(e.target.value as MemberRole)} className={SELECT_CLASS}>
            <option value="editor">{ROLE_LABELS.editor}</option>
            <option value="viewer">{ROLE_LABELS.viewer}</option>
          </select>
          <Button type="submit" disabled={busy || !email.trim()}>
            Пригласить
          </Button>
        </form>
      )}

      <ErrorMessage>{error}</ErrorMessage>

      <ul className="mt-2 divide-y divide-slate-100">
        {members.map((member) => {
          const isSelf = member.userId === currentUserId;
          const canManage = isOwner && member.role !== 'owner';
          return (
            <li key={member.userId} className="flex items-center gap-3 py-2.5">
              <Avatar name={member.name} id={member.userId} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {member.name}
                  {isSelf && <span className="font-normal text-slate-500"> (вы)</span>}
                </p>
                <p className="truncate text-xs text-slate-500">{member.email}</p>
              </div>
              {canManage ? (
                <select
                  value={member.role}
                  disabled={busy}
                  onChange={(e) => handleRoleChange(member, e.target.value as MemberRole)}
                  className={SELECT_CLASS}
                  aria-label={`Роль ${member.name}`}
                >
                  <option value="editor">{ROLE_LABELS.editor}</option>
                  <option value="viewer">{ROLE_LABELS.viewer}</option>
                </select>
              ) : (
                <span className="text-xs text-slate-500">{ROLE_LABELS[member.role]}</span>
              )}
              {member.role !== 'owner' && (canManage || isSelf) && (
                <Button variant="ghost" className="text-red-600 hover:bg-red-50" disabled={busy} onClick={() => handleRemove(member)}>
                  {isSelf ? 'Покинуть' : 'Удалить'}
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-xs text-slate-500">
        Редактор может изменять колонки и задачи, участник с ролью «Только просмотр» - только смотреть. Управлять участниками может только
        владелец.
      </p>
    </Modal>
  );
}
