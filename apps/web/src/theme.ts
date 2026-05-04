import { createTheme } from '@mantine/core';

export const theme = createTheme({
  primaryColor: 'blue',
  defaultRadius: 'sm',
  headings: {
    fontWeight: '700'
  },
  components: {
    AppShell: {
      defaultProps: {
        header: { height: 72 },
        padding: 'lg'
      }
    },
    Paper: {
      defaultProps: {
        shadow: 'xs'
      }
    },
    Button: {
      defaultProps: {
        radius: 'sm'
      }
    },
    Badge: {
      defaultProps: {
        radius: 'sm'
      }
    },
    Card: {
      defaultProps: {
        radius: 'sm'
      }
    },
    SegmentedControl: {
      defaultProps: {
        radius: 'sm'
      }
    }
  }
});
