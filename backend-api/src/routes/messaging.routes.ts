import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/error.middleware';
import prisma from '../lib/prisma';
import { parsePagination } from '../utils/pagination';

const router = Router();
router.use(authenticate);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Select shape returned for a User when embedded in participant / message. */
const USER_SELECT = { id: true, firstName: true, lastName: true, email: true } as const;

const CONVERSATION_TYPES = ['DIRECT', 'GROUP', 'SUPPORT'] as const;
const MESSAGE_TYPES = ['TEXT', 'IMAGE', 'FILE', 'SYSTEM'] as const;

/**
 * Assert the calling user is an active participant of the conversation.
 * Returns the participant row so callers can reuse it.
 * Throws 403 if not found.
 */
async function assertParticipant(conversationId: string, userId: string) {
  const participant = await prisma.conversationParticipant.findFirst({
    where: { conversationId, userId, isActive: true },
  });
  if (!participant) {
    throw new AppError('Forbidden: you are not a participant of this conversation', 403);
  }
  return participant;
}

/**
 * Parse the `attachments` JSON string field safely.
 * Returns null when the field is absent or unparseable.
 */
function parseAttachments(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Shape a raw Message row (with user relation) into the documented response shape.
 * Soft-deleted messages expose only { id, deletedAt, content: null }.
 */
function formatMessage(msg: {
  id: string;
  conversationId: string;
  userId: string;
  type: string;
  content: string;
  attachments: string | null;
  isEdited: boolean;
  editedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  user: { id: string; firstName: string; lastName: string; email: string };
}) {
  if (msg.deletedAt !== null) {
    return { id: msg.id, deletedAt: msg.deletedAt, content: null };
  }
  return {
    id: msg.id,
    conversationId: msg.conversationId,
    senderId: msg.userId,
    content: msg.content,
    type: msg.type,
    attachments: parseAttachments(msg.attachments),
    isEdited: msg.isEdited,
    editedAt: msg.editedAt,
    deletedAt: msg.deletedAt,
    createdAt: msg.createdAt,
    user: msg.user,
  };
}

// ---------------------------------------------------------------------------
// 1. GET /conversations — list conversations for the caller
// ---------------------------------------------------------------------------
router.get(
  '/conversations',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const { type } = req.query as { type?: string };
    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 50 });

    // M2: validate type query param against allowed enum values
    if (type !== undefined && !(CONVERSATION_TYPES as readonly string[]).includes(type)) {
      throw new AppError(`type must be one of: ${CONVERSATION_TYPES.join(', ')}`, 400);
    }

    const typeFilter = type ? { type: type as any } : {};

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where: {
          ...typeFilter,
          participants: { some: { userId, isActive: true } },
        },
        include: {
          // M1: only include active participants
          participants: {
            where: { isActive: true },
            include: { user: { select: USER_SELECT } },
          },
        },
        orderBy: { lastMessageAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.conversation.count({
        where: {
          ...typeFilter,
          participants: { some: { userId, isActive: true } },
        },
      }),
    ]);

    // Compute unreadCount per conversation for the caller.
    const result = conversations.map((conv) => {
      const callerParticipant = conv.participants.find((p) => p.userId === userId);
      const lastReadAt = callerParticipant?.lastReadAt ?? null;
      return { conv, lastReadAt };
    });

    // L1: parallel unread counts capped at 50 conversations (take: 50 above).
    const unreadCounts = await Promise.all(
      result.map(({ conv, lastReadAt }) =>
        prisma.message.count({
          where: {
            conversationId: conv.id,
            deletedAt: null,
            userId: { not: userId },
            ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
          },
        }),
      ),
    );

    const data = conversations.map((conv, i) => ({
      id: conv.id,
      type: conv.type,
      title: conv.title,
      lastMessageAt: conv.lastMessageAt,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      participants: conv.participants.map((p) => ({
        userId: p.userId,
        joinedAt: p.joinedAt,
        lastReadAt: p.lastReadAt,
        isActive: p.isActive,
        user: p.user,
      })),
      unreadCount: unreadCounts[i],
    }));

    return res.json({
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  }),
);

// ---------------------------------------------------------------------------
// 2. GET /conversations/:id — single conversation
// ---------------------------------------------------------------------------
router.get(
  '/conversations/:id',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const { id } = req.params;

    await assertParticipant(id, userId);

    const conv = await prisma.conversation.findUnique({
      where: { id },
      include: {
        // M1: only include active participants
        participants: {
          where: { isActive: true },
          include: { user: { select: USER_SELECT } },
        },
      },
    });

    if (!conv) {
      throw new AppError('Conversation not found', 404);
    }

    const callerParticipant = conv.participants.find((p) => p.userId === userId);
    const lastReadAt = callerParticipant?.lastReadAt ?? null;

    const unreadCount = await prisma.message.count({
      where: {
        conversationId: id,
        deletedAt: null,
        userId: { not: userId },
        ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
      },
    });

    return res.json({
      id: conv.id,
      type: conv.type,
      title: conv.title,
      lastMessageAt: conv.lastMessageAt,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      participants: conv.participants.map((p) => ({
        userId: p.userId,
        joinedAt: p.joinedAt,
        lastReadAt: p.lastReadAt,
        isActive: p.isActive,
        user: p.user,
      })),
      unreadCount,
    });
  }),
);

// ---------------------------------------------------------------------------
// 3. POST /conversations — create a conversation
// ---------------------------------------------------------------------------
router.post(
  '/conversations',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const { type, title, participantIds } = req.body as {
      type?: string;
      title?: string;
      participantIds?: string[];
    };

    // M2: validate type against allowed enum values
    if (type !== undefined && !(CONVERSATION_TYPES as readonly string[]).includes(type)) {
      throw new AppError(`type must be one of: ${CONVERSATION_TYPES.join(', ')}`, 400);
    }

    // LOW-1: cap title length
    if (title !== undefined && title.length > 200) {
      throw new AppError('title must not exceed 200 characters', 400);
    }

    if (!Array.isArray(participantIds) || participantIds.length === 0) {
      throw new AppError('participantIds must be a non-empty array', 400);
    }

    // LOW-3: deduplicate participantIds before existence check so that duplicate
    // entries don't produce a misleading "users do not exist" error.
    const uniqueParticipantIds = [...new Set(participantIds)];

    // Validate that all participantIds correspond to real users.
    const userCount = await prisma.user.count({
      where: { id: { in: uniqueParticipantIds } },
    });
    if (userCount !== uniqueParticipantIds.length) {
      throw new AppError('One or more participantIds do not correspond to existing users', 400);
    }

    // Ensure the creator is always included.
    const allParticipantIds = [...new Set([userId, ...uniqueParticipantIds])];

    // L3: DIRECT conversations must have exactly 2 participants
    const resolvedType = type ?? 'DIRECT';
    if (resolvedType.toUpperCase() === 'DIRECT' && allParticipantIds.length !== 2) {
      throw new AppError('DIRECT conversations must have exactly 2 participants', 400);
    }

    // M-002: cap participant count for non-DIRECT conversations.
    if (resolvedType !== 'DIRECT' && allParticipantIds.length > 50) {
      throw new AppError('Conversations may not have more than 50 participants', 400);
    }

    // LOW-B: wrap dedup check + create in a serializable transaction to eliminate the
    // TOCTOU race where two concurrent POSTs for the same DIRECT pair both pass the
    // findFirst check before either commits and create duplicate threads.
    if (resolvedType === 'DIRECT') {
      const result = await prisma.$transaction(
        async (tx) => {
          // Dedup check inside the transaction
          const existing = await tx.conversation.findFirst({
            where: {
              type: 'DIRECT',
              participants: {
                every: { userId: { in: allParticipantIds }, isActive: true },
              },
            },
            include: {
              participants: {
                where: { isActive: true },
                include: { user: { select: USER_SELECT } },
              },
            },
          });
          // Verify exactly 2 active participants match our pair (guards against subset matches)
          if (
            existing &&
            existing.participants.length === 2 &&
            existing.participants.every((p) => allParticipantIds.includes(p.userId))
          ) {
            return { existing };
          }

          // Create inside the same transaction
          const conv = await tx.conversation.create({
            data: {
              type: resolvedType as any,
              title: title ?? null,
              participants: {
                create: allParticipantIds.map((pid) => ({ userId: pid })),
              },
            },
            include: {
              // M1: only include active participants
              participants: {
                where: { isActive: true },
                include: { user: { select: USER_SELECT } },
              },
            },
          });
          return { conv };
        },
        { isolationLevel: 'Serializable' },
      );

      if (result.existing) {
        const existing = result.existing;
        // LOW-2: compute real unread count for the caller rather than hardcoding 0.
        const callerParticipant = existing.participants.find((p) => p.userId === userId);
        const lastReadAt = callerParticipant?.lastReadAt ?? null;
        const unreadCount = await prisma.message.count({
          where: {
            conversationId: existing.id,
            deletedAt: null,
            userId: { not: userId },
            ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
          },
        });
        return res.json({
          id: existing.id,
          type: existing.type,
          title: existing.title,
          lastMessageAt: existing.lastMessageAt,
          createdAt: existing.createdAt,
          updatedAt: existing.updatedAt,
          participants: existing.participants.map((p) => ({
            userId: p.userId,
            joinedAt: p.joinedAt,
            lastReadAt: p.lastReadAt,
            isActive: p.isActive,
            user: p.user,
          })),
          unreadCount,
          alreadyExisted: true,
        });
      }

      const conv = result.conv!;
      return res.status(201).json({
        id: conv.id,
        type: conv.type,
        title: conv.title,
        lastMessageAt: conv.lastMessageAt,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        participants: conv.participants.map((p) => ({
          userId: p.userId,
          joinedAt: p.joinedAt,
          lastReadAt: p.lastReadAt,
          isActive: p.isActive,
          user: p.user,
        })),
        unreadCount: 0,
      });
    }

    const conv = await prisma.conversation.create({
      data: {
        type: resolvedType as any,
        title: title ?? null,
        participants: {
          create: allParticipantIds.map((pid) => ({ userId: pid })),
        },
      },
      include: {
        // M1: only include active participants
        participants: {
          where: { isActive: true },
          include: { user: { select: USER_SELECT } },
        },
      },
    });

    return res.status(201).json({
      id: conv.id,
      type: conv.type,
      title: conv.title,
      lastMessageAt: conv.lastMessageAt,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      participants: conv.participants.map((p) => ({
        userId: p.userId,
        joinedAt: p.joinedAt,
        lastReadAt: p.lastReadAt,
        isActive: p.isActive,
        user: p.user,
      })),
      unreadCount: 0,
    });
  }),
);

// ---------------------------------------------------------------------------
// 4. PATCH /conversations/:id — update title
// ---------------------------------------------------------------------------
router.patch(
  '/conversations/:id',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const { id } = req.params;
    const { title } = req.body as { title?: string };

    await assertParticipant(id, userId);

    // LOW-2: reject empty body — at least one field must be provided
    if (title === undefined) {
      throw new AppError('At least one field (title) must be provided', 400);
    }
    // LOW-A: reject blank strings (whitespace-only)
    if (title.trim().length === 0) {
      throw new AppError('title must not be blank', 400);
    }

    // LOW-1: cap title length
    if (title.length > 200) {
      throw new AppError('title must not exceed 200 characters', 400);
    }

    const conv = await prisma.conversation.update({
      where: { id },
      // M5: only include title in the update when it was explicitly provided
      data: { ...(title !== undefined ? { title } : {}) },
      include: {
        // M1: only include active participants
        participants: {
          where: { isActive: true },
          include: { user: { select: USER_SELECT } },
        },
      },
    });

    // M-001: compute unreadCount for the caller so PATCH response shape matches GET.
    const callerParticipant = conv.participants.find((p) => p.userId === userId);
    const lastReadAt = callerParticipant?.lastReadAt ?? null;
    const unreadCount = await prisma.message.count({
      where: {
        conversationId: id,
        deletedAt: null,
        userId: { not: userId },
        ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
      },
    });

    return res.json({
      id: conv.id,
      type: conv.type,
      title: conv.title,
      lastMessageAt: conv.lastMessageAt,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      participants: conv.participants.map((p) => ({
        userId: p.userId,
        joinedAt: p.joinedAt,
        lastReadAt: p.lastReadAt,
        isActive: p.isActive,
        user: p.user,
      })),
      unreadCount,
    });
  }),
);

// ---------------------------------------------------------------------------
// 5. DELETE /conversations/:id — soft-delete (deactivate participant row)
// ---------------------------------------------------------------------------
router.delete(
  '/conversations/:id',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const { id } = req.params;

    await assertParticipant(id, userId);

    await prisma.conversationParticipant.updateMany({
      where: { conversationId: id, userId },
      data: { isActive: false },
    });

    return res.status(204).send();
  }),
);

// ---------------------------------------------------------------------------
// 6. GET /conversations/:id/messages — list messages with cursor pagination
// ---------------------------------------------------------------------------
router.get(
  '/conversations/:id/messages',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const { id } = req.params;
    const { before, limit: limitRaw } = req.query as { before?: string; limit?: string };

    await assertParticipant(id, userId);

    const rawLimit = Number.parseInt(String(limitRaw ?? ''), 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 50;

    // H1/H2/L4: validate cursor exists in THIS conversation, then use Prisma native cursor.
    if (before) {
      const cursorMsg = await prisma.message.findFirst({
        where: { id: before, conversationId: id },
        select: { id: true },
      });
      if (!cursorMsg) {
        throw new AppError('Cursor message not found', 400);
      }
    }

    const messages = await prisma.message.findMany({
      where: { conversationId: id },
      include: { user: { select: USER_SELECT } },
      orderBy: { createdAt: 'desc' },
      ...(before ? { cursor: { id: before }, skip: 1 } : {}),
      take: limit + 1, // fetch one extra to determine hasMore
    });

    const hasMore = messages.length > limit;
    if (hasMore) messages.pop();

    // MEDIUM-2: only stamp lastReadAt when fetching the latest page (no cursor),
    // so historical/paginated requests do not incorrectly mark the conversation as fully read.
    // L-002: also skip the write when there are no messages to mark as read.
    if (!before && messages.length > 0) {
      await prisma.conversationParticipant.updateMany({
        where: { conversationId: id, userId },
        data: { lastReadAt: new Date() },
      });
    }

    return res.json({
      data: messages.map(formatMessage),
      hasMore,
    });
  }),
);

// ---------------------------------------------------------------------------
// 7. POST /conversations/:id/messages — send a message
// ---------------------------------------------------------------------------
router.post(
  '/conversations/:id/messages',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const { id } = req.params;
    const { content, type } = req.body as { content?: string; type?: string };

    if (!content || typeof content !== 'string' || content.trim() === '') {
      throw new AppError('content is required and must be a non-empty string', 400);
    }
    if (content.trim().length > 10000) {
      throw new AppError('content must not exceed 10000 characters', 400);
    }

    // M2: validate message type against allowed enum values
    if (type !== undefined && !(MESSAGE_TYPES as readonly string[]).includes(type)) {
      throw new AppError(`type must be one of: ${MESSAGE_TYPES.join(', ')}`, 400);
    }

    await assertParticipant(id, userId);

    // M3: create message first, then update conversation using message.createdAt
    const message = await prisma.message.create({
      data: {
        conversationId: id,
        userId,
        content: content.trim(),
        type: (type as any) ?? 'TEXT',
      },
      include: { user: { select: USER_SELECT } },
    });

    await prisma.conversation.update({
      where: { id },
      data: { lastMessageAt: message.createdAt },
    });

    return res.status(201).json(formatMessage(message));
  }),
);

// ---------------------------------------------------------------------------
// 8. PATCH /messages/:messageId — edit a message
// ---------------------------------------------------------------------------
router.patch(
  '/messages/:messageId',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const { messageId } = req.params;
    const { content } = req.body as { content?: string };

    if (!content || typeof content !== 'string' || content.trim() === '') {
      throw new AppError('content is required and must be a non-empty string', 400);
    }
    if (content.trim().length > 10000) {
      throw new AppError('content must not exceed 10000 characters', 400);
    }

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: { user: { select: USER_SELECT } },
    });

    if (!message) {
      throw new AppError('Message not found', 404);
    }
    // LOW-1: assert participant before ownership check to prevent message-existence oracle
    await assertParticipant(message.conversationId, userId);
    if (message.userId !== userId) {
      throw new AppError('Forbidden: you can only edit your own messages', 403);
    }
    if (message.deletedAt !== null) {
      throw new AppError('Cannot edit a deleted message', 400);
    }
    if (message.type !== 'TEXT') {
      throw new AppError('Only TEXT messages can be edited', 400);
    }

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { content: content.trim(), isEdited: true, editedAt: new Date() },
      include: { user: { select: USER_SELECT } },
    });

    return res.json(formatMessage(updated));
  }),
);

// ---------------------------------------------------------------------------
// 9. DELETE /messages/:messageId — soft-delete a message
// ---------------------------------------------------------------------------
router.delete(
  '/messages/:messageId',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const { messageId } = req.params;

    const message = await prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new AppError('Message not found', 404);
    }
    // LOW-1: assert participant before ownership check to prevent message-existence oracle
    await assertParticipant(message.conversationId, userId);
    if (message.userId !== userId) {
      throw new AppError('Forbidden: you can only delete your own messages', 403);
    }
    if (message.deletedAt !== null) {
      throw new AppError('Message already deleted', 400);
    }

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date() },
      include: { user: { select: USER_SELECT } },
    });

    return res.json(formatMessage(updated));
  }),
);

// ---------------------------------------------------------------------------
// 10. POST /conversations/:id/read — mark conversation as read
// ---------------------------------------------------------------------------
router.post(
  '/conversations/:id/read',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const { id } = req.params;

    await assertParticipant(id, userId);

    await prisma.conversationParticipant.updateMany({
      where: { conversationId: id, userId },
      data: { lastReadAt: new Date() },
    });

    return res.json({ success: true });
  }),
);

// ---------------------------------------------------------------------------
// 11. GET /unread-count — total unread across all conversations for the caller
// ---------------------------------------------------------------------------
router.get(
  '/unread-count',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;

    // L2: cap at 50 participations to avoid O(N) pool exhaustion.
    const participations = await prisma.conversationParticipant.findMany({
      where: { userId, isActive: true },
      select: { conversationId: true, lastReadAt: true },
      take: 50,
    });

    // Count unread messages in parallel (capped at 50 conversations above).
    const counts = await Promise.all(
      participations.map((p) =>
        prisma.message.count({
          where: {
            conversationId: p.conversationId,
            deletedAt: null,
            userId: { not: userId },
            ...(p.lastReadAt ? { createdAt: { gt: p.lastReadAt } } : {}),
          },
        }),
      ),
    );

    const total = counts.reduce((sum, c) => sum + c, 0);

    return res.json({ unreadCount: total });
  }),
);

export default router;
