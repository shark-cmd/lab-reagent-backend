/** @type {import('tailwindcss').Config} */
module.exports = {
  // Must be 'class' (not the default 'media'): react-native-css-interop's web
  // runtime throws "Cannot manually set color scheme, as dark mode is type
  // 'media'" the moment NativeWind injects its stylesheet. The app is light-only
  // (app.json `userInterfaceStyle: "light"`) and never adds the `dark` class.
  darkMode: 'class',
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        ink: '#0B1220',
        muted: '#4B5563',
        page: '#F7FAFC',
        surface: '#FFFFFF',
        surface2: '#F1F6FA',
        line: '#D7E2EC',
        primary: '#0E7490',
        'primary-hover': '#155E75',
        'primary-soft': '#E6F6FA',
        accent: '#2563EB',
        'accent-soft': '#EAF2FF',
        success: '#1F7A4D',
        'success-soft': '#EAF7F0',
        'success-line': '#BFE6D0',
        warning: '#B45309',
        'warning-soft': '#FFF4E6',
        'warning-line': '#FFD7A8',
        danger: '#B42318',
        'danger-soft': '#FFE9E7',
        'danger-line': '#FFC2BC',
        'danger-deep': '#7A1B14',
        info: '#0B5CAD',
        'info-soft': '#E8F2FF',
        'info-line': '#BBD7FF',
        neutralsoft: '#EEF2F7',
        'neutral-line': '#D7E2EC',
        'neutral-fg': '#334155',
      },
      borderRadius: {
        xl2: '16px',
      },
      fontFamily: {
        heading: ['SpaceGrotesk_700Bold'],
        'heading-md': ['SpaceGrotesk_600SemiBold'],
        'heading-sm': ['SpaceGrotesk_500Medium'],
        sans: ['IBMPlexSans_400Regular'],
        'sans-md': ['IBMPlexSans_500Medium'],
        'sans-bold': ['IBMPlexSans_600SemiBold'],
        mono: ['IBMPlexMono_400Regular'],
        'mono-md': ['IBMPlexMono_500Medium'],
      },
    },
  },
  plugins: [],
};
