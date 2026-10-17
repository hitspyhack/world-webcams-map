import { aggregateCameras } from '../../../lib/aggregateCameras';
import { GET as FI } from './finland/route';
import { GET as EE } from './estonia/route';
import { GET as GB } from './uk/route';
import { GET as SE } from './sweden/route';
import { GET as NO } from './norway/route';
import { GET as PT } from './portugal/route';
import { GET as DE } from './germany/route';
import { GET as FR } from './france/route';
import { GET as ES } from './spain/route';
import { GET as NL } from './netherlands/route';
import { GET as AT } from './austria/route';
import { GET as CH } from './switzerland/route';
import { GET as IT } from './italy/route';
import { GET as DK } from './denmark/route';
import { GET as BE } from './belgium/route';
import { GET as PL } from './poland/route';
import { GET as EU } from './overpass-roads/route';

const PROVIDERS = { FI, EE, GB, SE, NO, PT, DE, FR, ES, NL, AT, CH, IT, DK, BE, PL, EU };

export async function GET(request: Request) {
  return aggregateCameras(request, PROVIDERS);
}
