import { NextResponse } from 'next/server';
import { GLOBAL_WEBCAMS } from '../../../lib/globalWebcams';

export async function GET() {
  return NextResponse.json(GLOBAL_WEBCAMS, { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
