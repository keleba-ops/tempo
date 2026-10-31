import { useState } from 'react';
import { CalendarCheck, Search, Smartphone, Sparkles, Store } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Modal } from './Modal';
import { isIosDevice } from '../lib/pwa';

interface Slide { icon: LucideIcon; title: string; body: string }

const SLIDES: Slide[] = [
  { icon: Sparkles, title: 'Welcome to Tempo', body: 'Tempo makes booking appointments simple across Botswana. Find a salon, barber, studio or trainer, book a time, with prices shown in BWP. No phone tag.' },
  { icon: Search, title: 'Book in three taps', body: 'Browse businesses by category or city, pick a service and an open time, then confirm. You can reschedule, cancel or message the business any time.' },
  { icon: Store, title: 'Run a business?', body: 'Create your page, add services and prices, set your working hours and share your booking link. Clients book themselves and you see everything in one calendar.' },
  { icon: CalendarCheck, title: 'Never miss an appointment', body: 'Get confirmations, reminders and updates inside the app, all in one place.' },
  {
    icon: Smartphone,
    title: 'Install it on your phone',
    body: isIosDevice()
      ? 'In Safari tap Share, then "Add to Home Screen". Tempo opens like any other app.'
      : 'Tap the browser menu and choose "Install app" (or "Add to Home screen"). Tempo opens like any other app.',
  },
];

/** First thing a new visitor sees: what the app is and how it works, before sign-up. */
export function IntroTour({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index];
  const Icon = slide.icon;
  const last = index === SLIDES.length - 1;

  return (
    <Modal open onClose={() => {}} hideClose size="sm">
      <div className="wizard">
        <div className="wizard-icon"><Icon size={28} /></div>
        <h2>{slide.title}</h2>
        <p>{slide.body}</p>
        <div className="wizard-dots" aria-label={`Step ${index + 1} of ${SLIDES.length}`}>
          {SLIDES.map((_, i) => <span key={i} className={i === index ? 'on' : ''} />)}
        </div>
        <div className="wizard-actions">
          {index === 0 ? (
            <button className="btn btn-ghost" onClick={onDone}>Skip</button>
          ) : (
            <button className="btn btn-ghost" onClick={() => setIndex(index - 1)}>Back</button>
          )}
          <button className="btn btn-accent" onClick={() => (last ? onDone() : setIndex(index + 1))}>
            {last ? 'Create account' : 'Next'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
