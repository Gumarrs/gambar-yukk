export default {
  theme: {
    extend: {
      colors: {
        ink: '#2B2D42',
        cream: '#FFF8EC',
        sun: '#FFC93C',
        coral: '#FF6B6B',
        sky: '#4D96FF',
        mint: '#6BCB77',
        grape: '#9B5DE5',
        peach: '#FFB38A'
      },
      fontFamily: {
        display: ['Fredoka', 'ui-rounded', 'system-ui', 'sans-serif'],
        body: ['Nunito', 'system-ui', 'sans-serif']
      },
      keyframes: {
        wiggle: { '0%,100%': { transform: 'rotate(-3deg)' }, '50%': { transform: 'rotate(3deg)' } },
        pop: {
          '0%': { transform: 'scale(.6)', opacity: '0' },
          '70%': { transform: 'scale(1.08)' },
          '100%': { transform: 'scale(1)', opacity: '1' }
        },
        floaty: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } }
      },
      animation: {
        wiggle: 'wiggle 1.2s ease-in-out infinite',
        pop: 'pop .35s ease-out both',
        floaty: 'floaty 3s ease-in-out infinite'
      }
    }
  }
}
