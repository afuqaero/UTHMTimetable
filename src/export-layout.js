const MOBILE_EXPORT_WIDTH = 645;

export const getMobileExportLayout = (dayCount = 5) => {
  const timeColumnWidth = 140;
  const dayColumnWidth = Math.floor((MOBILE_EXPORT_WIDTH - timeColumnWidth) / dayCount);

  return {
    exportWidth: MOBILE_EXPORT_WIDTH,
    timeColumnWidth,
    dayColumnWidth,
  };
};
