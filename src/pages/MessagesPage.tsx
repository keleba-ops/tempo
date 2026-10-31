import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DateTime } from 'luxon';
import {
  ArrowLeft,
  ArrowUpRight,
  MessageCircle,
  Send,
  Sparkles,
  Store,
} from 'lucide-react';
import type { ChatMessage, ConversationSummary } from '../../shared/types';
import { get, post } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { announceMessagesChanged } from '../lib/events';
import { Avatar } from '../components/Avatar';
import { PageLoader, Spinner } from '../components/Loading';
import { EmptyState } from '../components/EmptyState';
import { timeAgo } from '../lib/format';

function messageTime(iso: string): string {
  return DateTime.fromISO(iso, { zone: 'utc' }).toLocal().toFormat('h:mm a');
}

function dayLabel(iso: string): string {
  const dt = DateTime.fromISO(iso, { zone: 'utc' }).toLocal();
  const today = DateTime.now();
  if (dt.hasSame(today, 'day')) return 'Today';
  if (dt.hasSame(today.minus({ days: 1 }), 'day')) return 'Yesterday';
  return dt.toFormat('cccc, LLL d');
}

export function MessagesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedId = searchParams.get('c') || '';
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [mobileChat, setMobileChat] = useState(false);
  const messagesPanelRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef('');
  selectedRef.current = selectedId;

  const selected = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId) || null,
    [conversations, selectedId],
  );

  const loadConversations = useCallback(async (silent = false) => {
    try {
      const data = await get<{ conversations: ConversationSummary[]; unreadCount: number }>('/conversations');
      setConversations(data.conversations);
      if (!silent) setLoading(false);
      return data.conversations;
    } catch (error) {
      if (!silent) {
        toast(error instanceof Error ? error.message : 'Could not load your conversations.', 'error');
        setLoading(false);
      }
      return [];
    }
  }, [toast]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void loadConversations();
    const timer = window.setInterval(() => {
      if (!cancelled) void loadConversations(true);
    }, 12_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [user, loadConversations]);

  useEffect(() => {
    if (loading || conversations.length === 0) return;
    const requested = requestedId && conversations.some((conversation) => conversation.id === requestedId);
    if (requested) {
      if (selectedId !== requestedId) setSelectedId(requestedId);
      setMobileChat(true);
      return;
    }
    if (selectedId && conversations.some((conversation) => conversation.id === selectedId)) return;
    if (window.innerWidth > 860) setSelectedId(conversations[0].id);
  }, [conversations, loading, requestedId, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    let initialized = false;
    const fetchThread = async () => {
      if (!initialized) setThreadLoading(true);
      try {
        const data = await get<{ conversation: ConversationSummary; messages: ChatMessage[] }>(
          `/conversations/${selectedId}/messages`,
        );
        if (cancelled) return;
        setMessages(data.messages);
        setConversations((current) =>
          current.map((conversation) =>
            conversation.id === selectedId ? { ...conversation, unreadCount: 0 } : conversation,
          ),
        );
        announceMessagesChanged();
      } catch (error) {
        if (!cancelled && !initialized) {
          toast(error instanceof Error ? error.message : 'Could not open this conversation.', 'error');
        }
      } finally {
        if (!cancelled) {
          initialized = true;
          setThreadLoading(false);
        }
      }
    };
    setMessages([]);
    void fetchThread();
    const timer = window.setInterval(() => {
      if (!cancelled) void fetchThread();
    }, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [selectedId, toast]);

  useEffect(() => {
    const panel = messagesPanelRef.current;
    if (panel) panel.scrollTo({ top: panel.scrollHeight, behavior: 'smooth' });
  }, [messages.length, selectedId]);

  function chooseConversation(conversation: ConversationSummary) {
    setSelectedId(conversation.id);
    setSearchParams({ c: conversation.id }, { replace: true });
    setMobileChat(true);
    announceMessagesChanged();
  }

  async function sendMessage() {
    const body = input.trim();
    if (!body || !selectedId || sending) return;
    setSending(true);
    try {
      const data = await post<{ message: ChatMessage }>(`/conversations/${selectedId}/messages`, { body });
      setMessages((current) => [...current, data.message]);
      setInput('');
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === selectedId
            ? { ...conversation, lastMessage: body, lastMessageAt: data.message.createdAt }
            : conversation,
        ),
      );
      announceMessagesChanged();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Message could not be sent.', 'error');
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  if (!user) return null;
  if (loading) return <PageLoader label="Opening your messages" />;

  const isOwner = user.role === 'owner';
  const counterpartName = selected ? (isOwner ? selected.customerName : selected.businessName) : '';

  return (
    <div className="messages-page">
      <div className="page-head messages-page-head">
        <div>
          <div className="eyebrow">Direct line</div>
          <h1>Messages</h1>
          <p>{isOwner ? 'Quick notes with your customers, without the phone tag.' : 'Talk to the people behind your appointments.'}</p>
        </div>
        <div className="messages-live-pill"><span className="live-dot" /> Live chat · replies update instantly</div>
      </div>

      <div className={`chat-shell ${mobileChat ? 'chat-mobile-open' : ''}`}>
        <aside className="chat-thread-list">
          <div className="chat-thread-head">
            <div>
              <strong>Conversations</strong>
              <span>{conversations.reduce((total, conversation) => total + conversation.unreadCount, 0)} unread</span>
            </div>
            <MessageCircle size={17} />
          </div>
          {conversations.length > 0 ? (
            <div className="chat-threads">
              {conversations.map((conversation) => {
                const name = isOwner ? conversation.customerName : conversation.businessName;
                const active = conversation.id === selectedId;
                return (
                  <button
                    key={conversation.id}
                    className={`chat-thread ${active ? 'active' : ''}`}
                    onClick={() => chooseConversation(conversation)}
                  >
                    {isOwner ? (
                      <Avatar name={conversation.customerName} size="md" />
                    ) : (
                      <img src={conversation.businessCover} alt="" className="chat-business-avatar" />
                    )}
                    <div className="chat-thread-copy">
                      <div className="chat-thread-top">
                        <strong>{name}</strong>
                        <span>{conversation.lastMessageAt ? timeAgo(conversation.lastMessageAt) : ''}</span>
                      </div>
                      <div className="chat-thread-preview">
                        <span>{conversation.lastMessage || 'Start the conversation'}</span>
                        {conversation.unreadCount > 0 && <em>{conversation.unreadCount}</em>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="chat-threads-empty">
              <MessageCircle size={24} />
              <strong>No conversations yet</strong>
              <p>
                {isOwner
                  ? 'Start a conversation from any booking in your dashboard.'
                  : 'Open a business page and tap “Message” to say hello.'}
              </p>
              <Link to={isOwner ? '/owner/bookings' : '/explore'} className="btn btn-sm btn-outline">
                {isOwner ? 'View bookings' : 'Explore businesses'}
              </Link>
            </div>
          )}
        </aside>

        <section className="chat-panel">
          {selected ? (
            <>
              <header className="chat-panel-head">
                <button className="icon-btn chat-back" onClick={() => setMobileChat(false)} aria-label="Back to conversations">
                  <ArrowLeft size={18} />
                </button>
                {isOwner ? (
                  <Avatar name={selected.customerName} size="md" />
                ) : (
                  <img src={selected.businessCover} alt="" className="chat-business-avatar chat-business-avatar-lg" />
                )}
                <div className="chat-panel-person">
                  <strong>{counterpartName}</strong>
                  <span>{isOwner ? selected.customerEmail || 'Customer' : 'Independent business · Botswana'}</span>
                </div>
                {isOwner ? (
                  <a href={`mailto:${selected.customerEmail}`} className="chat-head-action" aria-label="Email customer">
                    Email <ArrowUpRight size={13} />
                  </a>
                ) : (
                  <Link to={`/b/${selected.businessSlug}`} className="chat-head-action">
                    <Store size={13} /> View business
                  </Link>
                )}
              </header>

              <div className="chat-messages" ref={messagesPanelRef}>
                {threadLoading ? (
                  <div className="chat-loading"><Spinner size={18} /> Loading messages…</div>
                ) : messages.length > 0 ? (
                  <>
                    {messages.map((message, index) => {
                      const own = message.senderId === user.id;
                      const showDay = index === 0 || dayLabel(messages[index - 1].createdAt) !== dayLabel(message.createdAt);
                      return (
                        <div key={message.id}>
                          {showDay && <div className="chat-day-divider"><span>{dayLabel(message.createdAt)}</span></div>}
                          <div className={`chat-message ${own ? 'own' : 'other'}`}>
                            {!own && (
                              isOwner ? (
                                <Avatar name={selected.customerName} size="sm" />
                              ) : (
                                <img src={selected.businessCover} alt="" className="chat-business-avatar chat-business-avatar-sm" />
                              )
                            )}
                            <div>
                              <div className="chat-bubble">{message.body}</div>
                              <span className="chat-message-time">{messageTime(message.createdAt)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </>
                ) : (
                  <div className="chat-welcome">
                    <span className="chat-welcome-icon"><Sparkles size={20} /></span>
                    <h3>Say hello to {isOwner ? selected.customerName.split(' ')[0] : selected.businessName}.</h3>
                    <p>Ask about your appointment, share a reference, or sort out the details for a house call.</p>
                  </div>
                )}
              </div>

              <div className="chat-composer">
                <textarea
                  rows={1}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Message ${counterpartName || '…'}`}
                  maxLength={2000}
                  aria-label="Message"
                />
                <button className="btn btn-accent chat-send-btn" onClick={sendMessage} disabled={!input.trim() || sending}>
                  {sending ? <Spinner size={16} /> : <><Send size={15} /> Send</>}
                </button>
              </div>
              <div className="chat-composer-foot">
                <span>Enter to send · Shift + Enter for a new line</span>
                <span>{input.length}/2000</span>
              </div>
            </>
          ) : (
            <div className="chat-empty-panel">
              <div className="chat-empty-illustration"><MessageCircle size={30} /></div>
              <h2>Your messages, together.</h2>
              <p>
                {isOwner
                  ? 'Choose a conversation to reply, or start one from a booking.'
                  : 'Choose a conversation, or start one from a business page.'}
              </p>
              <div className="chat-empty-tips">
                <span><span className="live-dot" /> Updates every couple of seconds</span>
                <span><Sparkles size={13} /> No email back-and-forth</span>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
