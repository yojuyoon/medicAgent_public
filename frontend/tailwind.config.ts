import type { Config } from 'tailwindcss';

const spacing = (): Record<number, string> => {
  const baseFontSize = 16; // 1rem = 16px
  const maxValueInPx = 1200; // Maximum value in pixels
  const remValues: Record<number, string> = {};

  const maxRemValue = maxValueInPx / baseFontSize;

  for (let pxValue = 0; pxValue <= maxValueInPx; pxValue++) {
    const remValue = pxValue / baseFontSize;
    remValues[pxValue] = `${
      remValue <= maxRemValue ? remValue : maxRemValue
    }rem`;
  }

  return remValues;
};

export default {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      spacing: spacing(),
      animation: {
        blob: 'blob 7s infinite',
      },
      keyframes: {
        blob: {
          '0%': {
            transform: 'translate(0px, 0px) scale(1)',
          },
          '33%': {
            transform: 'translate(30px, -50px) scale(1.1)',
          },
          '66%': {
            transform: 'translate(-20px, 20px) scale(0.9)',
          },
          '100%': {
            transform: 'translate(0px, 0px) scale(1)',
          },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
