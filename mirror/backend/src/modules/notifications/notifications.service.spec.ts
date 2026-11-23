import { Notification } from '../../database/entities/platform/notification.entity';
import { UserRole } from '../../database/entities/identity/user.entity';
import { NotificationsService } from './notifications.service';

interface AnyRepo {
  create: jest.Mock;
  save: jest.Mock;
  findAndCount: jest.Mock;
  countBy: jest.Mock;
  update: jest.Mock;
  find: jest.Mock;
  insert: jest.Mock;
}

function mockNotifRepo(): AnyRepo {
  return {
    create: jest.fn((entity) => ({ ...entity })),
    save: jest.fn(async (entity) => ({ id: 'n1', ...entity })),
    findAndCount: jest.fn(),
    countBy: jest.fn(),
    update: jest.fn(),
    find: jest.fn(),
    insert: jest.fn(),
  };
}

describe('NotificationsService', () => {
  let notifRepo: AnyRepo;
  let usersRepo: { find: jest.Mock };
  let service: NotificationsService;

  beforeEach(() => {
    notifRepo = mockNotifRepo();
    usersRepo = { find: jest.fn() };
    service = new NotificationsService(notifRepo as never, usersRepo as never);
  });

  describe('notify', () => {
    it('creates a notification with the given fields', async () => {
      await service.notify('u1', 'purchase_success', 'Title', 'Body');
      expect(notifRepo.create).toHaveBeenCalledWith({
        userId: 'u1',
        type: 'purchase_success',
        title: 'Title',
        body: 'Body',
        link: null,
        severity: 'success',
        relatedType: null,
        relatedId: null,
        dedupKey: null,
      });
      expect(notifRepo.save).toHaveBeenCalled();
    });

    it('defaults the body to null when omitted', async () => {
      await service.notify('u1', 'system', 'Title');
      expect(notifRepo.create).toHaveBeenCalledWith({
        userId: 'u1',
        type: 'system',
        title: 'Title',
        body: null,
        link: null,
        severity: 'info',
        relatedType: null,
        relatedId: null,
        dedupKey: null,
      });
    });

    it('stores only application-relative deep links', async () => {
      await service.notify(
        'u1',
        'system',
        'Title',
        'Body',
        'https://untrusted.example/redirect',
      );
      expect(notifRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ link: null }),
      );

      await service.notify(
        'u1',
        'system',
        'Title',
        'Body',
        ' /library?tab=all ',
      );
      expect(notifRepo.create).toHaveBeenLastCalledWith(
        expect.objectContaining({ link: '/library?tab=all' }),
      );
    });
  });

  describe('notifySafe', () => {
    it('never throws when persistence fails (business op must survive)', async () => {
      notifRepo.save.mockRejectedValue(new Error('db down'));
      await expect(
        service.notifySafe('u1', 'purchase_success', 'Title', 'Body'),
      ).resolves.toBeUndefined();
    });
  });

  describe('notifyManySafe', () => {
    it('keeps the related domain object on every bulk row', async () => {
      usersRepo.find.mockResolvedValue([
        { id: 'u1', preferredLocale: 'fa' },
        { id: 'u2', preferredLocale: 'en' },
      ]);
      notifRepo.insert.mockResolvedValue({ identifiers: [] });

      await expect(
        service.notifyManySafe(
          ['u1', 'u2'],
          'product_updated',
          { agentName: 'Atlas', version: '2' },
          {
            variant: 'owner',
            relatedType: 'agent',
            relatedId: '11111111-1111-4111-8111-111111111111',
          },
        ),
      ).resolves.toBe(2);

      expect(notifRepo.create).toHaveBeenCalledTimes(2);
      expect(notifRepo.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          userId: 'u1',
          type: 'product_updated',
          relatedType: 'agent',
          relatedId: '11111111-1111-4111-8111-111111111111',
        }),
      );
      expect(notifRepo.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          userId: 'u2',
          type: 'product_updated',
          relatedType: 'agent',
          relatedId: '11111111-1111-4111-8111-111111111111',
        }),
      );
      expect(notifRepo.insert).toHaveBeenCalledTimes(1);
    });

    it('does not copy an unsafe external deep link to any bulk recipient', async () => {
      usersRepo.find.mockResolvedValue([{ id: 'u1', preferredLocale: 'fa' }]);
      notifRepo.insert.mockResolvedValue({ identifiers: [] });

      await service.notifyManySafe(
        ['u1'],
        'product_updated',
        { agentName: 'Atlas', version: '2' },
        { link: '//untrusted.example/redirect' },
      );

      expect(notifRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ link: null }),
      );
    });
  });

  describe('notifyRoleSafe', () => {
    it('fans out to every member of the role', async () => {
      usersRepo.find.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]);
      await service.notifyRoleSafe(
        UserRole.ADMIN,
        'report_submitted',
        'Title',
        'Body',
      );
      expect(usersRepo.find).toHaveBeenCalledWith({
        where: { role: UserRole.ADMIN },
        select: { id: true },
      });
      expect(notifRepo.save).toHaveBeenCalledTimes(2);
    });

    it('never throws when the recipient lookup fails', async () => {
      usersRepo.find.mockRejectedValue(new Error('db down'));
      await expect(
        service.notifyRoleSafe(UserRole.ADMIN, 'report_submitted', 'T', 'B'),
      ).resolves.toBeUndefined();
      expect(notifRepo.save).not.toHaveBeenCalled();
    });

    it('keeps notifying remaining members when one write fails', async () => {
      usersRepo.find.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]);
      notifRepo.save.mockImplementation(async (entity) => {
        if (entity.userId === 'a1') throw new Error('write failed');
        return entity;
      });
      await expect(
        service.notifyRoleSafe(UserRole.ADMIN, 'report_submitted', 'T', 'B'),
      ).resolves.toBeUndefined();
      expect(notifRepo.save).toHaveBeenCalledTimes(2);
    });
  });

  describe('listForUser', () => {
    it('scopes the query to the recipient with paging and newest-first', async () => {
      notifRepo.findAndCount.mockResolvedValue([[{} as Notification], 1]);
      await service.listForUser('u1', 2, 20);
      expect(notifRepo.findAndCount).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        order: { createdAt: 'DESC', id: 'DESC' },
        skip: 20,
        take: 20,
      });
    });
  });

  describe('unreadCount', () => {
    it('counts only the user unread notifications', async () => {
      notifRepo.countBy.mockResolvedValue(3);
      await expect(service.unreadCount('u1')).resolves.toBe(3);
      expect(notifRepo.countBy).toHaveBeenCalledWith({
        userId: 'u1',
        readAt: expect.anything(),
      });
    });
  });

  describe('markRead', () => {
    it('updates only notifications owned by the user and still unread', async () => {
      notifRepo.update.mockResolvedValue({ affected: 1 });
      await expect(service.markRead('u1', 'n1')).resolves.toBe(true);
      expect(notifRepo.update).toHaveBeenCalledWith(
        { id: 'n1', userId: 'u1', readAt: expect.anything() },
        { readAt: expect.any(Date) },
      );
    });

    it('returns false (→ 404) for another user notification or a read one', async () => {
      notifRepo.update.mockResolvedValue({ affected: 0 });
      await expect(service.markRead('u2', 'n1')).resolves.toBe(false);
    });
  });

  describe('markAllRead', () => {
    it('updates only the caller unread notifications', async () => {
      await service.markAllRead('u1');
      expect(notifRepo.update).toHaveBeenCalledWith(
        { userId: 'u1', readAt: expect.anything() },
        { readAt: expect.any(Date) },
      );
    });
  });
});
