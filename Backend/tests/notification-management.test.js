// Backend/tests/notification-management.test.js

const mongoose = require('mongoose');
const Notification = require('../models/notification.model');
const User = require('../models/users.model');
const notificationService = require('../services/notification.service');

describe('Notification Management & Settings Tests', () => {
  const userId1 = new mongoose.Types.ObjectId().toString();
  const userId2 = new mongoose.Types.ObjectId().toString();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('notificationService.markAllRead', () => {
    it('marks only general notifications as read when category is general', async () => {
      const updateManySpy = jest.spyOn(Notification, 'updateMany').mockResolvedValue({ modifiedCount: 3 });

      const result = await notificationService.markAllRead(userId1, 'general');

      expect(updateManySpy).toHaveBeenCalledWith(
        {
          user_id: userId1,
          isRead: false,
          type: { $ne: 'message' },
        },
        {
          $set: expect.objectContaining({ isRead: true }),
        }
      );
      expect(result.updated).toBe(3);
    });

    it('marks only text/message notifications as read when category is text or messages', async () => {
      const updateManySpy = jest.spyOn(Notification, 'updateMany').mockResolvedValue({ modifiedCount: 2 });

      const result = await notificationService.markAllRead(userId1, 'messages');

      expect(updateManySpy).toHaveBeenCalledWith(
        {
          user_id: userId1,
          isRead: false,
          type: 'message',
        },
        {
          $set: expect.objectContaining({ isRead: true }),
        }
      );
      expect(result.updated).toBe(2);
    });

    it('marks all notifications as read when no category is provided', async () => {
      const updateManySpy = jest.spyOn(Notification, 'updateMany').mockResolvedValue({ modifiedCount: 5 });

      const result = await notificationService.markAllRead(userId1);

      expect(updateManySpy).toHaveBeenCalledWith(
        {
          user_id: userId1,
          isRead: false,
        },
        {
          $set: expect.objectContaining({ isRead: true }),
        }
      );
      expect(result.updated).toBe(5);
    });

    it('throws on invalid user ID format', async () => {
      await expect(notificationService.markAllRead('invalid-id')).rejects.toThrow('Invalid user ID format');
    });
  });

  describe('notificationService.clearAll', () => {
    it('permanently deletes all notifications for the given user from database', async () => {
      const deleteManySpy = jest.spyOn(Notification, 'deleteMany').mockResolvedValue({ deletedCount: 7 });

      const result = await notificationService.clearAll(userId1);

      expect(deleteManySpy).toHaveBeenCalledWith({ user_id: userId1 });
      expect(result.deleted).toBe(7);
    });

    it('does not delete other users notifications', async () => {
      const deleteManySpy = jest.spyOn(Notification, 'deleteMany').mockResolvedValue({ deletedCount: 0 });

      await notificationService.clearAll(userId2);

      expect(deleteManySpy).toHaveBeenCalledWith({ user_id: userId2 });
    });

    it('throws on invalid user ID format', async () => {
      await expect(notificationService.clearAll('invalid-id')).rejects.toThrow('Invalid user ID format');
    });
  });

  describe('User Settings Controllers', () => {
    const { getUserSettings, updateUserSettings } = require('../controllers/users.controllers');

    it('getUserSettings returns default merged settings when user has empty settings', async () => {
      jest.spyOn(User, 'findById').mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({ _id: userId1, settings: {} }),
        }),
      });

      const req = { user: { id: userId1 } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await getUserSettings(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          settings: expect.objectContaining({
            emailNotifications: true,
            pushNotifications: true,
            messageAlerts: true,
            themePreference: 'system',
          }),
        })
      );
    });

    it('updateUserSettings persists partial setting updates and returns 200', async () => {
      jest.spyOn(User, 'findByIdAndUpdate').mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            _id: userId1,
            settings: {
              emailNotifications: false,
              pushNotifications: true,
              messageAlerts: false,
              pickupAlerts: true,
              opportunityAlerts: true,
              themePreference: 'dark',
            },
          }),
        }),
      });

      const req = {
        user: { id: userId1 },
        body: {
          emailNotifications: false,
          messageAlerts: false,
          themePreference: 'dark',
        },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await updateUserSettings(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Settings updated successfully.',
          settings: expect.objectContaining({
            emailNotifications: false,
            messageAlerts: false,
            themePreference: 'dark',
          }),
        })
      );
    });
  });
});

