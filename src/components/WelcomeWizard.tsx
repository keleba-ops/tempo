import { useEffect, useState } from 'react';
import { CalendarCheck, CalendarRange, Clock3, MessageCircle, Search, Share2, Smartphone, Sparkles, Store } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Modal } from './Modal';
import { useAuth } from '../context/AuthContext';
import { isIosDevice } from '../lib/pwa';
import { needsSetup } from './SetupFlow';

interface Step { icon: LucideIcon; title: string; body: string }

const installStep: Step = {
  icon: Smartphone,
  title: 'Put Tempo on your phone',
  body: isIosDevice()
    ? 'In Safari tap the Share button, then "Add to Home Screen". Tempo opens like any other app.'
    : 'Tap the browser menu and choose "Install app" (or "Add to Home screen"). Tempo opens like any other app.',
};

const CUSTOMER: Step[] = [
  { icon: Sparkles, title: 'Welcome to Tempo', body: 'A quick tour of how booking works. It takes about 30 seconds.' },
  { icon: Search, title: '1. Find a place', body: 'Open Explore and browse businesses by category or city. Tap one to see services, prices in BWP and photos.' },
  { icon: CalendarCheck, title: '2. Book a time', body: 'Pick a service, choose a day and an open time slot, then confirm. You get a confirmation straight away.' },
  { icon: MessageCircle, title: '3. Stay in touch', body: 'Under My bookings you can reschedule or cancel. Use Messages to chat with the business, and Favorites to save places you like.' },
  installStep,
];

const OWNER: Step[] = [
  { icon: Sparkles, title: 'Welcome to Tempo', body: 'Let’s get your business ready for bookings. A quick tour, about 30 seconds.' },
  { icon: Store, title: '1. Set up your profile', body: 'Open Business profile to add your description, address, cover photo and contact details.' },
  { icon: CalendarRange, title: '2. Add services', body: 'In Services add what you offer, how long it takes and the price in BWP.' },
  { icon: Clock3, title: '3. Set your hours', body: 'In Availability choose the days and times you work. Clients can only book inside these hours.' },
  { icon: Share2, title: '4. Share your link', body: 'Copy your booking link from Business profile and send it on WhatsApp or social media. New bookings appear in Bookings and Calendar.' },
  installStep,
];

export function WelcomeWizard() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const key = user && !needsSetup(user) ? `tempo-wizard-seen:${user.id}` : null;

  useEffect(() => {
    if (!key) return setOpen(false);
    try {
      if (!localStorage.getItem(key)) {
        setIndex(0);
        setOpen(true);
      }
    } catch {
      /* storage blocked: skip the tour rather than nag every visit */
    }
  }, [key]);

  if (!user || !open) return null;
  const steps = user.role === 'owner' ? OWNER : CUSTOMER;
  const step = steps[index];
  const last = index === steps.length - 1;
  const Icon = step.icon;

  function finish() {
    try { if (key) localStorage.setItem(key, '1'); } catch { /* ignore */ }
    setOpen(false);
  }

  return (
    <Modal open onClose={finish} hideClose size="sm">
      <div className="wizard">
        <div className="wizard-icon"><Icon size={28} /></div>
        <h2>{step.title}</h2>
        <p>{step.body}</p>
        <div className="wizard-dots" aria-label={`Step ${index + 1} of ${steps.length}`}>
          {steps.map((_, i) => <span key={i} className={i === index ? 'on' : ''} />)}
        </div>
        <div className="wizard-actions">
          {index === 0 ? (
            <button className="btn btn-ghost" onClick={finish}>Skip</button>
          ) : (
            <button className="btn btn-ghost" onClick={() => setIndex(index - 1)}>Back</button>
          )}
          <button className="btn btn-accent" onClick={() => (last ? finish() : setIndex(index + 1))}>
            {last ? 'Get started' : 'Next'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
