// Optional production UI smoke test. All external providers are mocked.
// See docs/OSINT_WORKSPACE.md for setup.
const { chromium: pw } = require('playwright');
const crypto = require('node:crypto');
const fs = require('node:fs');
const baseUrl = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3000';
const { unzipSync, strFromU8 } = require('fflate');
const assert = require('node:assert/strict');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
(async () => {
 let launch = { headless: true };
 if (process.env.CHROMIUM_EXECUTABLE_PATH) launch.executablePath = process.env.CHROMIUM_EXECUTABLE_PATH;
 else if (process.env.USE_SPARTICUZ === '1') {
  const pack = require('@sparticuz/chromium');
  const chromium = pack.default;
  await pack.inflate(require('node:path').resolve('node_modules/@sparticuz/chromium/bin/al2023.tar.br'));
  process.env.LD_LIBRARY_PATH = ['/tmp/al2023/lib', process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
  launch = { ...launch, executablePath: await chromium.executablePath(), args: chromium.args };
 }
 const browser=await pw.launch(launch);
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*', async route => {
  const url=new URL(route.request().url());
  if(url.origin!==new URL(baseUrl).origin) {
   if(url.pathname.match(/\.(jpg|png|webp)$/i)) return route.fulfill({body:png,contentType:'image/png',headers:{'Access-Control-Allow-Origin':'*'}});
   return route.abort();
  }
  if(url.pathname==='/api/windy-webcams') {
   if(url.searchParams.get('bbox')==='38,55,-35,-20') return route.fulfill({json:{webcams:[{webcamId:'browser-test',title:'Test Windy harbour',location:{latitude:0,longitude:0,country:'GH'},images:{current:{preview:'https://camera.example/snapshot.png'}},mediaKind:'snapshot',urls:{webcam:'https://www.windy.com/webcams/browser-test'}}],total:1,nextOffset:null}});
   return route.fulfill({json:{webcams:[],missingKey:true}});
  }
  if(url.pathname.startsWith('/api/')&&!['/api/global-webcams','/api/earthcam','/api/deckchair','/api/asia-tourism','/api/google-view'].includes(url.pathname)) return route.fulfill({json:[]});
  return route.continue();
 });
 await page.goto(baseUrl);
 await page.getByRole('button',{name:/Pause rotation/}).waitFor();
 await page.getByRole('button',{name:/Explore cameras/}).click();
 await page.getByRole('searchbox').fill('NOAA South Pole');
 await page.getByRole('button',{name:'NOAA South Pole webcam',exact:true}).click();
 await page.getByRole('button',{name:'Google satellite',exact:true}).click();
 await page.getByText(/Embedded Google view needs/).waitFor();
 assert.equal(await page.getByRole('link',{name:'Earth ↗',exact:true}).count(),1);
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Windy',exact:true}).click();
 await page.locator('.windy-catalog select').first().selectOption('africa');
 await page.getByRole('button',{name:'Load 50 Windy cameras',exact:true}).click();
 await page.getByText(/1 cameras received/).waitFor();
 await page.getByRole('button',{name:'Discover',exact:true}).click();
 await page.getByRole('searchbox').fill('Test Windy');
 await page.getByRole('button',{name:'Test Windy harbour',exact:true}).click();
 await page.getByRole('img',{name:'Test Windy harbour'}).waitFor();
 const downloaded=page.waitForEvent('download');
 await page.getByRole('button',{name:'Capture image + SHA-256 manifest',exact:true}).click();
 const download=await downloaded;
 const stream=await download.createReadStream();const chunks=[];for await(const c of stream)chunks.push(c);
 const archive=unzipSync(Buffer.concat(chunks));const manifest=JSON.parse(strFromU8(archive['manifest.json']));
 assert.equal(manifest.title,'Test Windy harbour');assert.equal(manifest.file.sha256,crypto.createHash('sha256').update(archive[manifest.file.name]).digest('hex'));assert.equal(manifest.coordinates.latitude,0);
 await page.getByRole('button',{name:'Refresh snapshot',exact:true}).click();
 await page.getByText(/Snapshot re-requested/).waitFor();
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Locate Test Windy harbour on map',exact:true}).click();
 await page.locator('.leaflet-container').waitFor({state:'visible'});
 assert.equal(await page.locator('.leaflet-marker-icon').count()>0,true);
 await page.getByRole('button',{name:/GLOBE/}).click();
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:/Explore cameras/}).click();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 fs.mkdirSync('.cache', { recursive: true });
 await page.screenshot({path:'.cache/osint-mobile.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS: globe, polar public directory, Google fallback, regional Windy discovery, SHA-256 capture ZIP, snapshot refresh, map navigation and mobile overflow. External providers were mocked.');
 await browser.close();
})().catch(error=>{console.error(error);process.exit(1)});
