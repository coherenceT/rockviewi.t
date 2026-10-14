import { clear, h } from '../lib/dom';

const UNITS = [
  { key: 'days', label: 'Days' },
  { key: 'hours', label: 'Hours' },
  { key: 'minutes', label: 'Minutes' },
  { key: 'seconds', label: 'Seconds' },
] as const;

function splitRemaining(msRemaining: number) {
  const total = Math.max(0, Math.floor(msRemaining / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

export interface CountdownHandle {
  stop(): void;
}

/**
 * Counts down to the early-bird closing moment.
 *
 * Reads the closing timestamp from courses.json rather than a hard-coded date,
 * so changing the campaign date changes the countdown. The value is announced
 * politely to assistive technology only once a minute, not every second.
 */
export function startCountdown(targetIso: string, host: Element, onClosed?: () => void): CountdownHandle {
  const target = new Date(targetIso).getTime();
  const values = new Map<string, HTMLElement>();

  const list = h('ul', { class: 'countdown', attrs: { 'aria-label': 'Time left to apply at the early-bird fee' } });
  for (const unit of UNITS) {
    const value = h('span', { class: 'countdown__value', text: '0' });
    values.set(unit.key, value);
    list.appendChild(
      h('li', {}, value, h('span', { class: 'countdown__label', text: unit.label })),
    );
  }

  clear(host);
  host.appendChild(list);

  let stopped = false;

  const tick = () => {
    if (stopped) return;
    const remaining = target - Date.now();

    if (remaining <= 0) {
      values.forEach((node) => {
        node.textContent = '0';
      });
      stopped = true;
      onClosed?.();
      return;
    }

    const parts = splitRemaining(remaining);
    for (const unit of UNITS) {
      const node = values.get(unit.key);
      if (node) node.textContent = String(parts[unit.key]).padStart(unit.key === 'days' ? 1 : 2, '0');
    }
  };

  tick();
  const timer = window.setInterval(tick, 1000);

  return {
    stop() {
      stopped = true;
      window.clearInterval(timer);
    },
  };
}
