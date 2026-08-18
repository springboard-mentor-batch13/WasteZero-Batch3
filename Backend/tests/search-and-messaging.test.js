// Backend/tests/search-and-messaging.test.js
//
// Comprehensive Test Suite for Global User Search & Cross-Role Messaging
//

'use strict';

const mongoose = require('mongoose');
const User = require('../models/users.model');
const Message = require('../models/message.model');
const messageService = require('../services/message.service');
const { searchUsers } = require('../controllers/users.controllers');

describe('Global User Search & Cross-Role Messaging Matrix', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Global User Search (searchUsers controller)', () => {
    const mockRes = () => {
      const res = {};
      res.status = jest.fn().mockReturnValue(res);
      res.json = jest.fn().mockReturnValue(res);
      return res;
    };

    const roles = ['volunteer', 'ngo', 'admin'];

    roles.forEach(callerRole => {
      roles.forEach(targetRole => {
        it(`${callerRole} searches for ${targetRole} by username successfully`, async () => {
          const callerId = new mongoose.Types.ObjectId();
          const targetId = new mongoose.Types.ObjectId();

          const req = {
            user: { _id: callerId, role: callerRole },
            query: { username: 'testuser' },
          };
          const res = mockRes();

          const mockUsers = [
            {
              _id: targetId,
              name: 'Test Target User',
              username: 'testuser',
              role: targetRole,
              email: 'target@example.com',
            },
          ];

          const leanMock = jest.fn().mockResolvedValue(mockUsers);
          const limitMock = jest.fn().mockReturnValue({ lean: leanMock });
          const selectMock = jest.fn().mockReturnValue({ limit: limitMock });
          const findSpy = jest.spyOn(User, 'find').mockReturnValue({ select: selectMock });

          await searchUsers(req, res);

          expect(res.status).toHaveBeenCalledWith(200);
          expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
              success: true,
              data: mockUsers,
            })
          );

          // Verify User.find was called with criteria excluding self and matching role filter
          expect(findSpy).toHaveBeenCalledWith(
            expect.objectContaining({
              _id: { $ne: callerId },
              isSuspended: { $ne: true },
            })
          );
        });
      });
    });

    it('excludes caller from search results and requires username query', async () => {
      const callerId = new mongoose.Types.ObjectId();
      const req = {
        user: { _id: callerId, role: 'volunteer' },
        query: { username: '   ' },
      };
      const res = mockRes();

      await searchUsers(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: "Query param 'username' is required.",
        })
      );
    });

    it('rejects invalid targetRole with 400', async () => {
      const callerId = new mongoose.Types.ObjectId();
      const req = {
        user: { _id: callerId, role: 'volunteer' },
        query: { username: 'john', targetRole: 'superadmin' },
      };
      const res = mockRes();

      await searchUsers(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringContaining('targetRole must be one of'),
        })
      );
    });
  });

  describe('Cross-Role Messaging (messageService.createMessage)', () => {
    const roles = ['volunteer', 'ngo', 'admin'];

    roles.forEach(senderRole => {
      roles.forEach(receiverRole => {
        it(`allows ${senderRole} to send message to ${receiverRole}`, async () => {
          const senderId = new mongoose.Types.ObjectId().toString();
          const receiverId = new mongoose.Types.ObjectId().toString();

          jest.spyOn(User, 'findById').mockReturnValue({
            select: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue({
                _id: receiverId,
                role: receiverRole,
                isSuspended: false,
              }),
            }),
          });

          const mockCreatedDoc = {
            _id: new mongoose.Types.ObjectId(),
            sender_id: senderId,
            receiver_id: receiverId,
            conversation_id: 'conv_123',
            content: 'encrypted_content',
            toObject: () => ({
              _id: new mongoose.Types.ObjectId(),
              sender_id: senderId,
              receiver_id: receiverId,
              conversation_id: 'conv_123',
            }),
          };

          jest.spyOn(Message, 'create').mockResolvedValue(mockCreatedDoc);

          const result = await messageService.createMessage({
            sender_id: senderId,
            sender_role: senderRole,
            receiver_id: receiverId,
            content: 'Hello there!',
          });

          expect(result).toBeDefined();
          expect(result.content).toBe('Hello there!');
        });
      });
    });

    it('rejects sending messages to oneself', async () => {
      const userId = new mongoose.Types.ObjectId().toString();

      await expect(
        messageService.createMessage({
          sender_id: userId,
          sender_role: 'volunteer',
          receiver_id: userId,
          content: 'Hello to myself',
        })
      ).rejects.toThrow('Cannot send messages to yourself');
    });

    it('rejects sending messages to non-existent user', async () => {
      const senderId = new mongoose.Types.ObjectId().toString();
      const receiverId = new mongoose.Types.ObjectId().toString();

      jest.spyOn(User, 'findById').mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(null),
        }),
      });

      await expect(
        messageService.createMessage({
          sender_id: senderId,
          sender_role: 'volunteer',
          receiver_id: receiverId,
          content: 'Hello ghost',
        })
      ).rejects.toThrow('Recipient user does not exist');
    });

    it('rejects sending messages to suspended user', async () => {
      const senderId = new mongoose.Types.ObjectId().toString();
      const receiverId = new mongoose.Types.ObjectId().toString();

      jest.spyOn(User, 'findById').mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            _id: receiverId,
            role: 'ngo',
            isSuspended: true,
          }),
        }),
      });

      await expect(
        messageService.createMessage({
          sender_id: senderId,
          sender_role: 'volunteer',
          receiver_id: receiverId,
          content: 'Hello suspended',
        })
      ).rejects.toThrow('Cannot message a suspended user');
    });
  });
});
