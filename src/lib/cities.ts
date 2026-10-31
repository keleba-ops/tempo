export const BOTSWANA_CITIES = [
  'Gaborone', 'Francistown', 'Maun', 'Kasane', 'Palapye', 'Serowe', 'Lobatse', 'Selebi-Phikwe', 'Molepolole',
  'Kanye', 'Mahalapye', 'Mogoditshane', 'Tlokweng', 'Ramotswa', 'Jwaneng', 'Orapa', 'Letlhakane', 'Ghanzi',
  'Tsabong', 'Shakawe', 'Other',
];

/** True when a business city matches the user's city (case-insensitive). */
export function sameCity(a: string | undefined, b: string | undefined): boolean {
  return Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());
}
