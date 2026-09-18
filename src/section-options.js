export const sections = Array.from({ length: 40 }, (_, index) => `S${index + 1}`);

export const getSectionOptions = (value = '') => {
  const enteredValue = String(value ?? '').trim();
  const query = enteredValue.toLowerCase();
  const options = sections.filter(section => section.toLowerCase().includes(query));
  const hasExactMatch = sections.some(section => section.toLowerCase() === query);

  return {
    options,
    customValue: enteredValue && !hasExactMatch ? enteredValue : null,
  };
};
