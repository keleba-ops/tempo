import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  ArrowRight,
  ArrowUpRight,
  BellRing,
  Check,
  Copy,
  Download,
  MoreVertical,
  Plus,
  Share,
  Smartphone,
  WifiOff,
  Zap,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { getPwaState, isIosDevice, promptPwaInstall, subscribePwa } from '../lib/pwa';
import { asset } from '../lib/asset';

export function GetApp() {
  const { toast } = useToast();
  const [state, setState] = useState(getPwaState());
  const [installing, setInstalling] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const ios = isIosDevice();
  const isLocalhost = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);

  useEffect(() => subscribePwa(() => setState(getPwaState())), []);
  useEffect(() => setShareUrl(window.location.origin), []);

  async function install() {
    if (state.installed) return;
    if (!state.available) {
      document.getElementById('install-steps')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    setInstalling(true);
    try {
      const outcome = await promptPwaInstall();
      if (outcome === 'accepted') toast('Tempo is installing. Look for it on your home screen.');
    } finally {
      setInstalling(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast('Link copied. Share it with anyone who needs a little more time.');
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      toast('Could not copy the link from this browser.', 'error');
    }
  }

  return (
    <div className="getapp-page">
      <section className="getapp-hero">
        <div className="container getapp-hero-grid">
          <div className="getapp-copy">
            <div className="eyebrow"><Smartphone size={13} /> Tempo, on your phone</div>
            <h1>Your time,<br /><em>with you.</em></h1>
            <p>
              Install Tempo once and the good places stay a tap away. Book from the home screen, keep reminders
              close, and hear about a new opening before the group chat does. Made for Botswana.
            </p>
            <div className="getapp-badges">
              <span><Check size={12} /> No app store needed</span>
              <span><Check size={12} /> Free to install</span>
              <span><Check size={12} /> Works on iPhone & Android</span>
            </div>
            <div className="getapp-actions">
              {state.installed ? (
                <Link to="/explore" className="btn btn-dark btn-lg">
                  Open Tempo <ArrowRight size={17} />
                </Link>
              ) : (
                <button className="btn btn-accent btn-lg" onClick={install} disabled={installing}>
                  <Download size={17} /> {installing ? 'Installing…' : state.available ? 'Install the app' : 'How to install'}
                </button>
              )}
              <Link to="/explore" className="text-link">
                Keep browsing in the browser
              </Link>
            </div>
            <div className="getapp-note">
              <span className="pulse-dot" />
              {state.installed ? 'Tempo is installed on this device.' : 'Takes about 10 seconds.'}
            </div>
          </div>

          <div className="getapp-phone-stage">
            <div className="getapp-orbit getapp-orbit-one" />
            <div className="getapp-orbit getapp-orbit-two" />
            <div className="getapp-phone">
              <div className="getapp-phone-notch" />
              <img src={asset('/screenshots/mobile-preview.png')} alt="Tempo booking page on a phone" />
            </div>
            <div className="getapp-float getapp-float-top">
              <span className="getapp-float-icon"><BellRing size={15} /></span>
              <div>
                <strong>A slot just opened</strong>
                <span>Kgotla Barber Co. · 11:00 AM</span>
              </div>
            </div>
            <div className="getapp-float getapp-float-bottom">
              <span className="getapp-float-icon getapp-float-icon-sage"><Zap size={15} /></span>
              <div>
                <strong>Booked in seconds</strong>
                <span>From your home screen</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="getapp-content">
        <div className="container">
          <div className="getapp-card-grid">
            <div className="getapp-install-card">
              <div className="getapp-install-head">
                <span className="getapp-app-icon"><img src={asset('/icons/icon-192.png')} alt="" /></span>
                <div>
                  <strong>Tempo</strong>
                  <span>Appointments, in rhythm · Web app</span>
                </div>
                <span className={`getapp-status ${state.installed ? 'installed' : ''}`}>
                  {state.installed ? <><Check size={12} /> Installed</> : 'Free'}
                </span>
              </div>
              <h2>{state.installed ? 'You’re all set.' : 'A quieter way to book.'}</h2>
              <p>
                {state.installed
                  ? 'Open Tempo from your home screen for full-screen booking, reminders, and favorites.'
                  : 'Tempo installs in a moment — it’s a progressive web app for Botswana, not another app-store download.'}
              </p>
              <div className="getapp-features">
                <span><Zap size={14} /> Opens full-screen, like an app</span>
                <span><WifiOff size={14} /> A cached app shell for patchy signal</span>
                <span><BellRing size={14} /> Messages and reminders stay close</span>
              </div>
              <button className="btn btn-dark btn-block" onClick={install} disabled={installing || state.installed}>
                {state.installed
                  ? <><Check size={16} /> Already installed</>
                  : <><Download size={16} /> {state.available ? 'Install Tempo' : 'Show install steps'}</>}
              </button>
              {ios && !state.installed && (
                <p className="getapp-ios-hint">
                  On iPhone or iPad, use Safari’s <Share size={12} /> Share button, then “Add to Home Screen.”
                </p>
              )}
            </div>

            <div className="getapp-qr-card">
              <div className="eyebrow">Share the good hours</div>
              <h2>Scan to open Tempo.</h2>
              <div className="getapp-qr-wrap">
                {shareUrl && (
                  <QRCodeSVG
                    value={shareUrl}
                    size={168}
                    bgColor="#fffdf8"
                    fgColor="#202d24"
                    level="M"
                    marginSize={1}
                    title="QR code for Tempo"
                  />
                )}
              </div>
              <p className="getapp-qr-url">{shareUrl.replace(/^https?:\/\//, '')}</p>
              <button className="btn btn-sm btn-outline btn-block" onClick={copyLink}>
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy link'}
              </button>
              <span className="getapp-qr-note">
                {isLocalhost
                  ? 'Open the published review link to scan this from a phone.'
                  : 'Point your phone camera here to open the app on mobile.'}
              </span>
            </div>
          </div>

          <section className="getapp-steps" id="install-steps">
            <div className="getapp-steps-head">
              <div className="eyebrow">Install in a few taps</div>
              <h2>Pick your phone.</h2>
              <p>These are the native install steps for each platform. No password or store account needed.</p>
            </div>
            <div className="getapp-step-grid">
              <div className="getapp-step-card">
                <span className="getapp-step-icon"><Smartphone size={20} /></span>
                <div className="getapp-step-platform">iPhone & iPad</div>
                <h3>Safari</h3>
                <ol>
                  <li><span>1</span> Open Tempo in Safari.</li>
                  <li><span>2</span> Tap the <Share size={13} /> Share button.</li>
                  <li><span>3</span> Choose <strong>Add to Home Screen</strong>.</li>
                  <li><span>4</span> Tap <strong>Add</strong>.</li>
                </ol>
              </div>
              <div className="getapp-step-card">
                <span className="getapp-step-icon"><Smartphone size={20} /></span>
                <div className="getapp-step-platform">Android</div>
                <h3>Chrome</h3>
                <ol>
                  <li><span>1</span> Open Tempo in Chrome.</li>
                  <li><span>2</span> Tap the <MoreVertical size={13} /> menu.</li>
                  <li><span>3</span> Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
                  <li><span>4</span> Confirm <strong>Install</strong>.</li>
                </ol>
              </div>
              <div className="getapp-step-card">
                <span className="getapp-step-icon"><Download size={20} /></span>
                <div className="getapp-step-platform">Desktop</div>
                <h3>Chrome & Edge</h3>
                <ol>
                  <li><span>1</span> Look for the install icon in the address bar.</li>
                  <li><span>2</span> Select <strong>Install Tempo</strong>.</li>
                  <li><span>3</span> Find Tempo in your apps.</li>
                </ol>
              </div>
            </div>
          </section>

          <div className="getapp-bottom">
            <div>
              <span className="eyebrow">One last thing</span>
              <h2>Made for the moments between.</h2>
              <p>Your favorites, bookings, and little reminders — all in one quiet place, on whatever screen is nearby.</p>
            </div>
            <div className="getapp-bottom-actions">
              <Link to="/register" className="btn btn-dark">
                Create an account <ArrowRight size={16} />
              </Link>
              <Link to="/explore" className="text-arrow">
                Explore places <ArrowUpRight size={15} />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
