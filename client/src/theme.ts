import type { ThemeConfig } from 'antd';

export const theme: ThemeConfig = {
  token: {
    colorPrimary: '#4A90D9',
    colorInfo: '#4A90D9',
    colorSuccess: '#52C41A',
    colorWarning: '#FAAD14',
    colorError: '#FF4D4F',
    borderRadius: 6,
    fontFamily: '-apple-system, "Microsoft YaHei", "PingFang SC", sans-serif',
    fontSize: 14,
    colorBgContainer: '#FFFFFF',
    colorBgLayout: '#F0F5FF',
  },
  components: {
    Layout: {
      headerBg: '#E6F0FA',
      siderBg: '#FFFFFF',
      bodyBg: '#F0F5FF',
      headerHeight: 56,
      headerPadding: '0 24px',
    },
    Menu: {
      itemBg: '#FFFFFF',
      itemActiveBg: '#E6F0FA',
      itemSelectedBg: '#D6E8FA',
      itemSelectedColor: '#4A90D9',
    },
    Button: {
      primaryShadow: '0 2px 6px rgba(74, 144, 217, 0.3)',
    },
    Card: {
      paddingLG: 20,
    },
    Table: {
      headerBg: '#E6F0FA',
      headerColor: '#1A3359',
    },
    Tag: {
      defaultBg: '#E6F0FA',
      defaultColor: '#4A90D9',
    },
  },
};
