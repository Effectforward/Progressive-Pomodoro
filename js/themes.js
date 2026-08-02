import { state } from './state.js';
import { loadThemeName, saveThemeName } from './storage.js';

export const THEME_META = {
  pastel: {
    name: 'Pastel Linen',
    icon: 'ph-fill ph-flower-lotus',
    colors: {
      bg: '#FDF9F1', card: '#FFFFFF', text: '#5C5449', muted: '#756B5C',
      accent: '#F2A2A2', accentHover: '#E89090', ringBg: '#F5EDE4', border: '#F5EDE4',
      btnText: '#FFFFFF', radius: '24px', radiusSm: '12px',
      shadow: '0 10px 30px rgba(0, 0, 0, 0.03)'
    },
    themeColor: '#F2A2A2'
  },
  light: {
    name: 'Soft Slate',
    icon: 'ph-fill ph-sun',
    colors: {
      bg: '#F9FAFB', card: '#FFFFFF', text: '#1F2937', muted: '#6B7280',
      accent: '#6366F1', accentHover: '#4F46E5', ringBg: '#E5E7EB', border: '#E5E7EB',
      btnText: '#FFFFFF', radius: '16px', radiusSm: '8px',
      shadow: '0 4px 20px rgba(0, 0, 0, 0.05)'
    },
    themeColor: '#6366F1'
  },
  zen: {
    name: 'Zen Graphite',
    icon: 'ph-fill ph-leaf',
    colors: {
      bg: '#F4F4F0', card: '#FFFFFF', text: '#222222', muted: '#7A7A7A',
      accent: '#555555', accentHover: '#333333', ringBg: '#EBEBEB', border: '#E0E0DC',
      btnText: '#FFFFFF', radius: '12px', radiusSm: '6px',
      shadow: '0 1px 4px rgba(0, 0, 0, 0.05)'
    },
    themeColor: '#555555'
  },
  dark: {
    name: 'Midnight Ink',
    icon: 'ph-fill ph-moon',
    colors: {
      bg: '#121212', card: '#1E1E1E', text: '#F3F4F6', muted: '#9CA3AF',
      accent: '#6366F1', accentHover: '#818CF8', ringBg: '#374151', border: '#374151',
      btnText: '#FFFFFF', radius: '20px', radiusSm: '10px',
      shadow: '0 12px 36px rgba(0, 0, 0, 0.5)'
    },
    themeColor: '#121212'
  },
  desert: {
    name: 'Desert Linen',
    icon: 'ph-fill ph-sun-horizon',
    colors: {
      bg: '#FBF5DD', card: '#E7E1B1', text: '#530E0E', muted: '#7A5E45',
      accent: '#B46A2A', accentHover: '#934E1B', ringBg: '#EEDFB9', border: '#DCCB9B',
      btnText: '#FFFFFF', radius: '24px', radiusSm: '12px',
      shadow: '0 10px 30px rgba(83, 14, 14, 0.08)'
    },
    themeColor: '#B46A2A'
  },
  midnightSlate: {
    name: 'Midnight Slate',
    icon: 'ph-fill ph-moon-stars',
    colors: {
      bg: '#222831', card: '#31363F', text: '#EEEEEE', muted: '#A7B0BC',
      accent: '#5E969A', accentHover: '#5E969A', ringBg: '#3E4650', border: '#3E4650',
      btnText: '#FFFFFF', radius: '18px', radiusSm: '10px',
      shadow: '0 12px 36px rgba(0, 0, 0, 0.35)'
    },
    themeColor: '#222831'
  }
};

export const THEME_ORDER = ['pastel', 'light', 'zen', 'dark', 'desert', 'midnightSlate'];

export function setTheme(themeKey) {
  if (!THEME_META[themeKey]) return;
  state.theme = themeKey;
  document.body.setAttribute('data-theme', themeKey);

  const { colors, themeColor } = THEME_META[themeKey];
  const root = document.documentElement;
  root.style.setProperty('--bg', colors.bg);
  root.style.setProperty('--card', colors.card);
  root.style.setProperty('--text', colors.text);
  root.style.setProperty('--muted', colors.muted);
  root.style.setProperty('--accent', colors.accent);
  root.style.setProperty('--accent-hover', colors.accentHover);
  root.style.setProperty('--ring-bg', colors.ringBg);
  root.style.setProperty('--border', colors.border);
  root.style.setProperty('--btn-text', colors.btnText);
  root.style.setProperty('--radius', colors.radius);
  root.style.setProperty('--radius-sm', colors.radiusSm);
  root.style.setProperty('--shadow', colors.shadow);
  root.style.setProperty('color-scheme', (themeKey === 'dark' || themeKey === 'midnightSlate') ? 'dark' : 'light');

  const themeColorMeta = document.getElementById('themeColorMeta');
  if (themeColorMeta) themeColorMeta.setAttribute('content', themeColor);

  buildThemeMenu();
  saveThemeName(themeKey);
}

export function buildThemeMenu() {
  const grid = document.getElementById('themePickerGrid');
  if (!grid) return;
  grid.innerHTML = '';
  THEME_ORDER.forEach(themeKey => {
    const themeData = THEME_META[themeKey];
    if (!themeData) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'theme-picker-btn';
    button.dataset.setTheme = themeKey;
    const isActive = themeKey === state.theme;
    if (isActive) button.classList.add('active');
    button.innerHTML = `<i class="${themeData.icon}"></i><span>${themeData.name}</span>`;
    grid.appendChild(button);
  });
}

export function initTheme() {
  loadThemeName();
  if (!THEME_META[state.theme]) state.theme = 'pastel';
  buildThemeMenu();
  setTheme(state.theme);
}
