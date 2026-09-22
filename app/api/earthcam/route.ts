import { NextResponse } from 'next/server';

// EarthCam does not have a public REST API.
// imageUrl fields reference images.earthcam.com — this CDN blocks server-side
// requests (returns 000/connection refused) but serves fine in <img> tags in the browser.
// The front-end should use imageUrl directly in <img src> and fall back gracefully
// on load error (the map popup already does this).
export async function GET() {
  const cams = [
    { id: 'ec-times-square', title: 'Times Square, New York',        lat: 40.758,   lon: -73.9855, country: 'US', city: 'New York',       embedUrl: 'https://www.earthcam.com/usa/newyork/timessquare/?cam=tsrobo1',             imageUrl: 'https://images.earthcam.com/ec_metros/ourcams/tsrobo1.jpg' },
    { id: 'ec-hollywood',     title: 'Hollywood Walk of Fame',        lat: 34.1016,  lon: -118.3267,country: 'US', city: 'Los Angeles',    embedUrl: 'https://www.earthcam.com/usa/california/losangeles/hollywoodblvd/?cam=hollywood_walk', imageUrl: 'https://images.earthcam.com/ec_metros/ourcams/hollywoodblvd.jpg' },
    { id: 'ec-chicago',       title: 'Chicago Riverwalk',             lat: 41.8858,  lon: -87.6265, country: 'US', city: 'Chicago',        embedUrl: 'https://www.earthcam.com/usa/illinois/chicago/?cam=chicago',               imageUrl: 'https://images.earthcam.com/ec_metros/ourcams/chicago.jpg' },
    { id: 'ec-miami',         title: 'Miami Beach',                   lat: 25.7907,  lon: -80.13,   country: 'US', city: 'Miami',          embedUrl: 'https://www.earthcam.com/usa/florida/miamibeach/?cam=miamibeach',          imageUrl: 'https://images.earthcam.com/ec_metros/ourcams/miamibeach.jpg' },
    { id: 'ec-dublin',        title: 'Temple Bar, Dublin',            lat: 53.3454,  lon: -6.2672,  country: 'IE', city: 'Dublin',         embedUrl: 'https://www.earthcam.com/world/ireland/dublin/?cam=templebar',             imageUrl: 'https://images.earthcam.com/ec_metros/ourcams/templebar.jpg' },
    { id: 'ec-sydney',        title: 'Sydney Harbour',                lat: -33.8568, lon: 151.2153, country: 'AU', city: 'Sydney',         embedUrl: 'https://www.earthcam.com/world/australia/sydney/?cam=sydney',              imageUrl: 'https://images.earthcam.com/ec_metros/ourcams/sydney.jpg' },
    { id: 'ec-paris',         title: 'Eiffel Tower, Paris',           lat: 48.8584,  lon: 2.2945,   country: 'FR', city: 'Paris',          embedUrl: 'https://www.earthcam.com/world/france/paris/?cam=eiffel_tower',           imageUrl: 'https://images.earthcam.com/ec_metros/ourcams/eiffeltower.jpg' },
    { id: 'ec-london',        title: 'Tower Bridge, London',          lat: 51.5055,  lon: -0.0754,  country: 'GB', city: 'London',         embedUrl: 'https://www.earthcam.com/world/england/london/?cam=towerbridgelive',      imageUrl: 'https://images.earthcam.com/ec_metros/ourcams/towerbridge.jpg' },
    { id: 'ec-rome',          title: 'Trevi Fountain, Rome',          lat: 41.9009,  lon: 12.4833,  country: 'IT', city: 'Rome',           embedUrl: 'https://www.earthcam.com/world/italy/rome/?cam=trevifountain',            imageUrl: 'https://images.earthcam.com/ec_metros/ourcams/trevifountain.jpg' },
    { id: 'ec-barcelona',     title: 'La Rambla, Barcelona',          lat: 41.3797,  lon: 2.1727,   country: 'ES', city: 'Barcelona',      embedUrl: 'https://www.earthcam.com/world/spain/barcelona/?cam=barcelona',           imageUrl: 'https://images.earthcam.com/ec_metros/ourcams/barcelona.jpg' },
    { id: 'ec-amsterdam',     title: 'Amsterdam Canal',               lat: 52.3676,  lon: 4.9041,   country: 'NL', city: 'Amsterdam',      embedUrl: 'https://www.earthcam.com/world/netherlands/amsterdam/?cam=amsterdam',     imageUrl: 'https://images.earthcam.com/ec_metros/ourcams/amsterdam.jpg' },
    { id: 'ec-prague',        title: 'Old Town Square, Prague',       lat: 50.0875,  lon: 14.4213,  country: 'CZ', city: 'Prague',         embedUrl: 'https://www.earthcam.com/world/czechrepublic/prague/?cam=prague',         imageUrl: 'https://images.earthcam.com/ec_metros/ourcams/prague.jpg' },
    { id: 'ec-tokyo',         title: 'Shibuya Crossing, Tokyo',       lat: 35.6595,  lon: 139.7005, country: 'JP', city: 'Tokyo',          embedUrl: 'https://www.earthcam.com/world/japan/tokyo/?cam=shibuya',                 imageUrl: 'https://images.earthcam.com/ec_metros/ourcams/shibuya.jpg' },
    { id: 'ec-hongkong',      title: 'Victoria Harbour, Hong Kong',   lat: 22.2855,  lon: 114.1577, country: 'HK', city: 'Hong Kong',      embedUrl: 'https://www.earthcam.com/world/hongkong/?cam=hongkong',                   imageUrl: 'https://images.earthcam.com/ec_metros/ourcams/hongkong.jpg' },
    { id: 'ec-niagara',       title: 'Niagara Falls',                 lat: 43.0799,  lon: -79.0747, country: 'CA', city: 'Niagara Falls',  embedUrl: 'https://www.earthcam.com/canada/ontario/niagarafalls/?cam=niagarafalls_wide', imageUrl: 'https://images.earthcam.com/ec_metros/ourcams/niagarafalls.jpg' },
  ];

  return NextResponse.json(cams, { status: 200 });
}
