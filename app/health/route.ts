import { NextResponse } from 'next/server';

/**
 * Health check endpoint for production monitoring
 * Returns simple JSON response without database calls
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    app: 'ElectroHypeX',
    timestamp: new Date().toISOString(),
  });
}

