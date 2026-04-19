export default function formatDateTime(value) {
  if (!value) {
    return '';
  }

  const text = String(value).trim();
  if (!text) {
    return '';
  }

  return text
    .replace('T', ' ')
    .replace(/\.\d+/, '')
    .replace(/(Z|[+-]\d{2}:\d{2})$/, '');
}
