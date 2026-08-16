import { indonesiaDistricts } from '../data/indonesia-districts.ts';

const collator = new Intl.Collator('id-ID', { sensitivity: 'base', numeric: true });
const normalize = (value: string) => value
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('id-ID')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const districtIndex = Array.from(
  new Map(
    indonesiaDistricts.map(([district, city, province]) => [
      [district, city, province].map(normalize).join('|'),
      {
        district,
        city,
        province,
        normalizedDistrict: normalize(district),
        normalizedCity: normalize(city),
        normalizedSearch: normalize(`${district} ${city}`),
      },
    ]),
  ).values(),
);

export function searchDistrictCatalog(search: string, limit = 50) {
  const query = normalize(search);
  if (query.length < 2) return [];
  const queryTokens = query.split(' ');

  const wordStartsWith = (value: string) =>
    value.split(' ').some((word) => word.startsWith(query));
  const matchesAllTokens = (value: string) => {
    const words = value.split(' ');
    return queryTokens.every((token) =>
      words.some((word) => word.startsWith(token)),
    );
  };
  const rank = (
    normalizedDistrict: string,
    normalizedCity: string,
    normalizedSearch: string,
  ) => {
    if (normalizedDistrict === query) return 0;
    if (normalizedDistrict.startsWith(query)) return 1;
    if (wordStartsWith(normalizedDistrict)) return 2;
    if (normalizedCity === query) return 3;
    if (normalizedCity.startsWith(query)) return 4;
    if (wordStartsWith(normalizedCity)) return 5;
    if (matchesAllTokens(normalizedSearch)) return 6;
    return -1;
  };

  return districtIndex
    .map((item) => ({
      item,
      rank: rank(
        item.normalizedDistrict,
        item.normalizedCity,
        item.normalizedSearch,
      ),
    }))
    .filter(({ rank }) => rank >= 0)
    .sort((left, right) => {
      if (left.rank !== right.rank) return left.rank - right.rank;
      const district = collator.compare(left.item.district, right.item.district);
      if (district !== 0) return district;
      return collator.compare(left.item.city, right.item.city);
    })
    .slice(0, limit)
    .map(({ item }) => item);
}
