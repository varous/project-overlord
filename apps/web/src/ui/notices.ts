/**
 * Non-blocking notices: persistent banners and transient toasts.
 *
 * The host containers never capture pointer events, so notices can never block clicks on the
 * map stack buttons, viewpoint buttons or the Cesium canvas. Only an explicit action button
 * inside a banner is interactive.
 */

export type NoticeTone = 'info' | 'warn' | 'error';

export interface BannerAction {
  label: string;
  onClick: () => void;
}

export interface BannerOptions {
  tone?: NoticeTone;
  /** Extra class applied to the banner, e.g. "warning" for URL warnings. */
  kind?: string;
  /** Single-action shorthand. */
  actionLabel?: string;
  onAction?: () => void;
  /** Multiple actions (e.g. the version-conflict banner's Reload / Save as new). */
  actions?: BannerAction[];
}

export interface Notices {
  showBanner(id: string, message: string, options?: BannerOptions): void;
  clearBanner(id: string): void;
  clearBannersByPrefix(prefix: string): void;
  toast(message: string, tone?: NoticeTone): void;
}

const TOAST_TTL_MS = 4000;

export function createNotices(container: HTMLElement): Notices {
  const bannerHost = document.createElement('div');
  bannerHost.className = 'notices';
  const toastHost = document.createElement('div');
  toastHost.className = 'toasts';
  container.append(bannerHost, toastHost);

  const banners = new Map<string, HTMLElement>();

  function showBanner(id: string, message: string, options: BannerOptions = {}): void {
    let banner = banners.get(id);
    if (banner === undefined) {
      banner = document.createElement('div');
      banner.className = 'notice-banner';
      banner.dataset.noticeId = id;

      const text = document.createElement('span');
      text.className = 'notice-banner__message';
      banner.appendChild(text);

      const actions = document.createElement('span');
      actions.className = 'notice-banner__actions';
      banner.appendChild(actions);

      bannerHost.appendChild(banner);
      banners.set(id, banner);
    }

    const messageEl = banner.querySelector('.notice-banner__message');
    if (messageEl !== null) {
      messageEl.textContent = message;
    }
    banner.dataset.tone = options.tone ?? 'info';
    banner.classList.toggle('notice-banner--warning', options.kind === 'warning');

    const actionsEl = banner.querySelector('.notice-banner__actions');
    if (actionsEl !== null) {
      actionsEl.replaceChildren();
      const list: BannerAction[] =
        options.actions ??
        (options.actionLabel !== undefined && options.onAction !== undefined
          ? [{ label: options.actionLabel, onClick: options.onAction }]
          : []);
      for (const item of list) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'notice-banner__action';
        button.textContent = item.label;
        button.addEventListener('click', item.onClick);
        actionsEl.appendChild(button);
      }
    }
  }

  function clearBanner(id: string): void {
    const banner = banners.get(id);
    if (banner !== undefined) {
      banner.remove();
      banners.delete(id);
    }
  }

  function clearBannersByPrefix(prefix: string): void {
    for (const id of [...banners.keys()]) {
      if (id.startsWith(prefix)) {
        clearBanner(id);
      }
    }
  }

  function toast(message: string, tone: NoticeTone = 'info'): void {
    const el = document.createElement('div');
    el.className = 'notice-toast';
    el.dataset.tone = tone;
    el.textContent = message;
    toastHost.appendChild(el);
    window.setTimeout(() => {
      el.remove();
    }, TOAST_TTL_MS);
  }

  return { showBanner, clearBanner, clearBannersByPrefix, toast };
}
