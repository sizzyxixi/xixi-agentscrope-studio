export type SalesSpecification = { name: string; options: string[] };

/** Read presentation-friendly option groups without rewriting the source JSON. */
export function productSalesSpecifications(value: unknown): SalesSpecification[] {
  const optionText = (option: unknown): string => {
    if (typeof option === 'string' || typeof option === 'number') return String(option).trim();
    if (option && typeof option === 'object' && 'value' in option) return optionText(option.value);
    return '';
  };
  const group = (name: unknown, options: unknown): SalesSpecification[] => {
    if (typeof name !== 'string' || !name.trim() || !Array.isArray(options)) return [];
    const values = [...new Set(options.map(optionText).filter(Boolean))];
    return values.length ? [{ name: name.trim(), options: values }] : [];
  };
  if (Array.isArray(value)) return value.flatMap(item => item && typeof item === 'object' ? group(item.name, item.options) : []);
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([name, options]) => group(name, options));
  return [];
}
