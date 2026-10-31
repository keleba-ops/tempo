export type Role = 'owner' | 'customer';
export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';
export type BookingLocationType = 'business' | 'house_call';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  emailNotifications: boolean;
  inAppNotifications: boolean;
  phone: string;
  address: string;
  city: string;
  businessId?: string;
  businessSlug?: string;
}

export interface Service {
  id: string;
  businessId: string;
  name: string;
  description: string;
  durationMinutes: number;
  bufferMinutes: number;
  priceCents: number;
  isActive: boolean;
  sortOrder: number;
  houseCall: boolean;
}

export interface BusinessSummary {
  id: string;
  name: string;
  slug: string;
  category: string;
  tagline: string;
  city: string;
  address: string;
  country: string;
  timezone: string;
  coverImage: string;
  accentColor: string;
  rating: number;
  reviewCount: number;
  approvalRequired: boolean;
  startingPriceCents: number;
  serviceCount: number;
  isFavorite: boolean;
}

export interface AvailabilityWindow {
  startMinute: number;
  endMinute: number;
}

export interface WeeklyHours {
  weekday: number;
  isOpen: boolean;
  windows: AvailabilityWindow[];
}

export interface AvailabilityException {
  id: string;
  date: string;
  isClosed: boolean;
  startMinute: number | null;
  endMinute: number | null;
  note: string;
}

export interface BusinessDetail extends BusinessSummary {
  description: string;
  phone: string;
  email: string;
  ownerName: string;
  services: Service[];
  weeklyHours: WeeklyHours[];
  exceptions: AvailabilityException[];
  favoriteServices: string[];
}

export interface Slot {
  startsAt: string;
  label: string;
  startMinute: number;
  period: 'Morning' | 'Afternoon' | 'Evening';
}

export interface SlotDay {
  date: string;
  dayLabel: string;
  dateLabel: string;
  monthLabel: string;
  isToday: boolean;
  count: number;
}

export interface Booking {
  id: string;
  status: BookingStatus;
  startsAt: string;
  endsAt: string;
  notes: string;
  priceCents: number;
  createdAt: string;
  cancellationReason: string;
  canCancel: boolean;
  canReschedule: boolean;
  locationType: BookingLocationType;
  serviceAddress: string;
  serviceCity: string;
  contactPhone: string;
  service: {
    id: string;
    name: string;
    durationMinutes: number;
    bufferMinutes: number;
    priceCents: number;
    houseCall: boolean;
  };
  customer: {
    id: string;
    name: string;
    email: string;
    phone: string;
  };
  business: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    coverImage: string;
    address: string;
    city: string;
  };
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  actionUrl: string;
  isRead: boolean;
  createdAt: string;
  businessId: string | null;
  bookingId: string | null;
}

export interface EmailDelivery {
  id: string;
  toEmail: string;
  subject: string;
  kind: string;
  status: string;
  createdAt: string;
  html: string;
}

export interface FavoriteBusiness extends BusinessSummary {
  nextAvailable: string | null;
}

export interface WatchedService {
  id: string;
  serviceId: string;
  serviceName: string;
  businessName: string;
  businessSlug: string;
}

export interface FavoritesResponse {
  businesses: FavoriteBusiness[];
  services: WatchedService[];
}

export interface OwnerOverview {
  business: BusinessDetail;
  stats: {
    upcoming: number;
    pending: number;
    revenueMonthCents: number;
    completedMonth: number;
    newCustomersMonth: number;
    occupancyPercent: number;
  };
  today: Booking[];
  upcoming: Booking[];
  pending: Booking[];
  weekDays: { date: string; label: string; count: number }[];
}


export interface ConversationSummary {
  id: string;
  businessId: string;
  businessName: string;
  businessSlug: string;
  businessCover: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  lastMessage: string;
  lastMessageAt: string | null;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}
