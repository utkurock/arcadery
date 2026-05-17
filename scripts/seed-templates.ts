/**
 * Seed / re-seed the public.templates table from scripts/templates/scenes.ts.
 *
 * Usage:
 *   pnpm seed:templates
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from apps/web/.env.local.
 * For each template, deletes any existing row with the same name then inserts the fresh
 * scene JSON. Safe to run repeatedly.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { TEMPLATE_SCENES } from './templates/scenes';

// Load .env.local manually (avoid pulling in dotenv as a dep)
function loadEnv(path: string): Record<string, string> {
  try {
    const content = readFileSync(path, 'utf-8');
    const env: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) env[m[1]] = m[2].trim();
    }
    return env;
  } catch {
    return {};
  }
}

const envPath = join(process.cwd(), 'apps/web/.env.local');
const fileEnv = loadEnv(envPath);
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? fileEnv.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? fileEnv.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  console.error('  Set them in apps/web/.env.local or as environment variables.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log(`\n  Seeding ${TEMPLATE_SCENES.length} templates → ${SUPABASE_URL}\n`);

  let inserted = 0;
  let updated = 0;

  for (const t of TEMPLATE_SCENES) {
    // Find existing by name
    const { data: existing } = await supabase
      .from('templates')
      .select('id')
      .eq('name', t.name)
      .maybeSingle<{ id: string }>();

    if (existing) {
      const { error } = await supabase
        .from('templates')
        .update({
          description: t.description,
          category: t.category,
          scene: t.scene,
        })
        .eq('id', existing.id);
      if (error) {
        console.error(`  ✗ Update failed for "${t.name}": ${error.message}`);
        continue;
      }
      console.log(`  ↻ Updated  ${t.name}`);
      updated++;
    } else {
      const { error } = await supabase.from('templates').insert({
        name: t.name,
        description: t.description,
        category: t.category,
        scene: t.scene,
      });
      if (error) {
        console.error(`  ✗ Insert failed for "${t.name}": ${error.message}`);
        continue;
      }
      console.log(`  + Inserted ${t.name}`);
      inserted++;
    }
  }

  console.log(`\n  Done. ${inserted} inserted, ${updated} updated.\n`);
}

main().catch((err) => {
  console.error('\n  ✗ Seed failed:', err);
  process.exit(1);
});
