import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Download, Share, X } from 'lucide-react';
import {
  dismissInstallBanner,
  getPwaState,
  isIosDevice,
  isMobileDevice,
  promptPwaInstall,
  subscribePwa,
  wasInstallBannerDismissed,
} from '../lib/pwa';
import { useToast } from '../context/ToastContext';
import { asset } from '../lib/asset';

export function InstallPrompt() {
  const [state, setState] = useState(getPwaState());
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const ios = isIosDevice();
  const mobile = isMobileDevice();

  useEffect(() => subscribePwa(() => setState(getPwaState())), []);

  useEffect(() => {
    if (state.installed || !mobile || wasInstallBannerDismissed()) return;
    if (location.pathname === '/get-app' || location.pathname.startsWith('/login') || location.pathname.startsWith('/register')) {
      setVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setVisible(true), ios ? 4200 : 3800);
    return () => window.clearTimeout(timer);
  }, [state.installed, state.available, ios, mobile, location.pathname]);

  if (!visible || state.installed) return null;

  async function install() {
    if (ios || !state.available) {
      navigate('/get-app');
      setVisible(false);
      return;
    }
    setInstalling(true);
    try {
      const outcome = await promptPwaInstall();
      if (outcome === 'accepted') {
        toast('Tempo is installing. Look for it on your home screen.');
        setVisible(false);
      } else if (outcome === 'dismissed') {
        setVisible(false);
      } else {
        navigate('/get-app');
      }
    } finally {
      setInstalling(false);
    }
  }

  function dismiss() {
    dismissInstallBanner();
    setVisible(false);
  }

  return (
    <div className={`install-banner ${location.pathname.startsWith('/b/') ? 'install-banner-lifted' : ''}`} role="region" aria-label="Install Tempo">
      <img src={asset('/icons/icon-192.png')} alt="" className="install-banner-icon" />
      <div className="install-banner-copy">
        <strong>{ios ? 'Add Tempo to your Home Screen' : state.available ? 'Install Tempo' : 'Get Tempo on your phone'}</strong>
        <span>
          {ios
            ? 'Full-screen booking, one tap away in Safari.'
            : state.available
              ? 'A quicker way to book, with your favorites and reminders close by.'
              : 'Add it to your home screen in about 10 seconds.'}
        </span>
      </div>
      <button className="btn btn-sm btn-accent install-banner-btn" onClick={install} disabled={installing}>
        {ios ? <Share size={14} /> : <Download size={14} />}
        {ios ? 'How' : state.available ? (installing ? 'Installing…' : 'Install') : 'Get app'}
      </button>
      <button className="install-banner-close" onClick={dismiss} aria-label="Dismiss install prompt">
        <X size={16} />
      </button>
    </div>
  );
}
