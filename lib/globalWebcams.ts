import type { GlobeCam } from '../components/GlobeView';

/** Hand-curated public operator pages, not scraped or claimed to be verified live.
 * Directory coordinates are approximate regional context, never camera positions.
 * No third-party image or stream URLs are invented for these entries.
 */
const records: Array<[string, string, string, number, number, string, 'provider' | 'directory', string[]]> = [
  ['Yosemite National Park webcams', 'US', 'North America', 37.745, -119.594, 'https://www.nps.gov/yose/learn/photosmultimedia/webcams.htm', 'directory', ['nature', 'mountain']],
  ['Yellowstone National Park webcams', 'US', 'North America', 44.46, -110.828, 'https://www.nps.gov/yell/learn/photosmultimedia/webcams.htm', 'directory', ['nature', 'volcano']],
  ['Grand Canyon National Park webcams', 'US', 'North America', 36.06, -112.14, 'https://www.nps.gov/grca/learn/photosmultimedia/webcams.htm', 'directory', ['nature']],
  ['Hawaiʻi Volcanoes webcams', 'US', 'North America', 19.421, -155.287, 'https://www.usgs.gov/observatories/hvo/webcams', 'directory', ['volcano', 'science']],
  ['Alaska volcano webcams', 'US', 'North America', 61.22, -149.9, 'https://avo.alaska.edu/webcam', 'directory', ['volcano', 'science']],
  ['Banff National Park webcams', 'CA', 'North America', 51.18, -115.57, 'https://www.banfflakelouise.com/webcams', 'directory', ['mountain', 'tourism']],
  ['Mexico public tourism webcams', 'MX', 'North America', 19.43, -99.13, 'https://webcamsdemexico.com/', 'directory', ['city', 'tourism']],
  ['Costa Rica volcano monitoring', 'CR', 'North America', 9.98, -84.19, 'https://www.ovsicori.una.ac.cr/', 'directory', ['volcano', 'science']],
  ['Rio de Janeiro public webcams', 'BR', 'South America', -22.97, -43.18, 'https://www.skylinewebcams.com/en/webcam/brasil.html', 'directory', ['beach', 'tourism']],
  ['Chile public webcams', 'CL', 'South America', -33.45, -70.67, 'https://www.skylinewebcams.com/en/webcam/chile.html', 'directory', ['mountain', 'tourism']],
  ['Argentina public webcams', 'AR', 'South America', -34.6, -58.38, 'https://www.skylinewebcams.com/en/webcam/argentina.html', 'directory', ['city', 'tourism']],
  ['Peru public webcams', 'PE', 'South America', -12.05, -77.04, 'https://www.skylinewebcams.com/en/webcam/peru.html', 'directory', ['city', 'tourism']],
  ['Portugal public webcams', 'PT', 'Europe', 38.72, -9.14, 'https://www.skylinewebcams.com/en/webcam/portugal.html', 'directory', ['coast', 'tourism']],
  ['Norway road cameras', 'NO', 'Europe', 59.91, 10.75, 'https://www.vegvesen.no/trafikk/', 'directory', ['traffic', 'weather']],
  ['Iceland road conditions and webcams', 'IS', 'Europe', 64.15, -21.94, 'https://umferdin.is/en', 'directory', ['traffic', 'weather']],
  ['Switzerland panoramic webcams', 'CH', 'Europe', 46.82, 8.23, 'https://www.roundshot.com/', 'directory', ['mountain', 'panorama']],
  ['European alpine photo webcams', 'AT', 'Europe', 47.27, 11.4, 'https://www.foto-webcam.eu/', 'directory', ['mountain', 'weather']],
  ['South African national park webcams', 'ZA', 'Africa', -24.99, 31.59, 'https://www.sanparks.org/webcams', 'directory', ['wildlife', 'nature']],
  ['African wildlife cameras', 'ZA', 'Africa', -24.79, 31.49, 'https://www.africam.com/', 'directory', ['wildlife']],
  ['Kenya public webcams', 'KE', 'Africa', -1.29, 36.82, 'https://www.skylinewebcams.com/en/webcam/kenya.html', 'directory', ['wildlife', 'tourism']],
  ['Cape Verde public webcams', 'CV', 'Africa', 16.89, -24.99, 'https://www.skylinewebcams.com/en/webcam/cape-verde.html', 'directory', ['coast', 'tourism']],
  ['Japan Meteorological Agency volcano cameras', 'JP', 'Asia', 35.68, 139.76, 'https://www.data.jma.go.jp/vois/data/tokyo/STOCK/livecam/livecam.php', 'directory', ['volcano', 'science']],
  ['Hong Kong Observatory weather photos', 'HK', 'Asia', 22.3, 114.17, 'https://www.hko.gov.hk/en/wxinfo/ts/webcam.htm', 'directory', ['weather']],
  ['Taiwan road cameras', 'TW', 'Asia', 25.03, 121.56, 'https://1968.freeway.gov.tw/', 'directory', ['traffic']],
  ['Thailand public webcams', 'TH', 'Asia', 13.76, 100.5, 'https://www.skylinewebcams.com/en/webcam/thailand.html', 'directory', ['beach', 'tourism']],
  ['Bali public webcams', 'ID', 'Asia', -8.65, 115.22, 'https://www.skylinewebcams.com/en/webcam/indonesia.html', 'directory', ['beach', 'tourism']],
  ['Sydney Harbour webcam', 'AU', 'Oceania', -33.85, 151.21, 'https://www.webcamsydney.com/', 'provider', ['coast', 'city']],
  ['New Zealand GeoNet volcano cameras', 'NZ', 'Oceania', -38.12, 176.26, 'https://www.geonet.org.nz/volcano/cameras', 'directory', ['volcano', 'science']],
  ['Australian Antarctic Division webcams', 'AQ', 'Antarctica', -66.28, 110.53, 'https://www.antarctica.gov.au/antarctic-operations/webcams/', 'directory', ['polar', 'science']],
  ['NOAA South Pole webcam', 'AQ', 'Antarctica', -90, 0, 'https://gml.noaa.gov/obop/spo/livecamera.html', 'provider', ['polar', 'weather', 'science']],
  ['Neumayer Station III webcam', 'AQ', 'Antarctica', -70.67, -8.27, 'https://www.awi.de/en/expedition/stations/neumayer-station-iii/webcam.html', 'provider', ['polar', 'science']],
  ['British Antarctic Survey Rothera webcam', 'AQ', 'Antarctica', -67.57, -68.13, 'https://www.bas.ac.uk/data/our-data/images/webcams/rothera-webcam/', 'provider', ['polar', 'science']],
];

export const GLOBAL_WEBCAMS: GlobeCam[] = records.map(([title, country, continent, lat, lon, linkUrl, mediaKind, categories], index) => ({
  title, country, continent, lat, lon, linkUrl, mediaKind, categories,
  source: 'global', color: '#2dd4bf', id: `global-${index + 1}`,
  positionPrecision: mediaKind === 'directory' ? 'regional' : 'approximate',
  description: mediaKind === 'directory' ? 'Public operator directory. Pin marks an approximate regional reference, not an individual camera.' : 'Public webcam provider page. Location is approximate; live availability has not been verified.',
}));
