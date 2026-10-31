import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseSync } from 'node:sqlite';
import type { ConversationSummary } from '../../shared/types.js';
import { requireAuth } from '../auth.js';
import { getParam, parseBody } from '../http.js';
import { getBusinessRowById, getBusinessRowByOwner } from '../serializers.js';
import { ApiError, nowIso, uid } from '../utils.js';

const startConversationSchema = z.object({
  businessId: z.string().min(1).optional(),
  customerId: z.string().min(1).optional(),
  initialMessage: z.string().trim().max(2000).optional(),
});

const messageSchema = z.object({
  body: z.string().trim().min(1, 'Write a message first.').max(2000, 'Messages can be up to 2,000 characters.'),
});

interface ConversationRecord {
  id: string;
  business_id: string;
  customer_id: string;
  created_at: string;
  updated_at: string;
  owner_id: string;
  business_name: string;
  business_slug: string;
  business_cover: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

function getConversationRecord(db: DatabaseSync, conversationId: string): ConversationRecord | undefined {
  return db
    .prepare(
      `SELECT c.id, c.business_id, c.customer_id, c.created_at, c.updated_at,
        b.owner_id, b.name AS business_name, b.slug AS business_slug, b.cover_image AS business_cover,
        cu.name AS customer_name, cu.email AS customer_email, cu.phone AS customer_phone
       FROM conversations c
       JOIN businesses b ON b.id = c.business_id
       JOIN users cu ON cu.id = c.customer_id
       WHERE c.id = ?`,
    )
    .get(conversationId) as ConversationRecord | undefined;
}

function assertAccess(record: ConversationRecord | undefined, user: { id: string; role: string }): ConversationRecord {
  if (!record) throw new ApiError(404, 'Conversation not found.');
  if (user.role === 'customer' && record.customer_id !== user.id) {
    throw new ApiError(403, 'This conversation is not yours.');
  }
  if (user.role === 'owner' && record.owner_id !== user.id) {
    throw new ApiError(403, 'This conversation belongs to another business.');
  }
  return record;
}

function conversationSummaries(db: DatabaseSync, user: { id: string; role: string }): ConversationSummary[] {
  const roleFilter = user.role === 'owner' ? 'b.owner_id = ?' : 'c.customer_id = ?';
  const rows = db
    .prepare(
      `SELECT c.id, c.business_id, b.name AS business_name, b.slug AS business_slug,
        b.cover_image AS business_cover, c.customer_id, cu.name AS customer_name,
        cu.email AS customer_email, cu.phone AS customer_phone,
        c.created_at, c.updated_at,
        COALESCE((SELECT m.body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1), '') AS last_message,
        (SELECT m.created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_at,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.sender_id != ? AND m.read_at IS NULL) AS unread_count
       FROM conversations c
       JOIN businesses b ON b.id = c.business_id
       JOIN users cu ON cu.id = c.customer_id
       WHERE ${roleFilter}
       ORDER BY COALESCE((SELECT m.created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1), c.updated_at) DESC`,
    )
    .all(user.id, user.id) as unknown as {
    id: string;
    business_id: string;
    business_name: string;
    business_slug: string;
    business_cover: string;
    customer_id: string;
    customer_name: string;
    customer_email: string;
    customer_phone: string;
    created_at: string;
    updated_at: string;
    last_message: string;
    last_message_at: string | null;
    unread_count: number;
  }[];

  return rows.map((row) => ({
    id: row.id,
    businessId: row.business_id,
    businessName: row.business_name,
    businessSlug: row.business_slug,
    businessCover: row.business_cover,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    lastMessage: row.last_message,
    lastMessageAt: row.last_message_at,
    unreadCount: row.unread_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

function summaryById(db: DatabaseSync, conversationId: string, user: { id: string; role: string }) {
  return conversationSummaries(db, user).find((conversation) => conversation.id === conversationId) || null;
}

function markMessagesRead(db: DatabaseSync, conversationId: string, userId: string): void {
  db.prepare(
    'UPDATE messages SET read_at = ? WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL',
  ).run(nowIso(), conversationId, userId);
}

export function messagesRouter(db: DatabaseSync): Router {
  const router = Router();
  router.use('/conversations', requireAuth);

  router.get('/conversations/unread', (req, res) => {
    const summaries = conversationSummaries(db, req.user!);
    res.json({
      unreadCount: summaries.reduce((total, conversation) => total + conversation.unreadCount, 0),
    });
  });

  router.get('/conversations', (req, res) => {
    const conversations = conversationSummaries(db, req.user!);
    res.json({
      conversations,
      unreadCount: conversations.reduce((total, conversation) => total + conversation.unreadCount, 0),
    });
  });

  router.post('/conversations', (req, res) => {
    const input = parseBody(startConversationSchema, req.body);
    let businessId = input.businessId;
    let customerId = input.customerId;

    if (req.user!.role === 'customer') {
      if (!businessId) throw new ApiError(400, 'Choose a business to message.');
      const business = getBusinessRowById(db, businessId);
      if (!business) throw new ApiError(404, 'Business not found.');
      customerId = req.user!.id;
    } else {
      const business = getBusinessRowByOwner(db, req.user!.id, req.user!.id);
      if (!business) throw new ApiError(403, 'You do not have a business profile.');
      businessId = business.id;
      if (!customerId) throw new ApiError(400, 'Choose a customer to message.');
      const customer = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'customer'").get(customerId) as
        | { id: string }
        | undefined;
      if (!customer) throw new ApiError(404, 'Customer not found.');
      const hasBooking = db
        .prepare('SELECT 1 FROM bookings WHERE business_id = ? AND customer_id = ? LIMIT 1')
        .get(businessId, customerId) as { 1: number } | undefined;
      if (!hasBooking) throw new ApiError(403, 'You can message customers who have booked with your business.');
    }

    const existing = db
      .prepare('SELECT id FROM conversations WHERE business_id = ? AND customer_id = ?')
      .get(businessId, customerId) as { id: string } | undefined;

    let conversationId = existing?.id;
    if (!conversationId) {
      conversationId = uid();
      const timestamp = nowIso();
      db.prepare(
        'INSERT INTO conversations (id, business_id, customer_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      ).run(conversationId, businessId!, customerId!, timestamp, timestamp);
    }

    if (input.initialMessage) {
      const timestamp = nowIso();
      db.prepare(
        'INSERT INTO messages (id, conversation_id, sender_id, body, created_at, read_at) VALUES (?, ?, ?, ?, ?, NULL)',
      ).run(uid(), conversationId, req.user!.id, input.initialMessage, timestamp);
      db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(timestamp, conversationId);
    }

    const record = assertAccess(getConversationRecord(db, conversationId), req.user!);
    void record;
    res.status(existing ? 200 : 201).json({
      conversation: summaryById(db, conversationId, req.user!),
    });
  });

  router.get('/conversations/:id/messages', (req, res) => {
    const record = assertAccess(getConversationRecord(db, getParam(req.params.id)), req.user!);
    markMessagesRead(db, record.id, req.user!.id);
    const rows = db
      .prepare(
        `SELECT * FROM (
           SELECT id, conversation_id, sender_id, body, created_at, read_at
           FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 250
         ) ORDER BY created_at ASC`,
      )
      .all(record.id) as unknown as MessageRow[];

    res.json({
      conversation: summaryById(db, record.id, req.user!),
      messages: rows.map((message) => ({
        id: message.id,
        conversationId: message.conversation_id,
        senderId: message.sender_id,
        body: message.body,
        createdAt: message.created_at,
        readAt: message.read_at,
      })),
    });
  });

  router.post('/conversations/:id/messages', (req, res) => {
    const record = assertAccess(getConversationRecord(db, getParam(req.params.id)), req.user!);
    const input = parseBody(messageSchema, req.body);
    const timestamp = nowIso();
    const id = uid();
    db.prepare(
      'INSERT INTO messages (id, conversation_id, sender_id, body, created_at, read_at) VALUES (?, ?, ?, ?, ?, NULL)',
    ).run(id, record.id, req.user!.id, input.body, timestamp);
    db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(timestamp, record.id);
    res.status(201).json({
      message: {
        id,
        conversationId: record.id,
        senderId: req.user!.id,
        body: input.body,
        createdAt: timestamp,
        readAt: null,
      },
    });
  });

  return router;
}
