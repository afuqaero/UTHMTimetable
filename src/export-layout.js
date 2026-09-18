const MOBILE_EXPORT_WIDTH = 645;

export const getMobileExportLayout = (timeFormat = '24h', dayCount = 5) => {
  const timeColumnWidth = timeFormat === '12h' ? 140 : 70;
  const dayColumnWidth = Math.floor((MOBILE_EXPORT_WIDTH - timeColumnWidth) / dayCount);

  return {
    exportWidth: MOBILE_EXPORT_WIDTH,
    timeColumnWidth,
    dayColumnWidth,
  };
};
