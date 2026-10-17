import { aggregateCameras } from '../../../lib/aggregateCameras';
import { GET as SG } from './singapore/route';
import { GET as JP } from './japan/route';
import { GET as KR } from './south-korea/route';
import { GET as TW } from './taiwan/route';
import { GET as TH } from './thailand/route';

const PROVIDERS = { SG, JP, KR, TW, TH };

export async function GET(request: Request) {
  return aggregateCameras(request, PROVIDERS);
}
